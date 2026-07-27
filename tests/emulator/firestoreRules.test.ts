import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  startAfter,
  where,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-observer-2';
const OWNER_UID = 'owner-user';
const OTHER_UID = 'other-user';
const READER_UID = 'reader-user';
const READER_EMAIL = 'reader@example.test';
const CREATED_AT = new Date('2026-07-25T00:00:00.000Z');

const ids = {
  observationA: '018fd116-8cf0-7def-8abc-1234567890ac',
  observationB: '018fd116-8cf0-7def-8abc-1234567890ad',
  observationC: '018fd116-8cf0-7def-8abc-1234567890ae',
  observationSetA: '018fd116-8cf0-7def-8abc-1234567890af',
  observationSetB: '018fd116-8cf0-7def-8abc-1234567890b0',
  observationSetC: '018fd116-8cf0-7def-8abc-1234567890b1',
};

let environment: RulesTestEnvironment;

function authenticatedFirestore(uid: string, email?: string) {
  return environment.authenticatedContext(uid, email === undefined ? {} : {
    email,
    firebase: { sign_in_provider: 'password' },
  }).firestore();
}

function observationDocument(
  id: string,
  uid: string,
  visibility: 'public' | 'authenticated' | 'shared' | 'private' = 'private',
  allowedEmails: string[] = [],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    uid,
    observerName: null,
    observerPhoto: null,
    type: 'manual',
    title: 'Test observation',
    summary: '',
    rawContent: '',
    imageUrl: null,
    imagePath: null,
    location: null,
    visibility,
    allowedEmails,
    metadata: {},
    schemaVersion: '2.0.0',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    deletedAt: null,
    ...overrides,
  };
}

function observationSetDocument(
  id: string,
  uid: string,
  visibility: 'public' | 'authenticated' | 'shared' | 'private' = 'private',
  allowedEmails: string[] = [],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...observationDocument(id, uid, visibility, allowedEmails),
    title: 'Test observation set',
    tags: [],
    ...overrides,
  };
}

function membershipDocument(observationSetId: string, observationId: string, uid: string): Record<string, unknown> {
  return {
    id: `${observationSetId}__${observationId}`,
    observationSetId,
    observationId,
    uid,
    position: 0,
    schemaVersion: '2.0.0',
    createdAt: CREATED_AT,
  };
}

async function seed(pathSegments: string[], data: Record<string, unknown>): Promise<void> {
  await environment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(pathSegments.join('/')).set(data);
  });
}

async function seedOwnedEndpoints(
  observationSetId: string,
  observationId: string,
  uid: string,
  setVisibility: 'public' | 'authenticated' | 'shared' | 'private' = 'private',
  allowedEmails: string[] = [],
): Promise<void> {
  await Promise.all([
    seed(['observationSets', observationSetId], observationSetDocument(observationSetId, uid, setVisibility, allowedEmails)),
    seed(['observations', observationId], observationDocument(observationId, uid)),
  ]);
}

test.before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  });
});

test.beforeEach(async () => {
  await environment.clearFirestore();
});

test.after(async () => {
  await environment.cleanup();
});

test('only the authenticated owner can create a canonical Observation document', async () => {
  const ownerDb = authenticatedFirestore(OWNER_UID);

  await assertSucceeds(ownerDb.doc(`observations/${ids.observationA}`).set(
    observationDocument(ids.observationA, OWNER_UID),
  ));
  await assertFails(ownerDb.doc(`observations/${ids.observationB}`).set(
    observationDocument(ids.observationA, OWNER_UID),
  ));
  await assertFails(ownerDb.doc(`observations/${ids.observationC}`).set(
    { ...observationDocument(ids.observationC, OWNER_UID), parentSetId: ids.observationSetA },
  ));
});

test('canonical entity rules reject invalid locations and non-monotonic timestamps', async () => {
  const ownerDb = authenticatedFirestore(OWNER_UID);

  await assertFails(ownerDb.doc(`observations/${ids.observationA}`).set(
    observationDocument(ids.observationA, OWNER_UID, 'private', [], {
      location: { latitude: 91, longitude: 0 },
    }),
  ));
  await assertFails(ownerDb.doc(`observations/${ids.observationB}`).set(
    observationDocument(ids.observationB, OWNER_UID, 'private', [], {
      updatedAt: new Date('2026-07-24T23:59:59.000Z'),
    }),
  ));
  await assertFails(ownerDb.doc(`observationSets/${ids.observationSetA}`).set(
    observationSetDocument(ids.observationSetA, OWNER_UID, 'private', [], {
      location: { latitude: 0, longitude: 181 },
    }),
  ));

  await seed(['observations', ids.observationC], observationDocument(ids.observationC, OWNER_UID));
  await assertFails(ownerDb.doc(`observations/${ids.observationC}`).update({
    updatedAt: new Date('2026-07-24T23:59:59.000Z'),
  }));
});

