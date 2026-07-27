import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  validateObservation,
  validateObservationInterchangeBundle,
  validateObservationSet,
  validateObservationSetMembership,
} from '../../src/contracts/validator.ts';
import {
  CONTRACT_ID,
  CONTRACT_PROFILE,
  CONTRACT_VERSION,
  SCHEMA_ID,
  SCHEMA_URI,
} from '../../src/contracts/types.ts';

const root = process.cwd();
const vectorPath = path.join(
  root,
  'contracts/observer-observation-interchange/releases/2.0.0/test-vectors/validation.json',
);
const examplePath = path.join(
  root,
  'contracts/observer-observation-interchange/releases/2.0.0/examples/minimal.json',
);

const vectors = JSON.parse(fs.readFileSync(vectorPath, 'utf8')) as Array<{
  id: string;
  input: unknown;
  expected: {
    valid: boolean;
    diagnostics: Array<{ code: string; instancePath: string }>;
  };
}>;

test('release validation test vectors have stable validity, codes, and JSON Pointers', () => {
  for (const vector of vectors) {
    const result = validateObservationInterchangeBundle(vector.input);
    assert.equal(result.valid, vector.expected.valid, vector.id);
    assert.deepEqual(
      result.diagnostics.map(({ code, instancePath }) => ({ code, instancePath })),
      vector.expected.diagnostics,
      vector.id,
    );
  }
});

test('the published minimal example is accepted by the same validator used by the app', () => {
  const example = JSON.parse(fs.readFileSync(examplePath, 'utf8')) as Record<string, unknown>;
  const result = validateObservationInterchangeBundle(example);
  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics, []);
});

test('contract constants agree with the release manifest identity', () => {
  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, 'contracts/observer-observation-interchange/releases/2.0.0/manifest.json'),
    'utf8',
  )) as Record<string, string>;
  assert.equal(CONTRACT_ID, manifest.contractId);
  assert.equal(CONTRACT_PROFILE, manifest.profile);
  assert.equal(CONTRACT_VERSION, manifest.contractVersion);
  assert.equal(SCHEMA_ID, manifest.schemaId);
  assert.equal(SCHEMA_URI, manifest.schemaUri);
});

test('bundle release Schema validates each canonical resource with the same release identity', () => {
  const example = JSON.parse(fs.readFileSync(examplePath, 'utf8')) as {
    observations: unknown[];
    observationSets: unknown[];
    memberships: unknown[];
  };

  assert.equal(validateObservation(example.observations[0]).valid, true);
  assert.equal(validateObservationSet(example.observationSets[0]).valid, true);
  assert.equal(validateObservationSetMembership(example.memberships[0]).valid, true);
});

test('Draft 2020-12 date-time format is actually enforced', () => {
  const result = validateObservationInterchangeBundle({
    schemaVersion: '2.0.0',
    exportedAt: '2026-07-25T12:30:00',
    observations: [],
    observationSets: [],
    memberships: [],
  });
  assert.equal(result.valid, false);
  assert.equal(result.diagnostics[0]?.code, 'STRUCTURE_INVALID_FORMAT');
  assert.equal(result.diagnostics[0]?.instancePath, '/exportedAt');
  assert.equal(result.diagnostics[0]?.layer, 'structural');
});

test('semantic validation preserves location range invariants outside JSON Schema', () => {
  const example = JSON.parse(fs.readFileSync(examplePath, 'utf8')) as {
    observations: Array<Record<string, unknown>>;
    observationSets: unknown[];
    memberships: unknown[];
  };
  const observation = {
    ...example.observations[0],
    location: { latitude: 91, longitude: 139, accuracy: -1 },
  };
  const result = validateObservationInterchangeBundle({
    schemaVersion: '2.0.0',
    exportedAt: '2026-07-25T12:30:00.000Z',
    observations: [observation],
    observationSets: [],
    memberships: [],
  });
  assert.equal(result.valid, false);
  assert.deepEqual(
    result.diagnostics.map(({ code, instancePath }) => ({ code, instancePath })),
    [
      { code: 'LOCATION_INVALID_RANGE', instancePath: '/observations/0/location/latitude' },
      { code: 'LOCATION_INVALID_RANGE', instancePath: '/observations/0/location/accuracy' },
    ],
  );
});
