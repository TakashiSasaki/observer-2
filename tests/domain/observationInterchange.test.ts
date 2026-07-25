import assert from 'node:assert/strict';
import test from 'node:test';
import { createMembership } from '../../src/domain/observationDomain.ts';
import {
  assertObservationInterchangeBundle,
  createObservationInterchangeBundle,
  parseObservationInterchangeBundle,
  serializeObservationInterchangeBundle,
} from '../../src/domain/observationInterchange.ts';
import {
  CURRENT_SCHEMA_VERSION,
  type Observation,
  type ObservationSet,
  type ObservationSetMembership,
} from '../../src/types.ts';

const createdAt = '2026-07-25T12:00:00.000Z';
const exportedAt = '2026-07-25T12:30:00.000Z';
const ownerId = 'owner-1';

function observation(id: string, uid = ownerId): Observation {
  return {
    id,
    uid,
    type: 'manual',
    title: `Observation ${id}`,
    summary: '',
    rawContent: 'content',
    visibility: 'private',
    allowedEmails: [],
    metadata: { keyEntities: ['marker'], nested: { stable: true } },
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

function observationSet(id: string, uid = ownerId): ObservationSet {
  return {
    id,
    uid,
    type: 'manual',
    title: `Set ${id}`,
    summary: '',
    rawContent: 'content',
    visibility: 'private',
    allowedEmails: [],
    tags: ['field'],
    metadata: {},
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  };
}

function fixture() {
  const first = observation('018fd116-8cf0-7def-8abc-1234567890ab');
  const second = observation('018fd116-8cf0-7def-8abc-1234567890ac');
  const set = observationSet('018fd116-8cf0-7def-8abc-1234567890ad');
  const memberships = [
    createMembership({ observationSet: set, observation: second, position: 1, createdAt }),
    createMembership({ observationSet: set, observation: first, position: 0, createdAt }),
  ];
  return { first, second, set, memberships };
}

test('v2 exchange export is deterministic and parse/export round-trips canonically', () => {
  const { first, second, set, memberships } = fixture();
  const bundle = createObservationInterchangeBundle({
    exportedAt,
    observations: [second, first],
    observationSets: [set],
    memberships: [...memberships].reverse(),
  });

  assert.deepEqual(bundle.observations.map((entry) => entry.id), [first.id, second.id]);
  assert.deepEqual(bundle.memberships.map((entry) => entry.id), memberships.map((entry) => entry.id).sort());

  const serialized = serializeObservationInterchangeBundle(bundle);
  const parsed = parseObservationInterchangeBundle(serialized);
  assert.deepEqual(parsed, bundle);
  assert.equal(serializeObservationInterchangeBundle(parsed), serialized);
});

test('v2 exchange omits TypeScript-only undefined optional entity fields before serializing', () => {
  const { first, set, memberships } = fixture();
  const bundle = createObservationInterchangeBundle({
    exportedAt,
    observations: [{
      ...first,
      observerName: undefined,
      location: { latitude: 35, longitude: 139, accuracy: undefined },
    }],
    observationSets: [set],
    memberships: [memberships[1]],
  });

  assert.equal('observerName' in bundle.observations[0], false);
  assert.deepEqual(bundle.observations[0].location, { latitude: 35, longitude: 139 });
  assert.deepEqual(parseObservationInterchangeBundle(serializeObservationInterchangeBundle(bundle)), bundle);
});

test('v2 exchange rejects legacy, dangling, cross-owner, duplicate, and non-JSON records', () => {
  const { first, second, set, memberships } = fixture();
  const valid = createObservationInterchangeBundle({
    exportedAt,
    observations: [first, second],
    observationSets: [set],
    memberships,
  });

  assert.throws(
    () => assertObservationInterchangeBundle({ ...valid, schemaVersion: '1.0.0' }),
    /bundle\.schemaVersion must be 2\.0\.0/,
  );
  assert.throws(
    () => assertObservationInterchangeBundle({
      ...valid,
      observations: [...valid.observations, valid.observations[0]],
    }),
    /bundle\.observations contains duplicate id/,
  );
  assert.throws(
    () => assertObservationInterchangeBundle({
      ...valid,
      memberships: [{
        ...memberships[0],
        id: `${set.id}__018fd116-8cf0-7def-8abc-1234567890ae`,
        observationId: '018fd116-8cf0-7def-8abc-1234567890ae',
      }],
    }),
    /references a missing Observation/,
  );

  const crossOwner = observation('018fd116-8cf0-7def-8abc-1234567890ae', 'owner-2');
  const crossOwnerMembership: ObservationSetMembership = {
    ...memberships[0],
    id: `${set.id}__${crossOwner.id}`,
    observationId: crossOwner.id,
  };
  assert.throws(
    () => assertObservationInterchangeBundle({
      ...valid,
      observations: [...valid.observations, crossOwner],
      memberships: [crossOwnerMembership],
    }),
    /must share the owner of both endpoints/,
  );
  assert.throws(
    () => assertObservationInterchangeBundle({
      ...valid,
      observations: [{ ...first, parentSetId: set.id }],
      memberships: [],
    }),
    /Observation has unsupported field parentSetId/,
  );
  assert.throws(
    () => assertObservationInterchangeBundle({
      ...valid,
      observations: [{ ...first, metadata: { invalid: Number.NaN } }],
      memberships: [],
    }),
    /must not contain a non-finite number/,
  );
  assert.throws(
    () => parseObservationInterchangeBundle('{not json}'),
    /serialized import is not valid JSON/,
  );
});