test('a Membership write requires active endpoints owned by its authenticated writer', async () => {
  await seedOwnedEndpoints(ids.observationSetA, ids.observationA, OWNER_UID);
  await seedOwnedEndpoints(ids.observationSetB, ids.observationB, OTHER_UID);

  const ownerDb = authenticatedFirestore(OWNER_UID);
  await assertSucceeds(ownerDb.doc(`observationSetMemberships/${ids.observationSetA}__${ids.observationA}`).set(
    membershipDocument(ids.observationSetA, ids.observationA, OWNER_UID),
  ));
  await assertFails(ownerDb.doc(`observationSetMemberships/${ids.observationSetB}__${ids.observationB}`).set(
    membershipDocument(ids.observationSetB, ids.observationB, OWNER_UID),
  ));
  await assertFails(ownerDb.doc(`observationSetMemberships/${ids.observationSetA}__${ids.observationA}`).set(
    { ...membershipDocument(ids.observationSetA, ids.observationA, OWNER_UID), position: 0.5 },
  ));
});

test('a shared set allows relation reads without granting Observation content access', async () => {
  await seedOwnedEndpoints(
    ids.observationSetA,
    ids.observationA,
    OWNER_UID,
    'shared',
    [READER_EMAIL],
  );
  await seed(
    ['observationSetMemberships', `${ids.observationSetA}__${ids.observationA}`],
    membershipDocument(ids.observationSetA, ids.observationA, OWNER_UID),
  );

  const readerDb = authenticatedFirestore(READER_UID, READER_EMAIL);
  await assertSucceeds(readerDb.doc(`observationSetMemberships/${ids.observationSetA}__${ids.observationA}`).get());
  await assertFails(readerDb.doc(`observations/${ids.observationA}`).get());
});

test('an owner can detach a Membership but cannot physically delete an Observation', async () => {
  await seedOwnedEndpoints(ids.observationSetA, ids.observationA, OWNER_UID);
  await seed(
    ['observationSetMemberships', `${ids.observationSetA}__${ids.observationA}`],
    membershipDocument(ids.observationSetA, ids.observationA, OWNER_UID),
  );

  const ownerDb = authenticatedFirestore(OWNER_UID);
  await assertFails(ownerDb.doc(`observations/${ids.observationA}`).delete());
  await assertSucceeds(ownerDb.doc(`observationSetMemberships/${ids.observationSetA}__${ids.observationA}`).delete());
  const remainingObservation = await ownerDb.doc(`observations/${ids.observationA}`).get();
  assert.equal(remainingObservation.exists, true);
});

test('the attachment picker can query only the active Observations owned by its user', async () => {
  await seed(['observations', ids.observationA], observationDocument(ids.observationA, OWNER_UID));
  await seed(['observations', ids.observationB], observationDocument(ids.observationB, OTHER_UID));

  const ownerDb = authenticatedFirestore(OWNER_UID);
  const ownObservations = await assertSucceeds(
    ownerDb.collection('observations')
      .where('uid', '==', OWNER_UID)
      .where('deletedAt', '==', null)
      .orderBy('createdAt', 'desc')
      .get(),
  );
  assert.equal(ownObservations.docs.length, 1);
  await assertFails(
    ownerDb.collection('observations')
      .where('uid', '==', OTHER_UID)
      .where('deletedAt', '==', null)
      .orderBy('createdAt', 'desc')
      .get(),
  );
});

test('dummy cleanup queries only the active marked records of the current owner', async () => {
  await Promise.all([
    seed(['observations', ids.observationA], observationDocument(ids.observationA, OWNER_UID, 'private', [], {
      metadata: { isDummyData: true },
    })),
    seed(['observations', ids.observationB], observationDocument(ids.observationB, OWNER_UID, 'private', [], {
      metadata: {},
    })),
    seed(['observations', ids.observationC], observationDocument(ids.observationC, OTHER_UID, 'private', [], {
      metadata: { isDummyData: true },
    })),
  ]);

  const ownerDb = authenticatedFirestore(OWNER_UID);
  const markedOwnRecords = await assertSucceeds(getDocs(query(
    collection(ownerDb, 'observations'),
    where('uid', '==', OWNER_UID),
    where('deletedAt', '==', null),
    where('metadata.isDummyData', '==', true),
  )));
  assert.deepEqual(markedOwnRecords.docs.map((snapshot) => snapshot.id), [ids.observationA]);

  await assertFails(getDocs(query(
    collection(ownerDb, 'observations'),
    where('uid', '==', OTHER_UID),
    where('deletedAt', '==', null),
    where('metadata.isDummyData', '==', true),
  )));
});

