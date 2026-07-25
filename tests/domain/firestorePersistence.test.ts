import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { assertFirestoreDocumentIdentity } from '../../src/domain/firestoreDocumentIdentity.ts';
import {
  membershipProjectionQueryPlan,
  observationSetFeedQueryPlan,
  ownedObservationPickerQueryPlan,
  type FirestoreQueryPlan,
} from '../../src/services/firestoreQueryPlan.ts';

type IndexField = {
  fieldPath: string;
  order?: string;
  arrayConfig?: string;
};

type CompositeIndex = {
  collectionGroup: string;
  fields: IndexField[];
};

const root = process.cwd();
const firestoreIndexes = JSON.parse(
  fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'),
) as { indexes: CompositeIndex[] };

function expectedIndexFields(plan: FirestoreQueryPlan): IndexField[] {
  return [
    ...plan.filters.map((filter) => (
      filter.op === 'array-contains'
        ? { fieldPath: filter.fieldPath, arrayConfig: 'CONTAINS' }
        : { fieldPath: filter.fieldPath, order: 'ASCENDING' }
    )),
    ...plan.orderBy.map((ordering) => ({
      fieldPath: ordering.fieldPath,
      order: ordering.direction === 'asc' ? 'ASCENDING' : 'DESCENDING',
    })),
  ];
}

function assertCompositeIndex(plan: FirestoreQueryPlan): void {
  const expected = expectedIndexFields(plan);
  const found = firestoreIndexes.indexes.some((index) => (
    index.collectionGroup === plan.collection
      && isDeepStrictEqual(index.fields, expected)
  ));
  assert.equal(found, true, `Missing exact composite index for ${plan.collection}: ${JSON.stringify(expected)}`);
}

test('all observation-set feed plans are bounded, scoped, and covered by indexes', () => {
  const ownerId = 'owner-1';
  const email = 'observer@example.test';
  const mine = observationSetFeedQueryPlan('mine', ownerId);
  const shared = observationSetFeedQueryPlan('shared', undefined, email);
  const authenticated = observationSetFeedQueryPlan('authenticated');
  const publicFeed = observationSetFeedQueryPlan('public');

  assert.equal(observationSetFeedQueryPlan('mine'), null);
  assert.equal(observationSetFeedQueryPlan('shared'), null);

  for (const plan of [mine, shared, authenticated, publicFeed]) {
    assert.notEqual(plan, null);
    assert.equal(plan.limit, 50);
    assert.deepEqual(plan.orderBy, [{ fieldPath: 'createdAt', direction: 'desc' }]);
    assertCompositeIndex(plan);
  }

  const exchangeMine = observationSetFeedQueryPlan('mine', ownerId, undefined, 1000);
  assert.equal(exchangeMine?.limit, 1000);
  assertCompositeIndex(exchangeMine!);

  assert.deepEqual(mine?.filters, [
    { fieldPath: 'uid', op: '==', value: ownerId },
    { fieldPath: 'deletedAt', op: '==', value: null },
  ]);
  assert.deepEqual(shared?.filters, [
    { fieldPath: 'visibility', op: '==', value: 'shared' },
    { fieldPath: 'allowedEmails', op: 'array-contains', value: email },
    { fieldPath: 'deletedAt', op: '==', value: null },
  ]);
  assert.deepEqual(authenticated?.filters, [
    { fieldPath: 'visibility', op: '==', value: 'authenticated' },
    { fieldPath: 'deletedAt', op: '==', value: null },
  ]);
  assert.deepEqual(publicFeed?.filters, [
    { fieldPath: 'visibility', op: '==', value: 'public' },
    { fieldPath: 'deletedAt', op: '==', value: null },
  ]);
});

test('the relation projection plan is deterministically ordered and index-backed', () => {
  const plan = membershipProjectionQueryPlan('set-1', 'owner-1');
  assert.deepEqual(plan.filters, [
    { fieldPath: 'observationSetId', op: '==', value: 'set-1' },
    { fieldPath: 'uid', op: '==', value: 'owner-1' },
  ]);
  assert.deepEqual(plan.orderBy, [
    { fieldPath: 'position', direction: 'asc' },
    { fieldPath: 'id', direction: 'asc' },
  ]);
  assert.equal(plan.limit, undefined);
  assertCompositeIndex(plan);
});

test('the attachment picker queries only active Observations owned by its principal', () => {
  const ownerId = 'owner-1';
  const plan = ownedObservationPickerQueryPlan(ownerId);

  assert.equal(ownedObservationPickerQueryPlan(), null);
  assert.notEqual(plan, null);
  assert.deepEqual(plan?.filters, [
    { fieldPath: 'uid', op: '==', value: ownerId },
    { fieldPath: 'deletedAt', op: '==', value: null },
  ]);
  assert.deepEqual(plan?.orderBy, [{ fieldPath: 'createdAt', direction: 'desc' }]);
  assert.equal(plan?.limit, 100);
  assert.equal(ownedObservationPickerQueryPlan(ownerId, 1000)?.limit, 1000);
  assertCompositeIndex(plan!);
});

test('a Firestore document cannot silently replace its stored canonical ID with the path ID', () => {
  assert.doesNotThrow(() => assertFirestoreDocumentIdentity({ id: 'canonical-id' }, 'canonical-id', 'Observation'));
  assert.throws(
    () => assertFirestoreDocumentIdentity({ id: 'different-id' }, 'canonical-id', 'Observation'),
    /Observation\.id must match its Firestore document ID/,
  );
  assert.throws(
    () => assertFirestoreDocumentIdentity([], 'canonical-id', 'Observation'),
    /Observation Firestore document must be an object/,
  );
});
