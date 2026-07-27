import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type DocumentReference,
  type QueryDocumentSnapshot,
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
  createNormalizedCacheSnapshotMetadata,
  isFreshCompleteNormalizedCacheSnapshot,
  type NormalizedCacheSnapshotScope,
} from '../domain/cachePolicy';
import {
  classifyRemoteReadError,
  isRemoteDataIntegrityError,
  isRemoteReadLimitError,
  isRecoverableRemoteReadError,
  RemoteReadLimitError,
  selectRemoteResult,
  withRemoteDataIntegrity,
} from '../domain/remoteReadPolicy';
import {
  analyzeObservationInterchangeImport,
  createObservationInterchangeBundle,
  invalidObservationInterchangeImportDryRunReport,
  MAX_INTERCHANGE_RECORDS,
  ObservationInterchangeImportCommitError,
  parseObservationInterchangeBundle,
  planObservationInterchangeImportCommit,
  type ObservationInterchangeBundle,
  type ObservationInterchangeImportCommitReceipt,
  type ObservationInterchangeImportDryRunReport,
} from '../domain/observationInterchange';
import {
  membershipProjectionQueryPlan,
  observationSetFeedQueryPlan,
  ownedObservationPickerQueryPlan,
  DEFAULT_OBSERVATION_SET_FEED_LIMIT,
  DEFAULT_OWNED_OBSERVATION_PICKER_LIMIT,
  type FirestoreQueryPlan,
  type ObservationSetFeedMode,
} from './firestoreQueryPlan';
import { processImageToWebP } from '../utils/imageUtils';
import { generateId } from '../utils/idUtils';

const LOCAL_STORAGE_KEY_PREFIX = 'observer-2.normalized-cache.v2.';
const LOCAL_STORAGE_SNAPSHOT_KEY_PREFIX = 'observer-2.normalized-snapshot.v2.';
const LOCAL_STORAGE_SNAPSHOT_METADATA_KEY_PREFIX = 'observer-2.normalized-snapshot-meta.v2.';
const MAX_NEW_MEMBERSHIPS_PER_CLIENT_BATCH = 9;
const REMOTE_QUERY_PAGE_SIZE = 100;
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

