import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertMembership,
  assertObservation,
  assertObservationSet,
  buildObservationSetViews,
  createMembership,
  membershipDocumentId,
} from '../../src/domain/observationDomain.ts';
import {
  assertNormalizedObservationCache,
  buildObservationSetViewsFromNormalizedObservationCache,
  detachMembershipFromNormalizedObservationCache,
  emptyNormalizedObservationCache,
  mergeNormalizedObservationCache,
} from '../../src/domain/normalizedObservationCache.ts';
import {
  attachObservationToSetView,
  detachObservationFromSetView,
  nextMembershipPosition,
  unattachedOwnedObservationsForSet,
} from '../../src/domain/observationSetViewEditing.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type Observation,
  type ObservationSet,
  type ObservationSetMembership,
  type ObservationSetView,
} from '../../src/types.ts';
import { selectRemoteResult } from '../../src/domain/remoteReadPolicy.ts';

const createdAt = '2026-07-24T12:00:00.000Z';

test('a successful empty remote read does not fall back to stale cache data', () => {
  assert.deepEqual(selectRemoteResult([], () => ['stale']), []);
  assert.deepEqual(selectRemoteResult(undefined, () => ['stale']), ['stale']);
});

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: '018fd116-8cf0-7def-8abc-1234567890ab',
    uid: 'owner-a',
    observerName: 'Owner A',
    type: 'manual',
    title: '独立観測',
    summary: 'summary',
    rawContent: 'raw',
    visibility: 'private',
    allowedEmails: [],
    metadata: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
}

function observationSet(id: string, overrides: Partial<ObservationSet> = {}): ObservationSet {
  return {
    id,
    uid: 'owner-a',
    observerName: 'Owner A',
    type: 'manual',
    title: `集合 ${id}`,
    summary: 'set summary',
    rawContent: 'set raw',
    visibility: 'private',
    allowedEmails: [],
    tags: ['manual'],
    metadata: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
    ...overrides,
  };
}

test('one Observation can be projected into multiple independent ObservationSets', () => {
  const item = observation();
  const setA = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const setB = observationSet('018fd116-8cf0-7def-8abc-1234567890ad');
  const membershipA = createMembership({ observationSet: setA, observation: item, position: 0, createdAt });
  const membershipB = createMembership({ observationSet: setB, observation: item, position: 0, createdAt });

  const views = buildObservationSetViews({
    observationSets: [setA, setB],
    observations: [item],
    memberships: [membershipA, membershipB],
  });

  assert.equal(views.length, 2);
  assert.deepEqual(views.map((view) => view.observations.map((entry) => entry.id)), [[item.id], [item.id]]);
  assert.equal(membershipA.id, membershipDocumentId(setA.id, item.id));
  assert.equal(membershipB.id, membershipDocumentId(setB.id, item.id));
});

test('a duplicate set/observation tuple is rejected by its deterministic membership ID', () => {
  const item = observation();
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const membership = createMembership({ observationSet: set, observation: item, position: 0, createdAt });

  assert.throws(
    () => buildObservationSetViews({ observationSets: [set], observations: [item], memberships: [membership, membership] }),
    /duplicate Membership\.id/,
  );
});

test('detaching removes only a membership and preserves the Observation entity', () => {
  const item = observation();
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const membership = createMembership({ observationSet: set, observation: item, position: 0, createdAt });

  const attached = buildObservationSetViews({ observationSets: [set], observations: [item], memberships: [membership] });
  const detached = buildObservationSetViews({ observationSets: [set], observations: [item], memberships: [] });

  assert.equal(attached[0].observations.length, 1);
  assert.equal(detached[0].observations.length, 0);
  assert.equal(item.deletedAt, null);
  assert.equal(item.id, membership.observationId);
});

test('view editing attaches an existing canonical Observation and detaches only its Membership', () => {
  const item = observation();
  const setA = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const setB = observationSet('018fd116-8cf0-7def-8abc-1234567890ad');
  const membershipA = createMembership({ observationSet: setA, observation: item, position: 0, createdAt });
  const [viewA] = buildObservationSetViews({
    observationSets: [setA],
    observations: [item],
    memberships: [membershipA],
  });
  const [emptyViewB] = buildObservationSetViews({
    observationSets: [setB],
    observations: [],
    memberships: [],
  });
  const membershipB = createMembership({ observationSet: setB, observation: item, position: 0, createdAt });

  const attachedViewB = attachObservationToSetView(emptyViewB, item, membershipB);
  assert.deepEqual(attachedViewB.observations.map((entry) => entry.id), [item.id]);
  assert.deepEqual(attachedViewB.memberships.map((entry) => entry.id), [membershipB.id]);
  assert.equal(nextMembershipPosition(attachedViewB), 1);
  assert.deepEqual(viewA.observations.map((entry) => entry.id), [item.id]);

  const detachedViewB = detachObservationFromSetView(attachedViewB, item.id);
  assert.deepEqual(detachedViewB.observations, []);
  assert.deepEqual(detachedViewB.memberships, []);
  assert.equal(item.deletedAt, null);
  assert.equal(viewA.memberships[0].observationId, item.id);
});

