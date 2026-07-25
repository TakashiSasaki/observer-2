import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('v2 interchange schema uses only normalized top-level entity arrays', () => {
  const schema = readJson('schemas/observation-interchange.schema.json');
  assert.equal(schema.properties.schemaVersion.const, '2.0.0');
  assert.deepEqual(Object.keys(schema.properties).sort(), ['exportedAt', 'memberships', 'observationSets', 'observations', 'schemaVersion']);
  assert.equal(schema.$defs.Observation.properties.parentSetId, undefined);
  assert.equal(schema.$defs.ObservationSet.properties.observationIds, undefined);
  assert.equal(schema.$defs.ObservationSet.properties.observations, undefined);
  assert.equal(schema.$defs.ObservationSetMembership.properties.id.description.includes('observationSetId'), true);
});

test('repository excludes generated patch artifacts', () => {
  const patchArtifacts = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^patch.*\.diff$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(patchArtifacts, []);
});

test('blueprint, Firebase configuration, indexes, and rules name the same three v2 collections', () => {
  const blueprint = readJson('firebase-blueprint.json');
  const firebase = readJson('firebase.json');
  const indexes = readJson('firestore.indexes.json');
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');

  assert.equal(blueprint.schemaVersion, '2.0.0');
  assert.deepEqual(Object.keys(blueprint.collections).sort(), ['observationSetMemberships', 'observationSets', 'observations', 'users']);
  assert.equal(firebase.firestore.rules, 'firestore.rules');
  assert.equal(firebase.firestore.indexes, 'firestore.indexes.json');
  assert.equal(indexes.indexes.some((index) => index.collectionGroup === 'observationSetMemberships'), true);
  assert.match(rules, /match \/observations\/\{observationId\}/);
  assert.match(rules, /match \/observationSets\/\{observationSetId\}/);
  assert.match(rules, /match \/observationSetMemberships\/\{membershipId\}/);
  assert.doesNotMatch(rules, /singleObservations/);
  assert.match(rules, /membershipId == data\.observationSetId \+ '__' \+ data\.observationId/);
  assert.match(rules, /allow delete: if false/);
});

test('client persistence uses the normalized collections and never writes v1 relationship fields', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/firebaseService.ts'), 'utf8');
  assert.match(service, /FIRESTORE_COLLECTIONS\.observations/);
  assert.match(service, /FIRESTORE_COLLECTIONS\.observationSets/);
  assert.match(service, /FIRESTORE_COLLECTIONS\.memberships/);
  assert.match(service, /buildObservationSetViews/);
  assert.match(service, /attachObservationToSet/);
  assert.match(service, /detachObservationFromSet/);
  assert.match(service, /updateObservation/);
  assert.doesNotMatch(service, /parentSetId/);
  assert.doesNotMatch(service, /observationIds/);
  assert.doesNotMatch(service, /singleObservations/);
});
