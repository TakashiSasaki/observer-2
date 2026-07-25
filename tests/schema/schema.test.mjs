import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

test('v2 interchange schema uses only normalized top-level entity arrays', () => {
  const schema = readJson('schemas/observation-interchange.schema.json');
  const interchange = fs.readFileSync(path.join(root, 'src/domain/observationInterchange.ts'), 'utf8');
  assert.equal(schema.properties.schemaVersion.const, '2.0.0');
  assert.deepEqual(Object.keys(schema.properties).sort(), ['exportedAt', 'memberships', 'observationSets', 'observations', 'schemaVersion']);
  assert.equal(schema.$defs.Observation.properties.parentSetId, undefined);
  assert.equal(schema.$defs.ObservationSet.properties.observationIds, undefined);
  assert.equal(schema.$defs.ObservationSet.properties.observations, undefined);
  assert.equal(schema.$defs.ObservationSetMembership.properties.id.description.includes('observationSetId'), true);
  assert.match(interchange, /assertObservationInterchangeBundle/);
  assert.match(interchange, /parseObservationInterchangeBundle/);
  assert.match(interchange, /serializeObservationInterchangeBundle/);
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
  const appPage = fs.readFileSync(path.join(root, 'src/pages/AppPage.tsx'), 'utf8');
  const detailModal = fs.readFileSync(path.join(root, 'src/components/ObservationDetailModal.tsx'), 'utf8');
  assert.match(service, /FIRESTORE_COLLECTIONS\.observations/);
  assert.match(service, /FIRESTORE_COLLECTIONS\.observationSets/);
  assert.match(service, /FIRESTORE_COLLECTIONS\.memberships/);
  assert.match(service, /buildObservationSetViews/);
  assert.match(service, /attachObservationToSet/);
  assert.match(service, /detachObservationFromSet/);
  assert.match(service, /fetchOwnedActiveObservations/);
  assert.match(service, /updateObservation/);
  assert.match(service, /observationSetFeedQueryPlan/);
  assert.match(service, /membershipProjectionQueryPlan/);
  assert.match(service, /ownedObservationPickerQueryPlan/);
  assert.match(appPage, /onAttachObservation/);
  assert.match(appPage, /onDetachObservation/);
  assert.match(detailModal, /既存の観測をこのセットへ追加/);
  assert.match(detailModal, /このセットから外す/);
  assert.doesNotMatch(service, /parentSetId/);
  assert.doesNotMatch(service, /observationIds/);
  assert.doesNotMatch(service, /singleObservations/);
});

test('v1 migration and backward compatibility are explicitly out of scope for the empty data set', () => {
  const decisions = readJson('audit/m2m/decisions.json');
  const blueprint = readJson('firebase-blueprint.json');
  const developerDocs = fs.readFileSync(path.join(root, 'src/pages/DevDocPage.tsx'), 'utf8');

  assert.equal(decisions.v1FirestoreDataPolicy, 'not-required-current-data-empty');
  assert.equal(blueprint.v1FirestoreDataPolicy, 'not-required-current-data-empty');
  assert.match(developerDocs, /現在のデータ数はゼロ/);
  assert.match(developerDocs, /移行・読取り互換・インポート互換は実装しません/);
});

test('Firestore Emulator validation is isolated to a demo project and explicitly provisions Java in CI', () => {
  const firebase = readJson('firebase.json');
  const packageJson = readJson('package.json');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/m2m-baseline.yml'), 'utf8');

  assert.equal(firebase.emulators.singleProjectMode, true);
  assert.equal(firebase.emulators.firestore.port, 8080);
  assert.equal(firebase.emulators.ui.enabled, false);
  assert.match(packageJson.scripts['test:firestore:emulator'], /firebase emulators:exec --only firestore/);
  assert.match(packageJson.scripts['test:firestore:emulator'], /--project demo-observer-2/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /actions\/setup-java@v4/);
  assert.match(workflow, /java-version: '21'/);
  assert.match(workflow, /npm run test:firestore:emulator/);
});

test('first-time coding agents have a complete and ordered documentation entry point', () => {
  const requiredDocuments = [
    'README.md',
    'AGENTS.md',
    'docs/application-specification.md',
    'docs/data-contract-2.0.0.md',
    'docs/work-packages.md',
    'audit/m2m/README.md',
  ];
  for (const file of requiredDocuments) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} must exist`);
    assert.ok(fs.readFileSync(path.join(root, file), 'utf8').trim().length > 0, `${file} must not be empty`);
  }

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(readme, /Start here/);
  assert.match(readme, /docs\/application-specification\.md/);
  assert.match(readme, /docs\/data-contract-2\.0\.0\.md/);
  assert.match(readme, /docs\/work-packages\.md/);
  assert.match(agents, /Source-of-truth map/);
  assert.match(agents, /Do not write directly to `main`/);
  assert.match(agents, /successful empty remote read/i);
  assert.match(agents, /RemoteDataIntegrityError/);
});

test('application documentation distinguishes implemented surfaces from reserved surfaces', () => {
  const specification = fs.readFileSync(path.join(root, 'docs/application-specification.md'), 'utf8');
  const developerPage = fs.readFileSync(path.join(root, 'src/pages/DevDocPage.tsx'), 'utf8');

  for (const pathName of ['`/`', '`/app`', '`/admin`', '`/dev`', '`/api`', '`/test`']) {
    assert.match(specification, new RegExp(pathName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(specification, /\/admin` \| Reserved/);
  assert.match(specification, /\/test` \| Implemented/);
  assert.match(specification, /versioned subpaths such as `\/api\/v1/);
  assert.match(developerPage, /概要・サーフェス/);
  assert.match(developerPage, /WP00〜WP07/);
  assert.match(developerPage, /CURRENT_SCHEMA_VERSION/);
  assert.match(developerPage, /in-memory受入れハーネス/);
});

