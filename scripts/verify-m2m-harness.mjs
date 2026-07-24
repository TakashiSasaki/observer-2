import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(process.cwd(), file), 'utf-8'));
const getRaw = (file) => fs.readFileSync(path.join(process.cwd(), file));

let hasError = false;
const error = (msg) => {
  console.error(`ERROR: ${msg}`);
  hasError = true;
};

const reqs = readJson('audit/m2m/requirements.json');
const catalog = readJson('audit/m2m/verification-catalog.json');
const manual = readJson('audit/m2m/manual-checks.json');
const wps = readJson('audit/m2m/work-packages.json');
const progress = readJson('audit/m2m/progress.json');
const lock = readJson('audit/m2m/registry-lock.json');

const expectedReqs = ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11", "R12"];
const expectedCatalog = ["H01", "H02", "D01", "D02", "D03", "D04", "D05", "D06", "F01", "F02", "F03", "F04", "X01", "X02", "X03", "X04", "L01"];
const expectedManual = ["M01", "M02", "M03"];
const expectedWps = ["WP00", "WP01", "WP02", "WP03", "WP04", "WP05", "WP06", "WP07"];
const expectedExecutionPlanes = {
  H01: "ai-local", H02: "external",
  D01: "ai-local", D02: "ai-local", D03: "ai-local", D04: "ai-local", D05: "ai-local", D06: "ai-local",
  F01: "external", F02: "ai-local", F03: "ai-local", F04: "external",
  X01: "ai-local", X02: "ai-local", X03: "ai-local", X04: "ai-local",
  L01: "ai-local"
};

const checkKeys = (obj, expected, name) => {
  const keys = Object.keys(obj);
  const extra = keys.filter(k => !expected.includes(k));
  const missing = expected.filter(k => !keys.includes(k));
  if (extra.length) error(`Unknown IDs in ${name}: ${extra.join(', ')}`);
  if (missing.length) error(`Missing IDs in ${name}: ${missing.join(', ')}`);
};

checkKeys(reqs, expectedReqs, 'requirements');
checkKeys(catalog, expectedCatalog, 'verification-catalog');
checkKeys(manual, expectedManual, 'manual-checks');
checkKeys(wps, expectedWps, 'work-packages');

// executionPlane checks
for (const [id, entry] of Object.entries(catalog)) {
  if (expectedExecutionPlanes[id] && entry.executionPlane !== expectedExecutionPlanes[id]) {
    error(`executionPlane mismatch for ${id}: expected ${expectedExecutionPlanes[id]}, got ${entry.executionPlane}`);
  }
}

// all reqs covered
const coveredReqs = new Set();
Object.values(catalog).forEach(c => c.requirementIds && c.requirementIds.forEach(r => coveredReqs.add(r)));
expectedReqs.forEach(r => {
  if (!coveredReqs.has(r)) error(`Requirement ${r} is not covered by any verification.`);
});

// Hash check
const hash = crypto.createHash('sha256');
hash.update(getRaw('audit/m2m/requirements.json'));
hash.update(getRaw('audit/m2m/verification-catalog.json'));
hash.update(getRaw('audit/m2m/manual-checks.json'));
hash.update(getRaw('audit/m2m/work-packages.json'));
const actualHash = hash.digest('hex');
if (actualHash !== lock.hash) {
  error(`Registry lock hash mismatch. Expected ${lock.hash}, got ${actualHash}`);
}

// AI Studio spoofing check
if (progress.H02 === 'EXTERNAL_PASS' || progress.F01 === 'EXTERNAL_PASS' || progress.F04 === 'EXTERNAL_PASS') {
  error('AI Studio cannot set EXTERNAL_PASS for external verifications');
}

// skip, todo, only in tests/m2m
const testDir = path.join(process.cwd(), 'tests/m2m');
if (fs.existsSync(testDir)) {
  const testFiles = fs.readdirSync(testDir).filter(f => f.endsWith('.test.mjs') || f.endsWith('.test.js'));
  testFiles.forEach(f => {
    const content = fs.readFileSync(path.join(testDir, f), 'utf-8');
    if (content.includes('.skip') || content.includes('.todo') || content.includes('.only')) {
      error(`Found .skip, .todo, or .only in ${f}`);
    }
  });
}

if (hasError) {
  process.exit(1);
}
