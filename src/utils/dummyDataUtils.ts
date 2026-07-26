import { collection, doc, writeBatch, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { FIRESTORE_COLLECTIONS } from '../types';
import { makeObservation, makeObservationSet, invalidateLocalCacheSnapshots, normalizeOptionalFields, membershipToFirestore, toFirestoreTimestamp } from '../services/firebaseService';
import { createMembership } from '../domain/observationDomain';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * One dummy set contains one set document, two observation documents, and two
 * memberships. Four sets therefore stay within Firestore Rules' batch access
 * call budget.
 */
export const MAX_DUMMY_SET_COUNT = 4;

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function loadDummyData(count: number = MAX_DUMMY_SET_COUNT, onProgress?: (msg: string) => void): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be logged in to load dummy data.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_DUMMY_SET_COUNT) {
    throw new Error(`Dummy set count must be an integer from 1 through ${MAX_DUMMY_SET_COUNT}.`);
  }

  const log = (msg: string) => {
    console.log(msg);
    if (onProgress) onProgress(msg);
  };

  log(`Starting to load ${count} dummy sets...`);
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  let generatedSets = 0;
  let generatedObservations = 0;
  let generatedMemberships = 0;

  for (let i = 0; i < count; i++) {
    const draftSet = {
      uid: user.uid,
      type: 'manual' as const,
      title: `Dummy Set ${i + 1}`,
      summary: `This is dummy set ${i + 1}`,
      rawContent: 'Set raw content',
      visibility: 'private' as const,
      allowedEmails: [],
      tags: ['dummy'],
      metadata: { isDummyData: true },
      observations: [
        {
          uid: user.uid,
          type: 'manual' as const,
          title: `Dummy Observation ${i + 1}-1`,
          summary: 'A test observation',
          rawContent: 'Sample content',
          visibility: 'private' as const,
          allowedEmails: [],
          metadata: { isDummyData: true }
        },
        {
          uid: user.uid,
          type: 'manual' as const,
          title: `Dummy Observation ${i + 1}-2`,
          summary: 'Another test observation',
          rawContent: 'Sample content',
          visibility: 'private' as const,
          allowedEmails: [],
          metadata: { isDummyData: true }
        }
      ]
    };

    const observationSet = makeObservationSet(draftSet, undefined, now);
    const observations = draftSet.observations.map(obs => makeObservation(obs, observationSet, now));
    const memberships = observations.map((obs, index) => createMembership({
      observationSet,
      observation: obs,
      position: index,
      createdAt: now
    }));

    const setPayload = normalizeOptionalFields(observationSet);
    log(`Adding set to batch: ${observationSet.id}`);
    batch.set(doc(db, FIRESTORE_COLLECTIONS.observationSets, observationSet.id), setPayload);
    generatedSets++;

    for (const obs of observations) {
      const obsPayload = normalizeOptionalFields(obs);
      log(`Adding observation to batch: ${obs.id}`);
      batch.set(doc(db, FIRESTORE_COLLECTIONS.observations, obs.id), obsPayload);
      generatedObservations++;
    }

    for (const membership of memberships) {
      const memPayload = membershipToFirestore(membership);
      log(`Adding membership to batch: ${membership.id}`);
      batch.set(doc(db, FIRESTORE_COLLECTIONS.memberships, membership.id), memPayload);
      generatedMemberships++;
    }
  }

  log(`Committing batch with ${generatedSets} sets, ${generatedObservations} observations, ${generatedMemberships} memberships...`);
  try {
    await batch.commit();
    log('Batch committed successfully.');
  } catch (error) {
    console.error('Error committing batch:', error);
    handleFirestoreError(error, OperationType.WRITE, 'batch-load-dummy-data');
  }
  
  invalidateLocalCacheSnapshots(user.uid);
}

export async function removeDummyData(onProgress?: (msg: string) => void): Promise<{ deletedSets: number, deletedObservations: number }> {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be logged in to delete dummy data.');

  const log = (msg: string) => {
    console.log(msg);
    if (onProgress) onProgress(msg);
  };

  log('Querying active dummy sets and observations owned by the current user...');

  let setsSnapshot;
  try {
    setsSnapshot = await getDocs(query(
      collection(db, FIRESTORE_COLLECTIONS.observationSets),
      where('uid', '==', user.uid),
      where('deletedAt', '==', null),
      where('metadata.isDummyData', '==', true),
    ));
  } catch (e) {
    log(`Failed to fetch observation sets: ${e instanceof Error ? e.message : String(e)}`);
    handleFirestoreError(e, OperationType.GET, FIRESTORE_COLLECTIONS.observationSets);
  }

  let obsSnapshot;
  try {
    obsSnapshot = await getDocs(query(
      collection(db, FIRESTORE_COLLECTIONS.observations),
      where('uid', '==', user.uid),
      where('deletedAt', '==', null),
      where('metadata.isDummyData', '==', true),
    ));
  } catch (e) {
    log(`Failed to fetch observations: ${e instanceof Error ? e.message : String(e)}`);
    handleFirestoreError(e, OperationType.GET, FIRESTORE_COLLECTIONS.observations);
  }

  const now = new Date().toISOString();

  let deletedSets = 0;
  let deletedObservations = 0;

  log(`Found ${setsSnapshot.docs.length} active dummy sets and ${obsSnapshot.docs.length} active dummy observations owned by user.`);

  for (const docSnap of setsSnapshot.docs) {
    log(`Soft deleting set: ${docSnap.id}`);
    try {
      await updateDoc(docSnap.ref, {
        deletedAt: toFirestoreTimestamp(now),
        updatedAt: toFirestoreTimestamp(now)
      });
      deletedSets++;
    } catch (e: unknown) {
      log(`Failed to delete set ${docSnap.id}: ${e instanceof Error ? e.message : String(e)}`);
      handleFirestoreError(e, OperationType.UPDATE, `${FIRESTORE_COLLECTIONS.observationSets}/${docSnap.id}`);
    }
  }

  for (const docSnap of obsSnapshot.docs) {
    log(`Soft deleting observation: ${docSnap.id}`);
    try {
      await updateDoc(docSnap.ref, {
        deletedAt: toFirestoreTimestamp(now),
        updatedAt: toFirestoreTimestamp(now)
      });
      deletedObservations++;
    } catch (e: unknown) {
      log(`Failed to delete observation ${docSnap.id}: ${e instanceof Error ? e.message : String(e)}`);
      handleFirestoreError(e, OperationType.UPDATE, `${FIRESTORE_COLLECTIONS.observations}/${docSnap.id}`);
    }
  }

  if (deletedSets > 0 || deletedObservations > 0) {
    invalidateLocalCacheSnapshots(user.uid);
  } else {
    log('No dummy data found to delete.');
  }

  return { deletedSets, deletedObservations };
}