test('restored developer documentation describes the normalized model without reviving the old hybrid model', () => {
  const developerPage = fs.readFileSync(path.join(root, 'src/pages/DevDocPage.tsx'), 'utf8');
  const contract = fs.readFileSync(path.join(root, 'docs/data-contract-2.0.0.md'), 'utf8');
  const workPackages = fs.readFileSync(path.join(root, 'docs/work-packages.md'), 'utf8');
  const auditReadme = fs.readFileSync(path.join(root, 'audit/m2m/README.md'), 'utf8');

  assert.match(developerPage, /正本コレクション/);
  assert.match(developerPage, /独立したACL/);
  assert.match(developerPage, /交換bundle 2\.0\.0/);
  assert.match(developerPage, /禁止するlegacy形状/);
  assert.doesNotMatch(developerPage, /ハイブリッドモデル（現在採用中）/);
  assert.doesNotMatch(developerPage, /展開済みキャッシュを保持/);

  assert.match(contract, /ObservationSetMembership/);
  assert.match(contract, /Never send a view to a Firestore entity converter/);
  assert.match(contract, /not currently specified as RFC 8785 JCS/);
  assert.match(workPackages, /4 further iterations after this change/);
  assert.match(workPackages, /WP06.*\*\*partial\*\*/);
  assert.match(auditReadme, /not the\s+current implementation status/);
});

test('production server build does not rely on import.meta inside its CommonJS output', () => {
  const server = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  const packageJson = readJson('package.json');
  assert.doesNotMatch(server, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(server, /process\.argv\.includes\('--production'\)/);
  assert.match(packageJson.scripts.start, /--production/);
});

test('exchange UI is owner-scoped, bounded, and explicitly no-write', () => {
  const exchangePanel = fs.readFileSync(path.join(root, 'src/components/ObservationExchangePanel.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'src/services/firebaseService.ts'), 'utf8');
  const modal = fs.readFileSync(path.join(root, 'src/components/ObservationModal.tsx'), 'utf8');
  const appPage = fs.readFileSync(path.join(root, 'src/pages/AppPage.tsx'), 'utf8');
  const rawImportTypes = fs.readFileSync(path.join(root, 'src/vite-env.d.ts'), 'utf8');

  assert.match(exchangePanel, /exportOwnedObservationInterchangeBundle/);
  assert.match(exchangePanel, /dryRunOwnedObservationInterchangeImport/);
  assert.match(exchangePanel, /Firestoreには書き込んでいません/);
  assert.match(service, /createObservationInterchangeBundle/);
  assert.match(service, /analyzeObservationInterchangeImport/);
  assert.match(service, /never writes to\s+\* Firestore/);
  assert.match(modal, /観測セットを作成/);
  assert.match(modal, /captureMode === 'composite'/);
  assert.match(appPage, /ObservationExchangePanel/);
  assert.match(appPage, /isRemoteDataIntegrityError/);
  assert.match(rawImportTypes, /\*\?raw/);
});

test('remote reads use typed failures, principal-scoped cache, and current-request ordering', () => {
  const service = fs.readFileSync(path.join(root, 'src/services/firebaseService.ts'), 'utf8');
  const remotePolicy = fs.readFileSync(path.join(root, 'src/domain/remoteReadPolicy.ts'), 'utf8');
  const cachePolicy = fs.readFileSync(path.join(root, 'src/domain/cachePolicy.ts'), 'utf8');
  const appPage = fs.readFileSync(path.join(root, 'src/pages/AppPage.tsx'), 'utf8');
  const specification = fs.readFileSync(path.join(root, 'docs/application-specification.md'), 'utf8');

  assert.match(remotePolicy, /class RemoteReadError/);
  assert.match(remotePolicy, /isRecoverableRemoteReadError/);
  assert.match(cachePolicy, /NORMALIZED_CACHE_MAX_AGE_MS/);
  assert.match(service, /LOCAL_STORAGE_KEY_PREFIX/);
  assert.match(service, /remote-required/);
  assert.match(service, /filterMode === 'mine'/);
  assert.match(service, /permission-denied.*not-found/);
  assert.match(appPage, /loadSequence/);
  assert.match(appPage, /requestId !== loadSequence\.current/);
  assert.match(specification, /five-minute freshness/);
});

test('the /test surface is an in-memory acceptance harness and is not a Firestore write path', () => {
  const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');
  const testPage = fs.readFileSync(path.join(root, 'src/pages/TestPage.tsx'), 'utf8');
  const harness = fs.readFileSync(path.join(root, 'src/domain/observationAcceptanceHarness.ts'), 'utf8');

  assert.match(app, /path="\/test"/);
  assert.match(testPage, /Firestore\/Authへの接続・書込みを行いません/);
  assert.match(testPage, /runObservationAcceptanceHarness/);
  assert.match(harness, /M01/);
  assert.match(harness, /M02/);
  assert.match(harness, /M03/);
  assert.doesNotMatch(testPage, /firebaseService/);
  assert.doesNotMatch(harness, /firebaseService|from ['"].*firebase/);
});