test('bounded owner reads can continue with a cursor and detect exhaustion', async () => {
  await Promise.all([
    seed(['observations', ids.observationA], observationDocument(ids.observationA, OWNER_UID, 'private', [], {
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      updatedAt: new Date('2026-07-25T00:00:00.000Z'),
    })),
    seed(['observations', ids.observationB], observationDocument(ids.observationB, OWNER_UID, 'private', [], {
      createdAt: new Date('2026-07-25T00:01:00.000Z'),
      updatedAt: new Date('2026-07-25T00:01:00.000Z'),
    })),
    seed(['observations', ids.observationC], observationDocument(ids.observationC, OWNER_UID, 'private', [], {
      createdAt: new Date('2026-07-25T00:02:00.000Z'),
      updatedAt: new Date('2026-07-25T00:02:00.000Z'),
    })),
  ]);

  const ownerDb = authenticatedFirestore(OWNER_UID);
  const baseQuery = [
    where('uid', '==', OWNER_UID),
    where('deletedAt', '==', null),
    orderBy('createdAt', 'desc'),
  ] as const;
  const firstPage = await assertSucceeds(getDocs(query(
    collection(ownerDb, 'observations'),
    ...baseQuery,
    limit(2),
  )));
  assert.equal(firstPage.docs.length, 2);

  const secondPage = await assertSucceeds(getDocs(query(
    collection(ownerDb, 'observations'),
    ...baseQuery,
    startAfter(firstPage.docs[firstPage.docs.length - 1]),
    limit(2),
  )));
  assert.equal(secondPage.docs.length, 1);

  const exhaustionProbe = await assertSucceeds(getDocs(query(
    collection(ownerDb, 'observations'),
    ...baseQuery,
    startAfter(secondPage.docs[secondPage.docs.length - 1]),
    limit(1),
  )));
  assert.equal(exhaustionProbe.empty, true);
});

test('a Membership transaction is allowed only for active same-owner endpoints', async () => {
  await seedOwnedEndpoints(ids.observationSetA, ids.observationA, OWNER_UID);
  const db = authenticatedFirestore(OWNER_UID);
  const setRef = doc(db, 'observationSets', ids.observationSetA);
  const observationRef = doc(db, 'observations', ids.observationA);
  const membershipRef = doc(db, 'observationSetMemberships', `${ids.observationSetA}__${ids.observationA}`);

  await assertSucceeds(runTransaction(db, async (transaction) => {
    const [setSnapshot, observationSnapshot, membershipSnapshot] = await Promise.all([
      transaction.get(setRef),
      transaction.get(observationRef),
      transaction.get(membershipRef),
    ]);
    assert.equal(setSnapshot.exists(), true);
    assert.equal(observationSnapshot.exists(), true);
    assert.equal(membershipSnapshot.exists(), false);
    transaction.set(membershipRef, membershipDocument(ids.observationSetA, ids.observationA, OWNER_UID));
  }));
});

test('an import-sized transaction rejects an inactive relation without partial writes', async () => {
  await seedOwnedEndpoints(ids.observationSetA, ids.observationA, OWNER_UID);
  await seed(['observations', ids.observationC], observationDocument(ids.observationC, OWNER_UID, 'private', [], {
    deletedAt: new Date('2026-07-25T00:10:00.000Z'),
    updatedAt: new Date('2026-07-25T00:10:00.000Z'),
  }));

  const ownerDb = authenticatedFirestore(OWNER_UID);
  const newObservationRef = doc(ownerDb, 'observations', ids.observationB);
  const validMembershipRef = doc(ownerDb, 'observationSetMemberships', `${ids.observationSetA}__${ids.observationA}`);
  const inactiveMembershipRef = doc(ownerDb, 'observationSetMemberships', `${ids.observationSetA}__${ids.observationC}`);

  await assertFails(runTransaction(ownerDb, async (transaction) => {
    await Promise.all([
      transaction.get(newObservationRef),
      transaction.get(validMembershipRef),
      transaction.get(inactiveMembershipRef),
    ]);
    transaction.set(newObservationRef, observationDocument(ids.observationB, OWNER_UID));
    transaction.set(validMembershipRef, membershipDocument(ids.observationSetA, ids.observationA, OWNER_UID));
    transaction.set(inactiveMembershipRef, membershipDocument(ids.observationSetA, ids.observationC, OWNER_UID));
  }));

  const [newObservation, validMembership] = await Promise.all([
    ownerDb.doc(`observations/${ids.observationB}`).get(),
    ownerDb.doc(`observationSetMemberships/${ids.observationSetA}__${ids.observationA}`).get(),
  ]);
  assert.equal(newObservation.exists, false);
  assert.equal(validMembership.exists, false);
});
