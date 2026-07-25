import assert from 'node:assert/strict';
import test from 'node:test';
import { createMembership } from '../../src/domain/observationDomain.ts';
import {
  analyzeObservationInterchangeImport,
  assertObservationInterchangeBundle,
  createObservationInterchangeBundle,
  invalidObservationInterchangeImportDryRunReport,
  MAX_INTERCHANGE_FILE_BYTES,
  MAX_INTERCHANGE_RECORDS,
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

test('import dry-run reports counts, references, deletions, and safe identical collisions', () => {
  const { first, second, set, memberships } = fixture();
  const bundle = createObservationInterchangeBundle({
    exportedAt,
    observations: [first, { ...second, deletedAt: exportedAt, updatedAt: exportedAt }],
    observationSets: [set],
    memberships,
  });

  const report = analyzeObservationInterchangeImport(
    bundle,
    { observations: [first], observationSets: [set], memberships: [memberships[0]] },
    ownerId,
  );

  assert.equal(report.valid, true);
  assert.deepEqual(report.counts, { observations: 2, observationSets: 1, memberships: 2, total: 5 });
  assert.deepEqual(report.deleted, { observations: 1, observationSets: 0, total: 1 });
  assert.deepEqual(report.references, { memberships: 2, observationSets: 1, observations: 2, dangling: 0 });
  assert.deepEqual(report.ownership, {
    foreignRecords: 0,
    foreignObservations: 0,
    foreignObservationSets: 0,
    foreignMemberships: 0,
  });
  assert.deepEqual(report.collisions, { identical: 3, conflicting: 0, total: 3 });
});

test('import dry-run blocks foreign owners and different records with the same ID', () => {
  const { first, set, memberships } = fixture();
  const foreign = observation('018fd116-8cf0-7def-8abc-1234567890ae', 'owner-2');
  const foreignSet = observationSet('018fd116-8cf0-7def-8abc-1234567890af', 'owner-2');
  const foreignMembership = createMembership({
    observationSet: foreignSet,
    observation: foreign,
    position: 0,
    createdAt,
  });
  const bundle = createObservationInterchangeBundle({
    exportedAt,
    observations: [first, foreign],
    observationSets: [set, foreignSet],
    memberships: [foreignMembership],
  });
  const report = analyzeObservationInterchangeImport(
    bundle,
    { observations: [{ ...first, title: 'different existing record' }], observationSets: [set], memberships: [] },
    ownerId,
  );

  assert.equal(report.valid, false);
  assert.equal(report.ownership.foreignRecords, 3);
  assert.equal(report.collisions.conflicting, 1);
  assert.equal(report.errors.some((message) => message.includes('uid')), true);
  assert.equal(report.errors.some((message) => message.includes('conflicts')), true);
});

test('invalid import dry-run report keeps parse failures visible to the caller', () => {
  const report = invalidObservationInterchangeImportDryRunReport('owner-1', 'bundle.observations[2] is invalid');
  assert.equal(report.valid, false);
  assert.deepEqual(report.errors, ['bundle.observations[2] is invalid']);
  assert.equal(report.counts.total, 0);
});

test('exchange serialization enforces file and record limits', () => {
  const records = Array.from({ length: MAX_INTERCHANGE_RECORDS + 1 }, (_, index) => (
    observation(`018fd116-8cf0-7def-8abc-${index.toString(16).padStart(12, '0')}`)
  ));
  const tooMany = createObservationInterchangeBundle({
    exportedAt,
    observations: records,
    observationSets: [],
    memberships: [],
  });
  assert.throws(
    () => serializeObservationInterchangeBundle(tooMany),
    new RegExp(`maximum is ${MAX_INTERCHANGE_RECORDS}`),
  );

  const tooLarge = createObservationInterchangeBundle({
    exportedAt,
    observations: [{ ...observation('018fd116-8cf0-7def-8abc-1234567890ae'), rawContent: 'x'.repeat(MAX_INTERCHANGE_FILE_BYTES) }],
    observationSets: [],
    memberships: [],
  });
  assert.throws(
    () => serializeObservationInterchangeBundle(tooLarge),
    /serialized bundle is .* maximum is 2000000/,
  );
});
