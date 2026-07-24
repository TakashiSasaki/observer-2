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
  } catch (e) {
    error(`Missing file: ${file}`);
    return null;
  }
};

function findDuplicateKeysInJson(jsonString) {
  let pos = 0;
  const duplicates = [];

  function skipWhitespace() {
    while (pos < jsonString.length) {
      const ch = jsonString[pos];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        pos++;
      } else {
        break;
      }
    }
  }

  function parseString() {
    const start = pos;
    pos++; // skip opening quote '"'
    while (pos < jsonString.length) {
      const ch = jsonString[pos];
      if (ch === '\\') {
        pos += 2; // skip escape character and next char
      } else if (ch === '"') {
        pos++; // skip closing quote
        const rawStrToken = jsonString.slice(start, pos);
        return JSON.parse(rawStrToken);
      } else {
        pos++;
      }
    }
    throw new SyntaxError('Unterminated string in JSON');
  }

  function parseValue(pathStr = 'root') {
    skipWhitespace();
    if (pos >= jsonString.length) {
      throw new SyntaxError('Unexpected end of JSON input');
    }
    const ch = jsonString[pos];
    if (ch === '{') {
      parseObject(pathStr);
    } else if (ch === '[') {
      parseArray(pathStr);
    } else if (ch === '"') {
      parseString();
    } else if (ch === 't' || ch === 'f' || ch === 'n' || ch === '-' || (ch >= '0' && ch <= '9')) {
      parsePrimitive();
    } else {
      throw new SyntaxError(`Unexpected character '${ch}' at position ${pos}`);
    }
  }

  function parsePrimitive() {
    const start = pos;
    while (pos < jsonString.length) {
      const ch = jsonString[pos];
      if (' \t\n\r,}]'.includes(ch)) {
        break;
      }
      pos++;
    }
    const raw = jsonString.slice(start, pos);
    if (raw !== 'true' && raw !== 'false' && raw !== 'null' && isNaN(Number(raw))) {
      throw new SyntaxError(`Invalid literal '${raw}' at position ${start}`);
    }
  }

  function parseArray(pathStr) {
    pos++; // skip '['
    skipWhitespace();
    if (jsonString[pos] === ']') {
      pos++;
      return;
    }
    let index = 0;
    while (pos < jsonString.length) {
      parseValue(`${pathStr}[${index}]`);
      skipWhitespace();
      if (jsonString[pos] === ',') {
        pos++;
        index++;
      } else if (jsonString[pos] === ']') {
        pos++;
        break;
      } else {
        throw new SyntaxError(`Expected ',' or ']' in array at position ${pos}`);
      }
    }
  }

  function parseObject(pathStr) {
    pos++; // skip '{'
    skipWhitespace();
    if (jsonString[pos] === '}') {
      pos++;
      return;
    }
    const keysSeen = new Set();
    while (pos < jsonString.length) {
      skipWhitespace();
      if (jsonString[pos] !== '"') {
        throw new SyntaxError(`Expected string key in object at position ${pos}`);
      }
      const key = parseString();
      if (keysSeen.has(key)) {
        duplicates.push({ path: pathStr, key });
      } else {
        keysSeen.add(key);
      }
      skipWhitespace();
      if (jsonString[pos] !== ':') {
        throw new SyntaxError(`Expected ':' after key '${key}' in object at position ${pos}`);
      }
      pos++; // skip ':'
      parseValue(`${pathStr}.${key}`);
      skipWhitespace();
      if (jsonString[pos] === ',') {
        pos++;
      } else if (jsonString[pos] === '}') {
        pos++;
        break;
      } else {
        throw new SyntaxError(`Expected ',' or '}' in object at position ${pos}`);
      }
    }
  }

  try {
    parseValue();
  } catch (err) {
    return { syntaxError: err.message, duplicates };
  }

  return { syntaxError: null, duplicates };
}