test('attachment candidates exclude existing relations, deleted records, and other owners', () => {
  const attached = observation();
  const candidate = observation({
    id: '018fd116-8cf0-7def-8abc-1234567890ae',
    createdAt: '2026-07-25T12:00:00.000Z',
    updatedAt: '2026-07-25T12:00:00.000Z',
  });
  const deleted = observation({
    id: '018fd116-8cf0-7def-8abc-1234567890af',
    deletedAt: '2026-07-25T12:00:00.000Z',
    updatedAt: '2026-07-25T12:00:00.000Z',
  });
  const otherOwner = observation({
    id: '018fd116-8cf0-7def-8abc-1234567890b0',
    uid: 'owner-b',
  });
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890b1');
  const membership = createMembership({ observationSet: set, observation: attached, position: 0, createdAt });
  const [view] = buildObservationSetViews({
    observationSets: [set],
    observations: [attached],
    memberships: [membership],
  });

  assert.deepEqual(
    unattachedOwnedObservationsForSet(view, 'owner-a', [attached, candidate, deleted, otherOwner])
      .map((entry) => entry.id),
    [candidate.id],
  );
  assert.deepEqual(unattachedOwnedObservationsForSet(view, 'owner-b', [candidate]), []);
});

test('soft-deleting either endpoint does not mutate the other endpoint', () => {
  const item = observation();
  const activeSet = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const deletedSet = { ...activeSet, deletedAt: '2026-07-25T12:00:00.000Z', updatedAt: '2026-07-25T12:00:00.000Z' };
  const membership = createMembership({ observationSet: activeSet, observation: item, position: 0, createdAt });

  const views = buildObservationSetViews({ observationSets: [deletedSet], observations: [item], memberships: [membership] });
  assert.equal(views.length, 0);
  assert.equal(item.deletedAt, null);
  assert.equal(membership.observationSetId, activeSet.id);
});

test('an Observation update is reflected in every rebuilt set view without copying it into sets', () => {
  const oldItem = observation({ title: 'before' });
  const newItem = { ...oldItem, title: 'after', updatedAt: '2026-07-25T12:00:00.000Z' };
  const setA = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const setB = observationSet('018fd116-8cf0-7def-8abc-1234567890ad');
  const memberships = [
    createMembership({ observationSet: setA, observation: oldItem, position: 0, createdAt }),
    createMembership({ observationSet: setB, observation: oldItem, position: 0, createdAt }),
  ];

  const views = buildObservationSetViews({ observationSets: [setA, setB], observations: [newItem], memberships });
  assert.deepEqual(views.map((view) => view.observations[0].title), ['after', 'after']);
  assert.equal('observations' in setA, false);
  assert.equal('observationIds' in setA, false);
});

test('membership creation rejects cross-owner endpoints and soft-deleted endpoints', () => {
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const otherOwner = observation({ uid: 'owner-b' });
  assert.throws(
    () => createMembership({ observationSet: set, observation: otherOwner, position: 0, createdAt }),
    /cross-owner memberships/,
  );

  const deletedItem = observation({ deletedAt: '2026-07-25T12:00:00.000Z', updatedAt: '2026-07-25T12:00:00.000Z' });
  assert.throws(
    () => createMembership({ observationSet: set, observation: deletedItem, position: 0, createdAt }),
    /soft-deleted endpoint/,
  );
});

test('canonical endpoint IDs must be lowercase UUIDv7 values', () => {
  const invalidId = observation({ id: 'not-a-uuidv7' });
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  assert.throws(
    () => createMembership({ observationSet: set, observation: invalidId, position: 0, createdAt }),
    /UUIDv7/,
  );
});

test('set and observation ACLs remain independent of membership', () => {
  const item = observation({ visibility: 'private', allowedEmails: [] });
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac', { visibility: 'public', allowedEmails: [] });
  const membership = createMembership({ observationSet: set, observation: item, position: 0, createdAt });
  const [view] = buildObservationSetViews({ observationSets: [set], observations: [item], memberships: [membership] });

  assert.equal(view.visibility, 'public');
  assert.equal(view.observations[0].visibility, 'private');
  assert.notEqual(view.visibility, view.observations[0].visibility);
});

