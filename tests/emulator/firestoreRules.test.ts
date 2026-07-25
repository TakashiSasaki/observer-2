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
  };
}

function observationSetDocument(
  id: string,
  uid: string,
  visibility: 'public' | 'authenticated' | 'shared' | 'private' = 'private',
  allowedEmails: string[] = [],
): Record<string, unknown> {
  return {
    ...observationDocument(id, uid, visibility, allowedEmails),
    title: 'Test observation set',
    tags: [],
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