const parseJsonSafe = (raw, name) => {
  if (!raw) return null;
  const res = findDuplicateKeysInJson(raw);
  if (res.syntaxError) {
    error(`Syntax error in ${name}: ${res.syntaxError}`);
    return null;
  }
  if (res.duplicates.length > 0) {
    res.duplicates.forEach(d => {
      error(`Duplicate key in ${name} at ${d.path}: '${d.key}'`);
    });
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
const expectedManual = ["M01", "M02", "M03"];
const expectedWps = ["WP00", "WP01", "WP02", "WP03", "WP04", "WP05", "WP06", "WP07"];

const expectedCatalogSpecs = {
  "H01": { executionPlane: "ai-local", requirementIds: [] },
  "H02": { executionPlane: "external", requirementIds: [] },
  "D01": { executionPlane: "ai-local", requirementIds: ["R01", "R03"] },
  "D02": { executionPlane: "ai-local", requirementIds: ["R02"] },
  "D03": { executionPlane: "ai-local", requirementIds: ["R04"] },
  "D04": { executionPlane: "ai-local", requirementIds: ["R05"] },
  "D05": { executionPlane: "ai-local", requirementIds: ["R06"] },
  "D06": { executionPlane: "ai-local", requirementIds: ["R07"] },
  "F01": { executionPlane: "external", requirementIds: ["R08"] },
  "F02": { executionPlane: "ai-local", requirementIds: ["R10"] },
  "F03": { executionPlane: "ai-local", requirementIds: ["R07", "R09"] },
  "F04": { executionPlane: "external", requirementIds: ["R08", "R09"] },
  "X01": { executionPlane: "ai-local", requirementIds: ["R11"] },
  "X02": { executionPlane: "ai-local", requirementIds: ["R11"] },
  "X03": { executionPlane: "ai-local", requirementIds: ["R03", "R11"] },
  "X04": { executionPlane: "ai-local", requirementIds: ["R12"] },
  "L01": { executionPlane: "ai-local", requirementIds: ["R01", "R12"] }
};

const checkKeys = (obj, expected, name) => {
  const keys = Object.keys(obj);
  const extra = keys.filter(k => !expected.includes(k));
  const missing = expected.filter(k => !keys.includes(k));
  if (extra.length) error(`Unknown IDs in ${name}: ${extra.join(', ')}`);
  if (missing.length) error(`Missing IDs in ${name}: ${missing.join(', ')}`);
};

checkKeys(reqs, expectedReqs, 'requirements.json');
checkKeys(manual, expectedManual, 'manual-checks.json');
checkKeys(wps, expectedWps, 'work-packages.json');

// Exact catalog mapping checks
const catalogKeys = Object.keys(catalog);
const expectedCatalogKeys = Object.keys(expectedCatalogSpecs);
const extraCatalogKeys = catalogKeys.filter(k => !expectedCatalogKeys.includes(k));
const missingCatalogKeys = expectedCatalogKeys.filter(k => !catalogKeys.includes(k));

if (extraCatalogKeys.length) error(`Unknown IDs in verification-catalog: ${extraCatalogKeys.join(', ')}`);
if (missingCatalogKeys.length) error(`Missing IDs in verification-catalog: ${missingCatalogKeys.join(', ')}`);

for (const [id, expectedSpec] of Object.entries(expectedCatalogSpecs)) {
  const entry = catalog[id];
  if (!entry) continue;

  if (entry.executionPlane !== expectedSpec.executionPlane) {
    error(`executionPlane mismatch for ${id}: expected '${expectedSpec.executionPlane}', got '${entry.executionPlane}'`);
  }

  if (!Array.isArray(entry.requirementIds)) {
    error(`requirementIds for ${id} must be an array`);
  } else {
    const isSameLength = entry.requirementIds.length === expectedSpec.requirementIds.length;
    const isSameElements = isSameLength && entry.requirementIds.every((r, idx) => r === expectedSpec.requirementIds[idx]);
    if (!isSameElements) {
      error(`requirementIds mismatch for ${id}: expected [${expectedSpec.requirementIds.join(', ')}], got [${entry.requirementIds.join(', ')}]`);
    }
  }
}

// Requirement coverage check excluding H01 and H02
const coveredReqs = new Set();
for (const [id, entry] of Object.entries(catalog)) {
  if (id !== 'H01' && id !== 'H02' && Array.isArray(entry.requirementIds)) {
    entry.requirementIds.forEach(r => coveredReqs.add(r));
  }
}
expectedReqs.forEach(r => {
  if (!coveredReqs.has(r)) {
    error(`Requirement ${r} is not covered by any valid non-meta verification.`);
  }
});

// Registry Hash check
const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(path.join(rootDir, 'audit/m2m/requirements.json')));
hash.update(fs.readFileSync(path.join(rootDir, 'audit/m2m/verification-catalog.json')));
hash.update(fs.readFileSync(path.join(rootDir, 'audit/m2m/manual-checks.json')));
hash.update(fs.readFileSync(path.join(rootDir, 'audit/m2m/work-packages.json')));
const actualHash = hash.digest('hex');
if (actualHash !== lock.hash) {
  error(`Registry lock hash mismatch. Expected ${lock.hash}, got ${actualHash}`);
}

// Progress state constraints
if (progress.packetId !== 'WP00') {
  error(`progress.json packetId must be 'WP00', got '${progress.packetId}'`);
}
if (progress.attempt !== 'A3') {
  error(`progress.json attempt must be 'A3', got '${progress.attempt}'`);
}
if (progress.externalBaseCommit !== 'ad3de2e99dcc86e23ea4df89ff0038f744fecebf') {
  error(`progress.json externalBaseCommit mismatch: expected 'ad3de2e99dcc86e23ea4df89ff0038f744fecebf', got '${progress.externalBaseCommit}'`);
}
if (progress.externalBaseCommitVerifiedByAgent !== false) {
  error(`progress.json externalBaseCommitVerifiedByAgent must be false`);
}
if (progress.H01 !== 'LOCAL_PASS') {
  error(`progress.json H01 state must be 'LOCAL_PASS', got '${progress.H01}'`);
}
if (progress.H02 !== 'EXTERNAL_PENDING') {
  error(`progress.json H02 state must be 'EXTERNAL_PENDING', got '${progress.H02}'`);
}

const otherAutoVerifications = ["D01", "D02", "D03", "D04", "D05", "D06", "F01", "F02", "F03", "F04", "X01", "X02", "X03", "X04", "L01"];
for (const id of otherAutoVerifications) {
  if (progress[id] !== 'PLANNED') {
    error(`progress.json ${id} state must be 'PLANNED', got '${progress[id]}'`);
  }
}

if (progress.WP00 === 'ACCEPTED') {
  error(`progress.json WP00 state cannot be 'ACCEPTED'`);
}

// Check test files for .skip, .todo, .only
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
