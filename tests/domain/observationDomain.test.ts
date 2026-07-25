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
  CURRENT_SCHEMA_VERSION,
  type Observation,
  type ObservationSet,
  type ObservationSetMembership,
} from '../../src/types.ts';

const createdAt = '2026-07-24T12:00:00.000Z';

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
