import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  Timestamp,
  type DocumentData,
  type QueryConstraint,
  where,
  writeBatch,
} from 'firebase/firestore';
import { signInAnonymously, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, db, googleProvider } from '../firebase';
import {
  CURRENT_SCHEMA_VERSION,
  FIRESTORE_COLLECTIONS,
  type NormalizedObservationCache,
  type Observation,
  type ObservationDraft,
  type ObservationSet,
  type ObservationSetDraft,
  type ObservationSetMembership,
  type ObservationSetView,
  type ObserverUser,
  type VisibilityType,
} from '../types';
import {
  assertMembership,
  assertObservation,
  assertObservationSet,
  buildObservationSetViews,
  createMembership,
  membershipDocumentId,
} from '../domain/observationDomain';
import { assertFirestoreDocumentIdentity } from '../domain/firestoreDocumentIdentity';
import {
  assertNormalizedObservationCache,
  buildObservationSetViewsFromNormalizedObservationCache,
  detachMembershipFromNormalizedObservationCache,
  emptyNormalizedObservationCache,
  mergeNormalizedObservationCache,
} from '../domain/normalizedObservationCache';
import {
  isFreshNormalizedCacheSnapshot,
} from '../domain/cachePolicy';
import {
  classifyRemoteReadError,
  isRemoteDataIntegrityError,
  isRecoverableRemoteReadError,
  selectRemoteResult,
  withRemoteDataIntegrity,
} from '../domain/remoteReadPolicy';
import {
  analyzeObservationInterchangeImport,
  createObservationInterchangeBundle,
  invalidObservationInterchangeImportDryRunReport,
  MAX_INTERCHANGE_RECORDS,
  parseObservationInterchangeBundle,
  type ObservationInterchangeBundle,
  type ObservationInterchangeImportDryRunReport,
} from '../domain/observationInterchange';
import {
  membershipProjectionQueryPlan,
  observationSetFeedQueryPlan,
  ownedObservationPickerQueryPlan,
  type FirestoreQueryPlan,
  type ObservationSetFeedMode,
} from './firestoreQueryPlan';
import { processImageToWebP } from '../utils/imageUtils';
import { generateId } from '../utils/idUtils';

const LOCAL_STORAGE_KEY_PREFIX = 'observer-2.normalized-cache.v2.';
const LOCAL_STORAGE_METADATA_KEY_PREFIX = 'observer-2.normalized-cache-meta.v2.';
const MAX_NEW_MEMBERSHIPS_PER_CLIENT_BATCH = 9;
type RemoteReadMode = 'cache-fallback' | 'remote-required';

// User Auth Helpers
export async function loginWithGoogle(): Promise<ObserverUser> {
  const result = await signInWithPopup(auth, googleProvider);
  return formatUser(result.user);
}