test('canonical entity validators reject legacy relationship fields and duplicated lists', () => {
  const item = observation();
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');

  assert.throws(
    () => assertObservation({ ...item, parentSetId: set.id } as unknown as Observation),
    /Observation has unsupported field parentSetId/,
  );
  assert.throws(
    () => assertObservationSet({ ...set, observationIds: [item.id] } as unknown as ObservationSet),
    /ObservationSet has unsupported field observationIds/,
  );
  assert.throws(
    () => assertObservationSet({ ...set, observations: [item] } as unknown as ObservationSet),
    /ObservationSet has unsupported field observations/,
  );
  assert.throws(
    () => assertObservation({ ...item, visibility: 'shared', allowedEmails: ['a@example.test', 'a@example.test'] }),
    /allowedEmails must not contain duplicate values/,
  );
  assert.throws(
    () => assertObservationSet({ ...set, tags: ['manual', 'manual'] }),
    /tags must not contain duplicate values/,
  );
  assert.throws(
    () => assertObservation({ ...item, location: { latitude: 91, longitude: 0 } }),
    /location\.latitude must be a finite number between -90 and 90/,
  );
  assert.doesNotThrow(() => assertObservation({
    ...item,
    observerName: null as unknown as string,
    observerPhoto: null as unknown as string,
    imageUrl: null as unknown as string,
    imagePath: null as unknown as string,
    location: null as unknown as Observation['location'],
  }));
});

test('canonical entity timestamps are RFC 3339 and never precede their creation', () => {
  const item = observation();

  assert.throws(
    () => assertObservation({ ...item, createdAt: '2026-07-24' }),
    /createdAt must be an RFC 3339 date-time string/,
  );
  assert.throws(
    () => assertObservation({ ...item, createdAt: '2026-02-30T12:00:00.000Z' }),
    /createdAt must name a real RFC 3339 date-time/,
  );
  assert.throws(
    () => assertObservation({ ...item, updatedAt: '2026-07-24T11:59:59.999Z' }),
    /updatedAt must not be earlier than Observation.createdAt/,
  );
  assert.throws(
    () => assertObservation({ ...item, deletedAt: '2026-07-24T11:59:59.999Z' }),
    /deletedAt must not be earlier than Observation.createdAt/,
  );
});

test('membership references must use UUIDv7 endpoints even when validated independently', () => {
  const invalidMembership: ObservationSetMembership = {
    id: 'not-a-uuidv7__also-not-a-uuidv7',
    observationSetId: 'not-a-uuidv7',
    observationId: 'also-not-a-uuidv7',
    uid: 'owner-a',
    position: 0,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
  };

  assert.throws(() => assertMembership(invalidMembership), /Membership\.observationSetId must be a lowercase UUIDv7/);
  assert.throws(
    () => membershipDocumentId('not-a-uuidv7', observation().id),
    /observationSetId must be a lowercase UUIDv7/,
  );
});

test('membership validators reject unsupported fields as well as invalid endpoint IDs', () => {
  const item = observation();
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const membership = createMembership({ observationSet: set, observation: item, position: 0, createdAt });

  assert.throws(
    () => assertMembership({ ...membership, parentSetId: set.id } as unknown as ObservationSetMembership),
    /Membership has unsupported field parentSetId/,
  );
});

test('normalized cache persists canonical records and strips read-time projection arrays', () => {
  const item = observation();
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const membership = createMembership({ observationSet: set, observation: item, position: 0, createdAt });
  const view = { ...set, observations: [item], memberships: [membership] };

  const cache = mergeNormalizedObservationCache(emptyNormalizedObservationCache(), {
    observations: [item],
    observationSets: [view],
    memberships: [membership],
  });

  assert.equal('observations' in cache.observationSets[set.id], false);
  assert.equal('memberships' in cache.observationSets[set.id], false);
  assert.deepEqual(view.observations, [item]);
  assert.deepEqual(view.memberships, [membership]);
  assert.deepEqual(
    buildObservationSetViewsFromNormalizedObservationCache(cache)[0].observations.map((entry) => entry.id),
    [item.id],
  );
});

