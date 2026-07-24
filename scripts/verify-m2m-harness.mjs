import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let rootDir = process.cwd();
const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
if (rootIndex !== -1 && args[rootIndex + 1]) {
  rootDir = args[rootIndex + 1];
}

let hasError = false;
const error = (msg) => {
  console.error(`ERROR: ${msg}`);
  hasError = true;
};

const getRaw = (file) => {
  try {
    return fs.readFileSync(path.join(rootDir, file), 'utf-8');
  } catch(e) {
    error(`Missing file: ${file}`);
    return null;
  }
};

const findDuplicateTopLevelKeys = (jsonString) => {
  let level = 0;
  let inString = false;
  let escape = false;
  let currentKey = null;
  let keys = new Set();
  
  for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString[i];
      if (inString) {
          if (escape) { escape = false; }
          else if (char === '\\') { escape = true; }
          else if (char === '"') { inString = false; }
          else if (level === 1 && currentKey !== null) { currentKey += char; }
      } else {
          if (char === '{' || char === '[') {
              level++;
          } else if (char === '}' || char === ']') {
              level--;
          } else if (char === '"') {
              inString = true;
              if (level === 1) { currentKey = ''; }
          } else if (char === ':' && level === 1 && currentKey !== null) {
              if (keys.has(currentKey)) return currentKey;
              keys.add(currentKey);
              currentKey = null;
          } else if (char === ',' && level === 1) {
              currentKey = null;
          }
      }
  }
  return null;
};

const parseJsonSafe = (raw, name) => {
  if (!raw) return null;
  const dup = findDuplicateTopLevelKeys(raw);
  if (dup) {
    error(`Duplicate key in ${name}: ${dup}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    error(`Syntax error in ${name}: ${e.message}`);
    return null;
  }
};

const rawReqs = getRaw('audit/m2m/requirements.json');
const rawCatalog = getRaw('audit/m2m/verification-catalog.json');
const rawManual = getRaw('audit/m2m/manual-checks.json');
const rawWps = getRaw('audit/m2m/work-packages.json');
const rawProgress = getRaw('audit/m2m/progress.json');
const rawLock = getRaw('audit/m2m/registry-lock.json');

const reqs = parseJsonSafe(rawReqs, 'requirements.json');
const catalog = parseJsonSafe(rawCatalog, 'verification-catalog.json');
const manual = parseJsonSafe(rawManual, 'manual-checks.json');
const wps = parseJsonSafe(rawWps, 'work-packages.json');
const progress = parseJsonSafe(rawProgress, 'progress.json');
const lock = parseJsonSafe(rawLock, 'registry-lock.json');

if (!reqs || !catalog || !manual || !wps || !progress || !lock) {
  process.exit(1);
}

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

// executionPlane checks and requirementIds subset checks
for (const [id, entry] of Object.entries(catalog)) {
  if (expectedExecutionPlanes[id] && entry.executionPlane !== expectedExecutionPlanes[id]) {
    error(`executionPlane mismatch for ${id}: expected ${expectedExecutionPlanes[id]}, got ${entry.executionPlane}`);
  }
  if (entry.requirementIds) {
    const unknownReqs = entry.requirementIds.filter(r => !expectedReqs.includes(r));
    if (unknownReqs.length) {
      error(`Unknown requirement ID referenced in ${id}: ${unknownReqs.join(', ')}`);
    }
  }
}

// all reqs covered
const coveredReqs = new Set();
Object.entries(catalog).forEach(([id, c]) => {
  if (id !== 'H01' && id !== 'H02' && c.requirementIds) {
    c.requirementIds.forEach(r => coveredReqs.add(r));
  }
});
expectedReqs.forEach(r => {
  if (!coveredReqs.has(r)) error(`Requirement ${r} is not covered by any valid verification.`);
});

// Hash check
const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(path.join(rootDir, 'audit/m2m/requirements.json')));
hash.update(fs.readFileSync(path.join(rootDir, 'audit/m2m/verification-catalog.json')));
hash.update(fs.readFileSync(path.join(rootDir, 'audit/m2m/manual-checks.json')));
hash.update(fs.readFileSync(path.join(rootDir, 'audit/m2m/work-packages.json')));
const actualHash = hash.digest('hex');
if (actualHash !== lock.hash) {
  error(`Registry lock hash mismatch. Expected ${lock.hash}, got ${actualHash}`);
}

// Progress constraints
if (progress.externalBaseCommit !== '7a89fedf79039254a4844772b066fe1159e7268c') {
  error(`externalBaseCommit mismatch`);
}
if (progress.externalBaseCommitVerifiedByAgent !== false) {
  error(`externalBaseCommitVerifiedByAgent must be false`);
}
if (progress.packetId !== 'WP00') {
  error(`packetId must be WP00`);
}
if (progress.attempt !== 'A2') {
  error(`attempt must be A2`);
}
if (progress.H02 !== 'EXTERNAL_PENDING') {
  error(`H02 state must be EXTERNAL_PENDING`);
}
if (progress.WP00 === 'ACCEPTED') {
  error(`WP00 cannot be ACCEPTED`);
}

// AI Studio spoofing check
if (progress.F01 === 'EXTERNAL_PASS' || progress.F04 === 'EXTERNAL_PASS') {
  error('AI Studio cannot set EXTERNAL_PASS for external verifications');
}

// skip, todo, only in tests/m2m
const testDir = path.join(rootDir, 'tests/m2m');
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