export async function loginAnonymously(): Promise<ObserverUser> {
  const result = await signInAnonymously(auth);
  return formatUser(result.user);
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export function formatUser(user: User): ObserverUser {
  return {
    uid: user.uid,
    displayName: user.displayName || (user.isAnonymous ? '匿名観測者' : '観測者'),
    photoURL: user.photoURL || undefined,
    email: user.email || undefined,
    isAnonymous: user.isAnonymous,
  };
}

function isoTimestamp(value: unknown, field: string, nullable = false): string | null {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  throw new Error(`${field} must be a Firestore timestamp or an ISO date-time string`);
}

function toFirestoreTimestamp(iso: string): Timestamp {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date-time: ${iso}`);
  return Timestamp.fromDate(date);
}

function normalizeOptionalFields<T extends Observation | ObservationSet>(entity: T): Record<string, unknown> {
  return {
    ...entity,
    observerName: entity.observerName ?? null,
    observerPhoto: entity.observerPhoto ?? null,
    imageUrl: entity.imageUrl ?? null,
    imagePath: entity.imagePath ?? null,
    location: entity.location ?? null,
    metadata: entity.metadata ?? {},
    createdAt: toFirestoreTimestamp(entity.createdAt),
    updatedAt: toFirestoreTimestamp(entity.updatedAt),
    deletedAt: entity.deletedAt === null ? null : toFirestoreTimestamp(entity.deletedAt),
  };
}

function membershipToFirestore(membership: ObservationSetMembership): Record<string, unknown> {
  return {
    ...membership,
    createdAt: toFirestoreTimestamp(membership.createdAt),
  };
}

function observationFromFirestore(id: string, data: DocumentData): Observation {
  return withRemoteDataIntegrity('Observation', id, () => {
    assertFirestoreDocumentIdentity(data, id, 'Observation');
    const observation: Observation = {
      ...(data as Omit<Observation, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>),
      id,
      createdAt: isoTimestamp(data.createdAt, 'Observation.createdAt')!,
      updatedAt: isoTimestamp(data.updatedAt, 'Observation.updatedAt')!,
      deletedAt: isoTimestamp(data.deletedAt, 'Observation.deletedAt', true),
    };
    assertObservation(observation);
    return observation;
  });
}

function observationSetFromFirestore(id: string, data: DocumentData): ObservationSet {
  return withRemoteDataIntegrity('ObservationSet', id, () => {
    assertFirestoreDocumentIdentity(data, id, 'ObservationSet');
    const observationSet: ObservationSet = {
      ...(data as Omit<ObservationSet, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>),
      id,
      createdAt: isoTimestamp(data.createdAt, 'ObservationSet.createdAt')!,
      updatedAt: isoTimestamp(data.updatedAt, 'ObservationSet.updatedAt')!,
      deletedAt: isoTimestamp(data.deletedAt, 'ObservationSet.deletedAt', true),
    };
    assertObservationSet(observationSet);
    return observationSet;
  });
}

function membershipFromFirestore(id: string, data: DocumentData): ObservationSetMembership {
  return withRemoteDataIntegrity('ObservationSetMembership', id, () => {
    assertFirestoreDocumentIdentity(data, id, 'ObservationSetMembership');
    const membership: ObservationSetMembership = {
      ...(data as Omit<ObservationSetMembership, 'id' | 'createdAt'>),
      id,
      createdAt: isoTimestamp(data.createdAt, 'ObservationSetMembership.createdAt')!,
    };
    assertMembership(membership);
    return membership;
  });
}

function toFirestoreQueryConstraints(plan: FirestoreQueryPlan): QueryConstraint[] {
  const constraints: QueryConstraint[] = [
    ...plan.filters.map((filter) => where(filter.fieldPath, filter.op, filter.value)),
    ...plan.orderBy.map((ordering) => orderBy(ordering.fieldPath, ordering.direction)),
  ];
  if (plan.limit !== undefined) constraints.push(limit(plan.limit));
  return constraints;
}

function cachePrincipalUid(principalUid?: string): string {
  const explicitPrincipal = principalUid?.trim();
  if (explicitPrincipal) return explicitPrincipal;
  const authenticatedPrincipal = auth.currentUser?.uid?.trim();
  return authenticatedPrincipal || 'anonymous';
}

function cacheStorageKey(prefix: string, principalUid?: string): string {
  return `${prefix}${encodeURIComponent(cachePrincipalUid(principalUid))}`;
}

function hasFreshLocalCacheSnapshot(principalUid?: string): boolean {
  const principal = cachePrincipalUid(principalUid);
  try {
    const raw = localStorage.getItem(cacheStorageKey(LOCAL_STORAGE_METADATA_KEY_PREFIX, principal));
    if (!raw) return false;
    return isFreshNormalizedCacheSnapshot(JSON.parse(raw), principal);
  } catch {
    return false;
  }
}

function getLocalCache(principalUid?: string): NormalizedObservationCache {
  try {
    const raw = localStorage.getItem(cacheStorageKey(LOCAL_STORAGE_KEY_PREFIX, principalUid));
    if (!raw) return emptyNormalizedObservationCache();
    const parsed = JSON.parse(raw) as unknown;
    assertNormalizedObservationCache(parsed);
    return parsed;
  } catch {
    return emptyNormalizedObservationCache();
  }
}

function saveLocalCache(cache: NormalizedObservationCache, principalUid?: string): void {
  try {
    assertNormalizedObservationCache(cache);
    const principal = cachePrincipalUid(principalUid);
    localStorage.setItem(cacheStorageKey(LOCAL_STORAGE_KEY_PREFIX, principal), JSON.stringify(cache));
    localStorage.setItem(
      cacheStorageKey(LOCAL_STORAGE_METADATA_KEY_PREFIX, principal),
      JSON.stringify({ principalUid: principal, storedAt: Date.now() }),
    );
  } catch (error) {
    console.warn('LocalStorage save failed:', error);
  }
}

function makeObservation(draft: ObservationDraft, fallback: Pick<ObservationSet, 'uid' | 'observerName' | 'observerPhoto' | 'visibility' | 'allowedEmails'>, now: string): Observation {
  const observation: Observation = {
    ...draft,
    id: draft.id ?? generateId(),
    uid: draft.uid ?? fallback.uid,
    observerName: draft.observerName ?? fallback.observerName,
    observerPhoto: draft.observerPhoto ?? fallback.observerPhoto,
    visibility: draft.visibility ?? fallback.visibility,
    allowedEmails: draft.visibility === 'shared' ? draft.allowedEmails : (draft.visibility ? [] : fallback.allowedEmails),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: draft.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
  assertObservation(observation);
  return observation;
}

function makeObservationSet(draft: ObservationSetDraft, imageUrl: string | undefined, now: string): ObservationSet {
  const { observations: _observations, ...setFields } = draft;
  const observationSet: ObservationSet = {
    ...setFields,
    id: setFields.id ?? generateId(),
    imageUrl,
    metadata: draft.metadata ?? {},
    allowedEmails: draft.visibility === 'shared' ? draft.allowedEmails : [],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: draft.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
  assertObservationSet(observationSet);
  return observationSet;
}

function cacheViews(cache: NormalizedObservationCache): ObservationSetView[] {
  return buildObservationSetViewsFromNormalizedObservationCache(cache);
}

function filterLocalViews(views: ObservationSetView[], filterMode: ObservationSetFeedMode, currentUserUid?: string, currentUserEmail?: string): ObservationSetView[] {
  return views.filter((view) => {
    if (filterMode === 'mine') return Boolean(currentUserUid && view.uid === currentUserUid);
    if (filterMode === 'authenticated') return view.visibility === 'authenticated';
    if (filterMode === 'shared') {
      return Boolean(currentUserEmail && view.visibility === 'shared' && view.allowedEmails.includes(currentUserEmail));
    }
    return view.visibility === 'public';
  });
}

async function fetchMembershipsForSets(observationSets: ObservationSet[]): Promise<ObservationSetMembership[]> {
  const memberships: ObservationSetMembership[] = [];
  for (const observationSet of observationSets) {
    try {
      const plan = membershipProjectionQueryPlan(observationSet.id, observationSet.uid);
      const snapshot = await getDocs(query(
        collection(db, plan.collection),
        ...toFirestoreQueryConstraints(plan),
      ));
      memberships.push(...snapshot.docs.map((snapshotDoc) => membershipFromFirestore(snapshotDoc.id, snapshotDoc.data())));
    } catch (error) {
      if (isRemoteDataIntegrityError(error)) throw error;
      // A set that was successfully read should also permit its membership
      // query. Do not silently turn a failed relation read into a partial view;
      // the caller may still choose a bounded cache fallback for a recoverable
      // transport failure.
      throw classifyRemoteReadError(error);
    }
  }
  return memberships;
}

async function fetchReadableObservations(memberships: ObservationSetMembership[]): Promise<Observation[]> {
  const uniqueIds = [...new Set(memberships.map((membership) => membership.observationId))];
  const entries = await Promise.all(uniqueIds.map(async (id) => {
    try {
      const snapshot = await getDoc(doc(db, FIRESTORE_COLLECTIONS.observations, id));
      return snapshot.exists() ? observationFromFirestore(snapshot.id, snapshot.data()) : null;
    } catch (error) {
      if (isRemoteDataIntegrityError(error)) throw error;
      // Independent ACL means a readable set does not make its observations readable.
      const classified = classifyRemoteReadError(error);
      if (classified.kind === 'permission-denied' || classified.kind === 'not-found') {
        console.warn(`Observation ${id} is not available in this view:`, classified);
        return null;
      }
      // A transport failure is not an ACL redaction. Abort the projection so a
      // partial remote result cannot be persisted or presented as complete.
      throw classified;
    }
  }));
  return entries.filter((entry): entry is Observation => entry !== null);
}

async function fetchFirestoreViews(
  filterMode: ObservationSetFeedMode,
  currentUserUid?: string,
  currentUserEmail?: string,
  resultLimit?: number,
): Promise<ObservationSetView[]> {
  const plan = observationSetFeedQueryPlan(filterMode, currentUserUid, currentUserEmail, resultLimit);
  if (!plan) return [];

  const setSnapshot = await getDocs(query(
    collection(db, plan.collection),
    ...toFirestoreQueryConstraints(plan),
  ));
  const observationSets = setSnapshot.docs.map((snapshotDoc) => observationSetFromFirestore(snapshotDoc.id, snapshotDoc.data()));
  const memberships = await fetchMembershipsForSets(observationSets);
  const observations = await fetchReadableObservations(memberships);
  return withRemoteDataIntegrity('ObservationSetView', filterMode, () => (
    buildObservationSetViews({ observationSets, observations, memberships })
  ));
}

/**
 * Creates a canonical set, its independent observations, and their explicit
 * memberships in one batch. The small batch limit preserves Firestore Rules
 * `getAfter()` access-call limits while rules validate every relation.
 */
export async function createObservation(draft: ObservationSetDraft): Promise<ObservationSetView> {
  if (draft.observations.length > MAX_NEW_MEMBERSHIPS_PER_CLIENT_BATCH) {
    throw new Error(`A client batch may create at most ${MAX_NEW_MEMBERSHIPS_PER_CLIENT_BATCH} memberships.`);
  }

  let processedImageUrl = draft.imageUrl;
  if (draft.imageUrl) {
    try {
      processedImageUrl = await processImageToWebP(draft.imageUrl, 1024, 768, 0.85);
    } catch (error) {
      console.warn('WebP image conversion fallback:', error);
    }
  }

  const now = new Date().toISOString();
  const observationSet = makeObservationSet(draft, processedImageUrl, now);
  const observations = draft.observations.map((observation) => makeObservation(observation, observationSet, now));
  const memberships = observations.map((observation, position) => createMembership({
    observationSet,
    observation,
    position,
    createdAt: now,
  }));

  if (auth.currentUser) {
    if (auth.currentUser.uid !== observationSet.uid) throw new Error('Authenticated owner does not match observation set owner.');
    const batch = writeBatch(db);
    batch.set(doc(db, FIRESTORE_COLLECTIONS.observationSets, observationSet.id), normalizeOptionalFields(observationSet));
    for (const observation of observations) {
      batch.set(doc(db, FIRESTORE_COLLECTIONS.observations, observation.id), normalizeOptionalFields(observation));
    }
    for (const membership of memberships) {
      batch.set(doc(db, FIRESTORE_COLLECTIONS.memberships, membership.id), membershipToFirestore(membership));
    }
    await batch.commit();
  }

  const updatedCache = mergeNormalizedObservationCache(getLocalCache(observationSet.uid), { observationSets: [observationSet], observations, memberships });
  saveLocalCache(updatedCache, observationSet.uid);
  return buildObservationSetViews({ observationSets: [observationSet], observations, memberships })[0];
}

/** Fetches a read-time projection; Firestore and local cache both remain normalized. */
export async function fetchObservations(
  filterMode: ObservationSetFeedMode,
  currentUserUid?: string,
  currentUserEmail?: string,
  resultLimit?: number,
  readMode: RemoteReadMode = 'cache-fallback',
): Promise<ObservationSetView[]> {
  const principalUid = currentUserUid ?? auth.currentUser?.uid;
  let remoteViews: ObservationSetView[] | undefined;
  try {
    const views = await fetchFirestoreViews(filterMode, currentUserUid, currentUserEmail, resultLimit);
    remoteViews = views;
    const cache = mergeNormalizedObservationCache(getLocalCache(principalUid), {
      observationSets: views,
      observations: views.flatMap((view) => view.observations),
      memberships: views.flatMap((view) => view.memberships),
    });
    saveLocalCache(cache, principalUid);
  } catch (error) {
    if (isRemoteDataIntegrityError(error)) throw error;
    const classified = classifyRemoteReadError(error);
    if (readMode === 'remote-required' || !isRecoverableRemoteReadError(classified)) {
      throw classified;
    }
    console.warn('Recoverable Firestore query error; evaluating the bounded v2 local cache:', classified);
  }
  return selectRemoteResult(
    remoteViews,
    () => (
      filterMode === 'mine'
      && Boolean(principalUid)
      && hasFreshLocalCacheSnapshot(principalUid)
        ? filterLocalViews(cacheViews(getLocalCache(principalUid)), filterMode, currentUserUid, currentUserEmail)
        : []
    ),
  );
}

/**
 * Lists the active canonical Observations that the signed-in owner may attach
 * to one of their ObservationSets. The query is deliberately owner-scoped;
 * feed visibility never acts as authority to create a Membership.
 */
export async function fetchOwnedActiveObservations(
  ownerUid: string,
  resultLimit = 100,
  readMode: RemoteReadMode = 'cache-fallback',
): Promise<Observation[]> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid) {
    throw new Error('The signed-in user must own the Observation attachment candidates.');
  }

  const plan = ownedObservationPickerQueryPlan(ownerUid, resultLimit);
  if (!plan) return [];

  let cache = getLocalCache(ownerUid);
  let remoteObservations: Observation[] | undefined;
  try {
    const snapshot = await getDocs(query(
      collection(db, plan.collection),
      ...toFirestoreQueryConstraints(plan),
    ));
    remoteObservations = snapshot.docs.map((snapshotDoc) => (
      observationFromFirestore(snapshotDoc.id, snapshotDoc.data())
    ));
    cache = mergeNormalizedObservationCache(cache, { observations: remoteObservations });
    saveLocalCache(cache, ownerUid);
  } catch (error) {
    if (isRemoteDataIntegrityError(error)) throw error;
    const classified = classifyRemoteReadError(error);
    if (readMode === 'remote-required' || !isRecoverableRemoteReadError(classified)) {
      throw classified;
    }
    console.warn('Recoverable owner Observation query error; evaluating the bounded v2 local cache:', classified);
  }

  const observations = selectRemoteResult(
    remoteObservations,
    () => (hasFreshLocalCacheSnapshot(ownerUid) ? Object.values(cache.observations) : []),
  );
  return observations
    .filter((observation) => observation.uid === ownerUid && observation.deletedAt === null)
    .sort((left, right) => (
      right.createdAt.localeCompare(left.createdAt)
      || left.id.localeCompare(right.id)
  ));
}

type OwnedCanonicalRecords = {
  observations: Observation[];
  observationSets: ObservationSet[];
  memberships: ObservationSetMembership[];
};

function uniqueRecords<T extends { id: string }>(records: Iterable<T>): T[] {
  return [...new Map([...records].map((record) => [record.id, record])).values()];
}

/**
 * Reads the owner's current canonical records for the no-write exchange path.
 * The result is assembled from remote-backed views and the owner-only
 * observation picker; it never exports ObservationSetView as a record.
 */
async function loadOwnedCanonicalRecords(ownerUid: string, ownerEmail?: string): Promise<OwnedCanonicalRecords> {
  const views = await fetchObservations(
    'mine',
    ownerUid,
    ownerEmail,
    MAX_INTERCHANGE_RECORDS,
    'remote-required',
  );
  const pickerObservations = await fetchOwnedActiveObservations(
    ownerUid,
    MAX_INTERCHANGE_RECORDS,
    'remote-required',
  );
  const observationSets = uniqueRecords(views)
    .map(({ observations: _observations, memberships: _memberships, ...observationSet }) => observationSet)
    .filter((observationSet) => observationSet.uid === ownerUid && observationSet.deletedAt === null);
  const observations = uniqueRecords([
    ...pickerObservations,
    ...views.flatMap((view) => view.observations),
  ]).filter((observation) => observation.uid === ownerUid && observation.deletedAt === null);
  const observationSetIds = new Set(observationSets.map((observationSet) => observationSet.id));
  const ownedObservationIds = new Set(observations.map((observation) => observation.id));
  const memberships = uniqueRecords(views.flatMap((view) => view.memberships))
    .filter((membership) => (
      membership.uid === ownerUid
      && observationSetIds.has(membership.observationSetId)
      && ownedObservationIds.has(membership.observationId)
    ));
  return { observations, observationSets, memberships };
}

/** Exports the owner's active canonical records as deterministic v2 data. */
export async function exportOwnedObservationInterchangeBundle(
  ownerUid: string,
  ownerEmail?: string,
): Promise<ObservationInterchangeBundle> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid) {
    throw new Error('The signed-in user must own the exported Observation records.');
  }
  const records = await loadOwnedCanonicalRecords(ownerUid, ownerEmail ?? auth.currentUser.email ?? undefined);
  return createObservationInterchangeBundle({
    exportedAt: new Date().toISOString(),
    ...records,
  });
}

/**
 * Parses and compares an import file against current owner records. This is a
 * dry-run only: it performs reads and local validation but never writes to
 * Firestore. The persistence commit policy is intentionally a later package.
 */
export async function dryRunOwnedObservationInterchangeImport(
  serialized: string,
  ownerUid: string,
  ownerEmail?: string,
): Promise<ObservationInterchangeImportDryRunReport> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid) {
    throw new Error('The signed-in user must own the import dry-run context.');
  }
  const records = await loadOwnedCanonicalRecords(ownerUid, ownerEmail ?? auth.currentUser.email ?? undefined);
  let bundle: ObservationInterchangeBundle;
  try {
    bundle = parseObservationInterchangeBundle(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The import file could not be validated.';
    return invalidObservationInterchangeImportDryRunReport(ownerUid, message);
  }
  return analyzeObservationInterchangeImport(bundle, records, ownerUid);
}

/** Attaches an existing observation to an existing set without duplicating either endpoint. */
export async function attachObservationToSet(observationSetId: string, observationId: string, position: number): Promise<ObservationSetMembership> {
  if (!auth.currentUser) throw new Error('Authentication required');

  const [setSnapshot, observationSnapshot] = await Promise.all([
    getDoc(doc(db, FIRESTORE_COLLECTIONS.observationSets, observationSetId)),
    getDoc(doc(db, FIRESTORE_COLLECTIONS.observations, observationId)),
  ]);
  if (!setSnapshot.exists() || !observationSnapshot.exists()) throw new Error('Membership endpoint not found.');

  const observationSet = observationSetFromFirestore(setSnapshot.id, setSnapshot.data());
  const observation = observationFromFirestore(observationSnapshot.id, observationSnapshot.data());
  if (observationSet.uid !== auth.currentUser.uid || observation.uid !== auth.currentUser.uid) {
    throw new Error('Only the shared endpoint owner may create a membership.');
  }
  const membership = createMembership({
    observationSet,
    observation,
    position,
    createdAt: new Date().toISOString(),
  });

  const membershipRef = doc(db, FIRESTORE_COLLECTIONS.memberships, membership.id);
  await runTransaction(db, async (transaction) => {
    const existing = await transaction.get(membershipRef);
    if (existing.exists()) throw new Error('This observation is already attached to the set.');
    transaction.set(membershipRef, membershipToFirestore(membership));
  });

  const cache = mergeNormalizedObservationCache(getLocalCache(auth.currentUser.uid), { observationSets: [observationSet], observations: [observation], memberships: [membership] });
  saveLocalCache(cache, auth.currentUser.uid);
  return membership;
}

/** Detaching deletes only the relationship document; it never deletes the observation. */
export async function detachObservationFromSet(observationSetId: string, observationId: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Authentication required');
  const id = membershipDocumentId(observationSetId, observationId);
  const batch = writeBatch(db);
  batch.delete(doc(db, FIRESTORE_COLLECTIONS.memberships, id));
  await batch.commit();

  const cache = detachMembershipFromNormalizedObservationCache(getLocalCache(auth.currentUser.uid), observationSetId, observationId);
  saveLocalCache(cache, auth.currentUser.uid);
}

/**
 * Updates the canonical observation only. Any set view that contains it is
 * rebuilt from this one record on the next read; no copied child data exists
 * to fan out or reconcile.
 */
export async function updateObservation(
  id: string,
  changes: Partial<Pick<Observation,
    'observerName' | 'observerPhoto' | 'type' | 'title' | 'summary' | 'rawContent' |
    'imageUrl' | 'imagePath' | 'location' | 'visibility' | 'allowedEmails' | 'metadata'
  >>,
): Promise<void> {
  if (!auth.currentUser) throw new Error('Authentication required');

  const cache = getLocalCache(auth.currentUser.uid);
  let current = cache.observations[id];
  if (!current) {
    const snapshot = await getDoc(doc(db, FIRESTORE_COLLECTIONS.observations, id));
    if (!snapshot.exists()) throw new Error('Observation not found.');
    current = observationFromFirestore(snapshot.id, snapshot.data());
  }
  if (current.uid !== auth.currentUser.uid) throw new Error('Only the observation owner may update it.');
  if (current.deletedAt !== null) throw new Error('A soft-deleted observation cannot be updated.');

  const now = new Date().toISOString();
  const definedChanges = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  ) as Partial<typeof changes>;
  const next: Observation = {
    ...current,
    ...definedChanges,
    allowedEmails: (definedChanges.visibility ?? current.visibility) === 'shared'
      ? [...new Set(definedChanges.allowedEmails ?? current.allowedEmails)]
      : [],
    updatedAt: now,
  };
  assertObservation(next);

  const updateData = Object.fromEntries(
    Object.entries({ ...definedChanges, allowedEmails: next.allowedEmails, updatedAt: toFirestoreTimestamp(now) })
      .filter(([, value]) => value !== undefined),
  );
  const batch = writeBatch(db);
  batch.update(doc(db, FIRESTORE_COLLECTIONS.observations, id), updateData);
  await batch.commit();

  cache.observations[id] = next;
  saveLocalCache(cache, auth.currentUser.uid);
}

/** Changes only the set ACL. Observation ACLs remain independent by design. */
export async function updateObservationSetVisibility(
  id: string,
  newVisibility: VisibilityType,
  allowedEmails: string[] = [],
): Promise<void> {
  if (!auth.currentUser) throw new Error('Authentication required');
  const sanitizedAllowedEmails = newVisibility === 'shared' ? [...new Set(allowedEmails)] : [];
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(doc(db, FIRESTORE_COLLECTIONS.observationSets, id), {
    visibility: newVisibility,
    allowedEmails: sanitizedAllowedEmails,
    updatedAt: toFirestoreTimestamp(now),
  });
  await batch.commit();

  const cache = getLocalCache(auth.currentUser.uid);
  const current = cache.observationSets[id];
  if (current) {
    cache.observationSets[id] = { ...current, visibility: newVisibility, allowedEmails: sanitizedAllowedEmails, updatedAt: now };
    saveLocalCache(cache, auth.currentUser.uid);
  }
}

/** Soft-deletes a set only; memberships and observations are intentionally retained. */
export async function softDeleteObservationSet(id: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Authentication required');
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(doc(db, FIRESTORE_COLLECTIONS.observationSets, id), {
    deletedAt: toFirestoreTimestamp(now),
    updatedAt: toFirestoreTimestamp(now),
  });
  await batch.commit();

  const cache = getLocalCache(auth.currentUser.uid);
  const current = cache.observationSets[id];
  if (current) {
    cache.observationSets[id] = { ...current, deletedAt: now, updatedAt: now };
    saveLocalCache(cache, auth.currentUser.uid);
  }
}

/** Soft-deletes an observation only; it does not alter its sets or memberships. */
export async function softDeleteObservation(id: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Authentication required');
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.update(doc(db, FIRESTORE_COLLECTIONS.observations, id), {
    deletedAt: toFirestoreTimestamp(now),
    updatedAt: toFirestoreTimestamp(now),
  });
  await batch.commit();

  const cache = getLocalCache(auth.currentUser.uid);
  const current = cache.observations[id];
  if (current) {
    cache.observations[id] = { ...current, deletedAt: now, updatedAt: now };
    saveLocalCache(cache, auth.currentUser.uid);
  }
}