test('detaching from normalized cache removes one relation but preserves the other set and Observation', () => {
  const item = observation();
  const setA = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const setB = observationSet('018fd116-8cf0-7def-8abc-1234567890ad');
  const membershipA = createMembership({ observationSet: setA, observation: item, position: 0, createdAt });
  const membershipB = createMembership({ observationSet: setB, observation: item, position: 0, createdAt });
  const cache = mergeNormalizedObservationCache(emptyNormalizedObservationCache(), {
    observations: [item],
    observationSets: [setA, setB],
    memberships: [membershipA, membershipB],
  });

  const detached = detachMembershipFromNormalizedObservationCache(cache, setA.id, item.id);
  const viewsById = new Map(
    buildObservationSetViewsFromNormalizedObservationCache(detached).map((view) => [view.id, view]),
  );

  assert.equal(detached.observations[item.id].id, item.id);
  assert.equal(detached.memberships[membershipA.id], undefined);
  assert.equal(detached.memberships[membershipB.id].id, membershipB.id);
  assert.equal(viewsById.get(setA.id)?.observations.length, 0);
  assert.deepEqual(viewsById.get(setB.id)?.observations.map((entry) => entry.id), [item.id]);
});

test('normalized cache retains soft-deleted canonical records while projection hides inactive endpoints', () => {
  const activeItem = observation();
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const membership = createMembership({ observationSet: set, observation: activeItem, position: 0, createdAt });
  const item = {
    ...activeItem,
    deletedAt: '2026-07-25T12:00:00.000Z',
    updatedAt: '2026-07-25T12:00:00.000Z',
  };
  const cache = mergeNormalizedObservationCache(emptyNormalizedObservationCache(), {
    observations: [item],
    observationSets: [set],
    memberships: [membership],
  });

  const [view] = buildObservationSetViewsFromNormalizedObservationCache(cache);
  assert.equal(cache.observations[item.id].deletedAt, item.deletedAt);
  assert.equal(cache.memberships[membership.id].id, membership.id);
  assert.deepEqual(view.observations, []);
  assert.deepEqual(view.memberships, []);
});

test('normalized cache view order belongs to memberships and uses their deterministic IDs as ties', () => {
  const first = observation({ id: '018fd116-8cf0-7def-8abc-1234567890ac', title: 'first' });
  const second = observation({ id: '018fd116-8cf0-7def-8abc-1234567890ad', title: 'second' });
  const third = observation({ id: '018fd116-8cf0-7def-8abc-1234567890ae', title: 'third' });
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890af');
  const cache = mergeNormalizedObservationCache(emptyNormalizedObservationCache(), {
    observations: [first, second, third],
    observationSets: [set],
    memberships: [
      createMembership({ observationSet: set, observation: second, position: 1, createdAt }),
      createMembership({ observationSet: set, observation: third, position: 0, createdAt }),
      createMembership({ observationSet: set, observation: first, position: 1, createdAt }),
    ],
  });

  const [view] = buildObservationSetViewsFromNormalizedObservationCache(cache);
  assert.deepEqual(view.observations.map((entry) => entry.id), [third.id, first.id, second.id]);
});

test('normalized cache rejects mismatched map keys, derived arrays, and duplicate merge input', () => {
  const item = observation();
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');
  const membership = createMembership({ observationSet: set, observation: item, position: 0, createdAt });
  const validCache = mergeNormalizedObservationCache(emptyNormalizedObservationCache(), {
    observations: [item],
    observationSets: [set],
    memberships: [membership],
  });

  assert.throws(
    () => assertNormalizedObservationCache({ ...validCache, observations: { wrong: item } }),
    /cache\.observations key wrong must match the stored entity id/,
  );
  assert.throws(
    () => assertNormalizedObservationCache({
      ...validCache,
      observationSets: { [set.id]: { ...set, observations: [item] } },
    }),
    /ObservationSet has unsupported field observations/,
  );
  assert.throws(
    () => mergeNormalizedObservationCache(emptyNormalizedObservationCache(), { observations: [item, item] }),
    /duplicate Observation\.id in one cache merge/,
  );
  assert.throws(
    () => mergeNormalizedObservationCache(emptyNormalizedObservationCache(), {
      observationSets: [{ ...set, observations: 'not-an-array' } as unknown as ObservationSetView],
    }),
    /ObservationSetView\.observations must be an array/,
  );
});

test('view reconstruction rejects duplicate canonical entity IDs instead of overwriting one source record', () => {
  const item = observation();
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ac');

  assert.throws(
    () => buildObservationSetViews({
      observationSets: [set, { ...set, title: 'conflicting duplicate' }],
      observations: [item],
      memberships: [],
    }),
    /duplicate ObservationSet\.id/,
  );
  assert.throws(
    () => buildObservationSetViews({
      observationSets: [set],
      observations: [item, { ...item, title: 'conflicting duplicate' }],
      memberships: [],
    }),
    /duplicate Observation\.id/,
  );
});
