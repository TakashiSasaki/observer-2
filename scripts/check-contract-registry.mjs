import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registryPath = path.join(root, 'contracts/registry.json');
const legacySchemaPath = path.join(root, 'schemas/observation-interchange.schema.json');
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

const fail = (message) => {
  throw new Error(`Contract registry check failed: ${message}`);
};

const readJson = (filePath, label) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`${label} cannot be read as JSON (${error.message})`);
  }
};

const requireString = (value, label) => {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a non-empty string`);
  return value;
};

const resolveRepositoryPath = (relativePath, label) => {
  requireString(relativePath, label);
  if (path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
    fail(`${label} must be a repository-relative path without parent traversal`);
  }
  const resolved = path.resolve(root, relativePath);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (!resolved.startsWith(rootPrefix)) fail(`${label} escapes the repository root`);
  return resolved;
};

const assertNoExternalRefs = (value, location = '$') => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoExternalRefs(item, `${location}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;

  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && (typeof child !== 'string' || !child.startsWith('#'))) {
      fail(`${location}.$ref must be a same-document fragment reference`);
    }
    assertNoExternalRefs(child, `${location}.${key}`);
  }
};

if (!fs.existsSync(registryPath)) fail('contracts/registry.json is missing');
if (fs.existsSync(legacySchemaPath)) fail('legacy schemas/observation-interchange.schema.json must not exist');

const registry = readJson(registryPath, 'contracts/registry.json');
if (!Number.isInteger(registry.registryVersion) || registry.registryVersion !== 1) {
  fail('registryVersion must be 1');
}
if (!Array.isArray(registry.contracts) || registry.contracts.length === 0) {
  fail('contracts must be a non-empty array');
}

const contractIds = new Set();
const releaseKeys = new Set();
const manifestPaths = new Set();
let releaseCount = 0;

for (const [contractIndex, contract] of registry.contracts.entries()) {
  const contractId = requireString(contract?.contractId, `contracts[${contractIndex}].contractId`);
  if (contractIds.has(contractId)) fail(`duplicate contract ID: ${contractId}`);
  contractIds.add(contractId);
  if (!Array.isArray(contract.releases) || contract.releases.length === 0) {
    fail(`${contractId}.releases must be a non-empty array`);
  }

  for (const [releaseIndex, release] of contract.releases.entries()) {
    const version = requireString(release?.version, `${contractId}.releases[${releaseIndex}].version`);
    const releaseKey = `${contractId}@${version}`;
    if (releaseKeys.has(releaseKey)) fail(`duplicate release: ${releaseKey}`);
    releaseKeys.add(releaseKey);
    const manifestRelativePath = requireString(
      release?.manifest,
      `${releaseKey}.manifest`,
    );
    if (manifestPaths.has(manifestRelativePath)) fail(`manifest is referenced more than once: ${manifestRelativePath}`);
    manifestPaths.add(manifestRelativePath);
    const manifestPath = resolveRepositoryPath(manifestRelativePath, `${releaseKey}.manifest`);
    if (!fs.existsSync(manifestPath)) fail(`manifest does not exist: ${manifestRelativePath}`);

    const manifest = readJson(manifestPath, `${releaseKey} manifest`);
    if (manifest.contractId !== contractId) fail(`${releaseKey} manifest contractId does not match registry`);
    if (manifest.contractVersion !== version) fail(`${releaseKey} manifest contractVersion does not match registry`);
    requireString(manifest.profile, `${releaseKey}.profile`);
    requireString(manifest.status, `${releaseKey}.status`);
    const schemaId = requireString(manifest.schemaId, `${releaseKey}.schemaId`);
    if (!uuidV4Pattern.test(schemaId)) fail(`${releaseKey}.schemaId must be a lowercase UUIDv4`);
    const expectedSchemaUri = `urn:uuid:${schemaId}`;
    if (manifest.schemaUri !== expectedSchemaUri) fail(`${releaseKey}.schemaUri must equal ${expectedSchemaUri}`);

    const schemaPath = resolveRepositoryPath(manifest.schemaPath, `${releaseKey}.schemaPath`);
    if (!fs.existsSync(schemaPath)) fail(`schema does not exist: ${manifest.schemaPath}`);
    const schema = readJson(schemaPath, `${releaseKey} schema`);
    if (schema.$id !== expectedSchemaUri) fail(`${releaseKey} schema $id does not match schemaUri`);
    if (schema.properties?.schemaVersion?.const !== version) {
      fail(`${releaseKey} schema properties.schemaVersion.const does not match the release version`);
    }
    assertNoExternalRefs(schema);

    const schemaBytes = fs.readFileSync(schemaPath);
    const actualSha256 = crypto.createHash('sha256').update(schemaBytes).digest('hex');
    if (!sha256Pattern.test(manifest.schemaSha256)) fail(`${releaseKey}.schemaSha256 must be lowercase hexadecimal SHA-256`);
    if (manifest.schemaSha256 !== actualSha256) fail(`${releaseKey}.schemaSha256 does not match ${manifest.schemaPath}`);
    releaseCount += 1;
  }
}

console.log(`Contract registry OK: ${contractIds.size} contract(s), ${releaseCount} release(s)`);