export function toFirestoreTimestamp(iso: string): Timestamp {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ISO date-time: ${iso}`);
  return Timestamp.fromDate(date);
}

export function normalizeOptionalFields<T extends Observation | ObservationSet>(entity: T): Record<string, unknown> {
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

export function membershipToFirestore(membership: ObservationSetMembership): Record<string, unknown> {
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

function toFirestoreQueryConstraints(
  plan: FirestoreQueryPlan,
  pageLimit = plan.limit,
  cursor?: QueryDocumentSnapshot,
): QueryConstraint[] {
  const constraints: QueryConstraint[] = [
    ...plan.filters.map((filter) => where(filter.fieldPath, filter.op, filter.value)),
    ...plan.orderBy.map((ordering) => orderBy(ordering.fieldPath, ordering.direction)),
  ];
  if (cursor) constraints.push(startAfter(cursor));
  if (pageLimit !== undefined) constraints.push(limit(pageLimit));
  return constraints;
}

type BoundedQueryDocuments = {
  documents: QueryDocumentSnapshot[];
  complete: boolean;
};

/**
 * Reads a bounded query in cursor pages and probes the next page when the
 * maximum is reached. Regular feeds may display the bounded prefix, but a
 * remote-required exchange operation rejects a non-empty next page instead
 * of exporting an incomplete snapshot.
 */
async function fetchBoundedQueryDocuments(
  plan: FirestoreQueryPlan,
  maximumResults: number,
  rejectIncomplete: boolean,
): Promise<BoundedQueryDocuments> {
  if (!Number.isSafeInteger(maximumResults) || maximumResults <= 0) {
    throw new Error(`The remote query maximum must be a positive safe integer: ${maximumResults}`);
  }

  const pageSize = Math.min(REMOTE_QUERY_PAGE_SIZE, maximumResults);
  const documents: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;

  while (documents.length < maximumResults) {
    const pageLimit = Math.min(pageSize, maximumResults - documents.length);
    const snapshot = await getDocs(query(
      collection(db, plan.collection),
      ...toFirestoreQueryConstraints(plan, pageLimit, cursor),
    ));
    documents.push(...snapshot.docs);

    if (snapshot.docs.length < pageLimit) {
      return { documents, complete: true };
    }

    const lastDocument = snapshot.docs[snapshot.docs.length - 1];
    if (documents.length >= maximumResults) {
      const nextPage = await getDocs(query(
        collection(db, plan.collection),
        ...toFirestoreQueryConstraints(plan, 1, lastDocument),
      ));
      const complete = nextPage.empty;
      if (!complete && rejectIncomplete) {
        throw new RemoteReadLimitError(plan.collection, maximumResults);
      }
      return { documents, complete };
    }

    cursor = lastDocument;
  }

  return { documents, complete: true };
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

function cacheSnapshotStorageKey(prefix: string, principalUid: string | undefined, scope: NormalizedCacheSnapshotScope): string {
  return `${prefix}${encodeURIComponent(cachePrincipalUid(principalUid))}.${scope}`;
}

function saveLocalCacheSnapshot(
  scope: NormalizedCacheSnapshotScope,
  cache: NormalizedObservationCache,
  principalUid: string,
  resultLimit: number,
  resultCount: number,
  complete: boolean,
): void {
  try {
    assertNormalizedObservationCache(cache);
    const metadata = createNormalizedCacheSnapshotMetadata({
      principalUid,
      scope,
      resultLimit,
      resultCount,
      complete,
    });
    localStorage.setItem(
      cacheSnapshotStorageKey(LOCAL_STORAGE_SNAPSHOT_KEY_PREFIX, principalUid, scope),
      JSON.stringify(cache),
    );
    localStorage.setItem(
      cacheSnapshotStorageKey(LOCAL_STORAGE_SNAPSHOT_METADATA_KEY_PREFIX, principalUid, scope),
      JSON.stringify(metadata),
    );
  } catch (error) {
    console.warn('LocalStorage snapshot save failed:', error);
  }
}

function getFreshLocalCacheSnapshot(
  scope: NormalizedCacheSnapshotScope,
  principalUid: string,
  minimumResultLimit: number,
): NormalizedObservationCache | undefined {
  const principal = cachePrincipalUid(principalUid);
  try {
    const metadataRaw = localStorage.getItem(
      cacheSnapshotStorageKey(LOCAL_STORAGE_SNAPSHOT_METADATA_KEY_PREFIX, principal, scope),
    );
    if (!metadataRaw) return undefined;
    const metadata = JSON.parse(metadataRaw) as unknown;
    if (!isFreshCompleteNormalizedCacheSnapshot(metadata, principal, scope, minimumResultLimit)) return undefined;
    const cacheRaw = localStorage.getItem(
      cacheSnapshotStorageKey(LOCAL_STORAGE_SNAPSHOT_KEY_PREFIX, principal, scope),
    );
    if (!cacheRaw) return undefined;
    const cache = JSON.parse(cacheRaw) as unknown;
    assertNormalizedObservationCache(cache);
    return cache;
  } catch {
    return undefined;
  }
}

export function invalidateLocalCacheSnapshots(principalUid: string): void {
  const principal = cachePrincipalUid(principalUid);
  for (const scope of ['mine-feed', 'attachment-picker'] as const) {
    try {
      localStorage.removeItem(cacheSnapshotStorageKey(LOCAL_STORAGE_SNAPSHOT_KEY_PREFIX, principal, scope));
      localStorage.removeItem(cacheSnapshotStorageKey(LOCAL_STORAGE_SNAPSHOT_METADATA_KEY_PREFIX, principal, scope));
    } catch {
      // localStorage is an optional optimization; failed invalidation cannot
      // turn a remote write into a client-visible failure.
    }
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
  } catch (error) {
    console.warn('LocalStorage save failed:', error);
  }
}

export function makeObservation(draft: ObservationDraft, fallback: Pick<ObservationSet, 'uid' | 'observerName' | 'observerPhoto' | 'visibility' | 'allowedEmails'>, now: string): Observation {
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

export function makeObservationSet(draft: ObservationSetDraft, imageUrl: string | undefined, now: string): ObservationSet {
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

function uniqueRecords<T extends { id: string }>(records: Iterable<T>): T[] {
  return [...new Map([...records].map((record) => [record.id, record])).values()];
}

function cacheFromViews(views: ObservationSetView[]): NormalizedObservationCache {
  return mergeNormalizedObservationCache(emptyNormalizedObservationCache(), {
    observationSets: views,
    observations: uniqueRecords(views.flatMap((view) => view.observations)),
    memberships: uniqueRecords(views.flatMap((view) => view.memberships)),
  });
}

async function fetchMembershipsForSets(observationSets: ObservationSet[]): Promise<ObservationSetMembership[]> {
  const memberships: ObservationSetMembership[] = [];
  for (const observationSet of observationSets) {
    try {
      const plan = membershipProjectionQueryPlan(observationSet.id, observationSet.uid);
      const result = await fetchBoundedQueryDocuments(plan, MAX_INTERCHANGE_RECORDS, true);
      memberships.push(...result.documents.map((snapshotDoc) => membershipFromFirestore(snapshotDoc.id, snapshotDoc.data())));
    } catch (error) {
      if (isRemoteDataIntegrityError(error) || isRemoteReadLimitError(error)) throw error;
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
  rejectIncomplete = false,
): Promise<{ views: ObservationSetView[]; complete: boolean }> {
  const effectiveResultLimit = resultLimit ?? DEFAULT_OBSERVATION_SET_FEED_LIMIT;
  const plan = observationSetFeedQueryPlan(filterMode, currentUserUid, currentUserEmail, effectiveResultLimit);
  if (!plan) return { views: [], complete: true };

  const setQuery = await fetchBoundedQueryDocuments(plan, effectiveResultLimit, rejectIncomplete);
  const observationSets = setQuery.documents.map((snapshotDoc) => observationSetFromFirestore(snapshotDoc.id, snapshotDoc.data()));
  const memberships = await fetchMembershipsForSets(observationSets);
  const observations = await fetchReadableObservations(memberships);
  const views = withRemoteDataIntegrity('ObservationSetView', filterMode, () => (
    buildObservationSetViews({ observationSets, observations, memberships })
  ));
  return { views, complete: setQuery.complete };
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
  invalidateLocalCacheSnapshots(observationSet.uid);
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
  const effectiveResultLimit = resultLimit ?? DEFAULT_OBSERVATION_SET_FEED_LIMIT;
  let remoteViews: ObservationSetView[] | undefined;
  try {
    const result = await fetchFirestoreViews(
      filterMode,
      currentUserUid,
      currentUserEmail,
      effectiveResultLimit,
      readMode === 'remote-required',
    );
    remoteViews = result.views;
    const cache = mergeNormalizedObservationCache(getLocalCache(principalUid), {
      observationSets: result.views,
      observations: uniqueRecords(result.views.flatMap((view) => view.observations)),
      memberships: uniqueRecords(result.views.flatMap((view) => view.memberships)),
    });
    saveLocalCache(cache, principalUid);
    if (filterMode === 'mine' && principalUid) {
      saveLocalCacheSnapshot(
        'mine-feed',
        cacheFromViews(result.views),
        principalUid,
        effectiveResultLimit,
        result.views.length,
        result.complete,
      );
    }
  } catch (error) {
    if (isRemoteDataIntegrityError(error) || isRemoteReadLimitError(error)) throw error;
    const classified = classifyRemoteReadError(error);
    if (readMode === 'remote-required' || !isRecoverableRemoteReadError(classified)) {
      throw classified;
    }
    console.warn('Recoverable Firestore query error; evaluating the bounded v2 local cache:', classified);
  }
  return selectRemoteResult(
    remoteViews,
    () => {
      if (filterMode !== 'mine' || !principalUid) return [];
      const snapshot = getFreshLocalCacheSnapshot('mine-feed', principalUid, effectiveResultLimit);
      return snapshot
        ? filterLocalViews(cacheViews(snapshot), filterMode, currentUserUid, currentUserEmail)
        : [];
    },
  );
}

/**
 * Lists the active canonical Observations that the signed-in owner may attach
 * to one of their ObservationSets. The query is deliberately owner-scoped;
 * feed visibility never acts as authority to create a Membership.
 */
export async function fetchOwnedActiveObservations(
  ownerUid: string,
  resultLimit = DEFAULT_OWNED_OBSERVATION_PICKER_LIMIT,
  readMode: RemoteReadMode = 'cache-fallback',
): Promise<Observation[]> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid) {
    throw new Error('The signed-in user must own the Observation attachment candidates.');
  }

  const effectiveResultLimit = resultLimit ?? DEFAULT_OWNED_OBSERVATION_PICKER_LIMIT;
  const plan = ownedObservationPickerQueryPlan(ownerUid, effectiveResultLimit);
  if (!plan) return [];

  let cache = getLocalCache(ownerUid);
  let remoteObservations: Observation[] | undefined;
  try {
    const result = await fetchBoundedQueryDocuments(plan, effectiveResultLimit, readMode === 'remote-required');
    remoteObservations = result.documents.map((snapshotDoc) => (
      observationFromFirestore(snapshotDoc.id, snapshotDoc.data())
    ));
    cache = mergeNormalizedObservationCache(cache, { observations: remoteObservations });
    saveLocalCache(cache, ownerUid);
    saveLocalCacheSnapshot(
      'attachment-picker',
      mergeNormalizedObservationCache(emptyNormalizedObservationCache(), { observations: remoteObservations }),
      ownerUid,
      effectiveResultLimit,
      remoteObservations.length,
      result.complete,
    );
  } catch (error) {
    if (isRemoteDataIntegrityError(error) || isRemoteReadLimitError(error)) throw error;
    const classified = classifyRemoteReadError(error);
    if (readMode === 'remote-required' || !isRecoverableRemoteReadError(classified)) {
      throw classified;
    }
    console.warn('Recoverable owner Observation query error; evaluating the bounded v2 local cache:', classified);
  }

  const observations = selectRemoteResult(
    remoteObservations,
    () => Object.values(
      getFreshLocalCacheSnapshot('attachment-picker', ownerUid, effectiveResultLimit)?.observations ?? {},
    ),
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

type ImportKind = 'observations' | 'observationSets' | 'memberships';
type ImportRecord = Observation | ObservationSet | ObservationSetMembership;

type ImportCandidate = {
  kind: ImportKind;
  index: number;
  id: string;
  record: ImportRecord;
  ref: DocumentReference;
};

function importCandidates(bundle: ObservationInterchangeBundle): ImportCandidate[] {
  return [
    ...bundle.observations.map((record, index) => ({
      kind: 'observations' as const,
      index,
      id: record.id,
      record,
      ref: doc(db, FIRESTORE_COLLECTIONS.observations, record.id),
    })),
    ...bundle.observationSets.map((record, index) => ({
      kind: 'observationSets' as const,
      index,
      id: record.id,
      record,
      ref: doc(db, FIRESTORE_COLLECTIONS.observationSets, record.id),
    })),
    ...bundle.memberships.map((record, index) => ({
      kind: 'memberships' as const,
      index,
      id: record.id,
      record,
      ref: doc(db, FIRESTORE_COLLECTIONS.memberships, record.id),
    })),
  ];
}

function currentImportRecord(
  candidate: ImportCandidate,
  snapshot: DocumentSnapshot,
): ImportRecord | null {
  if (!snapshot.exists()) return null;
  if (candidate.kind === 'observations') return observationFromFirestore(snapshot.id, snapshot.data());
  if (candidate.kind === 'observationSets') return observationSetFromFirestore(snapshot.id, snapshot.data());
  return membershipFromFirestore(snapshot.id, snapshot.data());
}

function firestoreDataForImportCandidate(candidate: ImportCandidate): Record<string, unknown> {
  if (candidate.kind === 'observations') return normalizeOptionalFields(candidate.record as Observation);
  if (candidate.kind === 'observationSets') return normalizeOptionalFields(candidate.record as ObservationSet);
  return membershipToFirestore(candidate.record as ObservationSetMembership);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Commits an owner-scoped import as one conflict-checked Firestore
 * transaction. Missing records are created; identical records are no-ops;
 * existing records with different canonical content abort the transaction.
 */
export async function commitOwnedObservationInterchangeImport(
  serialized: string,
  ownerUid: string,
): Promise<ObservationInterchangeImportCommitReceipt> {
  if (!auth.currentUser || auth.currentUser.uid !== ownerUid) {
    throw new Error('The signed-in user must own the import commit context.');
  }

  let bundle: ObservationInterchangeBundle;
  try {
    bundle = parseObservationInterchangeBundle(serialized);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The import file could not be validated.';
    throw new ObservationInterchangeImportCommitError('IMPORT_INVALID_BUNDLE', message);
  }

  const bundleSha256 = await sha256Hex(serialized);
  const candidates = importCandidates(bundle);
  const committed = await runTransaction(db, async (transaction) => {
    const snapshots = await Promise.all(candidates.map((candidate) => transaction.get(candidate.ref)));
    const existing = {
      observations: [] as Observation[],
      observationSets: [] as ObservationSet[],
      memberships: [] as ObservationSetMembership[],
    };
    for (let index = 0; index < candidates.length; index += 1) {
      const current = currentImportRecord(candidates[index], snapshots[index]);
      if (!current) continue;
      if (candidates[index].kind === 'observations') existing.observations.push(current as Observation);
      if (candidates[index].kind === 'observationSets') existing.observationSets.push(current as ObservationSet);
      if (candidates[index].kind === 'memberships') existing.memberships.push(current as ObservationSetMembership);
    }

    const plan = planObservationInterchangeImportCommit(bundle, existing, ownerUid);
    if (!plan.valid) {
      const firstError = plan.errors[0];
      throw new ObservationInterchangeImportCommitError(
        firstError?.code ?? 'IMPORT_INVALID_BUNDLE',
        firstError?.message ?? 'The import bundle is not eligible for this transaction.',
        firstError?.instancePath,
      );
    }

    const createdKeys = new Set([
      ...plan.created.observations.map((record) => `observations:${record.id}`),
      ...plan.created.observationSets.map((record) => `observationSets:${record.id}`),
      ...plan.created.memberships.map((record) => `memberships:${record.id}`),
    ]);
    for (const candidate of candidates) {
      if (createdKeys.has(`${candidate.kind}:${candidate.id}`)) {
        transaction.set(candidate.ref, firestoreDataForImportCandidate(candidate));
      }
    }

    return {
      created: {
        observations: plan.created.observations.length,
        observationSets: plan.created.observationSets.length,
        memberships: plan.created.memberships.length,
        total: plan.created.observations.length + plan.created.observationSets.length + plan.created.memberships.length,
      },
      skippedIdentical: plan.skippedIdentical,
    };
  });

  const cache = mergeNormalizedObservationCache(getLocalCache(ownerUid), {
    observations: bundle.observations,
    observationSets: bundle.observationSets,
    memberships: bundle.memberships,
  });
  saveLocalCache(cache, ownerUid);
  if (committed.created.total > 0) invalidateLocalCacheSnapshots(ownerUid);

  return {
    ownerUid,
    bundleSha256,
    committedAt: new Date().toISOString(),
    counts: {
      observations: bundle.observations.length,
      observationSets: bundle.observationSets.length,
      memberships: bundle.memberships.length,
      total: candidates.length,
    },
    created: committed.created,
    skippedIdentical: committed.skippedIdentical,
  };
}

/**
 * Parses and compares an import file against current owner records. This is a
 * dry-run only: it performs reads and local validation but never writes to
 * Firestore. The separate explicit commit function above is the only import
 * path that may create Firestore records.
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
  const uid = auth.currentUser.uid;

  const setRef = doc(db, FIRESTORE_COLLECTIONS.observationSets, observationSetId);
  const obsRef = doc(db, FIRESTORE_COLLECTIONS.observations, observationId);
  const membershipId = membershipDocumentId(observationSetId, observationId);
  const membershipRef = doc(db, FIRESTORE_COLLECTIONS.memberships, membershipId);

  const membership = await runTransaction(db, async (transaction) => {
    const [setSnapshot, observationSnapshot, existing] = await Promise.all([
      transaction.get(setRef),
      transaction.get(obsRef),
      transaction.get(membershipRef),
    ]);

    if (!setSnapshot.exists() || !observationSnapshot.exists()) throw new Error('Membership endpoint not found.');
    if (existing.exists()) throw new Error('This observation is already attached to the set.');

    const observationSet = observationSetFromFirestore(setSnapshot.id, setSnapshot.data());
    const observation = observationFromFirestore(observationSnapshot.id, observationSnapshot.data());

    if (observationSet.uid !== uid || observation.uid !== uid) {
      throw new Error('Only the shared endpoint owner may create a membership.');
    }

    const newMembership = createMembership({
      observationSet,
      observation,
      position,
      createdAt: new Date().toISOString(),
    });

    transaction.set(membershipRef, membershipToFirestore(newMembership));
    return { newMembership, observationSet, observation };
  });

  const cache = mergeNormalizedObservationCache(getLocalCache(uid), {
    observationSets: [membership.observationSet],
    observations: [membership.observation],
    memberships: [membership.newMembership]
  });
  saveLocalCache(cache, uid);
  invalidateLocalCacheSnapshots(uid);
  return membership.newMembership;
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
  invalidateLocalCacheSnapshots(auth.currentUser.uid);
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
  invalidateLocalCacheSnapshots(auth.currentUser.uid);
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
  invalidateLocalCacheSnapshots(auth.currentUser.uid);
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
  invalidateLocalCacheSnapshots(auth.currentUser.uid);
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
  invalidateLocalCacheSnapshots(auth.currentUser.uid);
}
