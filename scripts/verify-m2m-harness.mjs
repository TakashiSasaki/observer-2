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

const getRawBuffer = (file) => {
  try {
    return fs.readFileSync(path.join(rootDir, file));
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

const parseJsonSafe = (buf, name) => {
  if (buf === null) {
    return { value: null, ok: false };
  }
  if (buf.length === 0) {
    error(`Empty JSON document in ${name}`);
    return { value: null, ok: false };
  }
  let jsonString;
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    jsonString = decoder.decode(buf);
  } catch (err) {
    error(`Invalid UTF-8 encoding in ${name}: ${err.message}`);
    return { value: null, ok: false };
  }
  if (jsonString.trim().length === 0) {
    error(`Empty JSON document in ${name}`);
    return { value: null, ok: false };
  }

  const res = findDuplicateKeysInJson(jsonString);
  if (res.duplicates.length > 0) {
    res.duplicates.forEach(d => {
      error(`Duplicate key in ${name} at ${d.path}: '${d.key}'`);
    });
  }
  if (res.syntaxError) {
    error(`Syntax error in ${name}: ${res.syntaxError}`);
    return { value: null, ok: false };
  }
  try {
    const val = JSON.parse(jsonString);
    return { value: val, ok: true };
  } catch (e) {
    error(`Syntax error in ${name}: ${e.message}`);
    return { value: null, ok: false };
  }
};

const safeStr = (v) => {
  try {
    return JSON.stringify(v);
  } catch (e) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    if (typeof v === 'object') return 'object';
    return typeof v;
  }
};

const checkIsObject = (parsedRes, name) => {
  if (!parsedRes.ok) return null;
  const val = parsedRes.value;
  if (val === null || typeof val !== 'object' || Array.isArray(val)) {
    const actualType = val === null ? 'null' : Array.isArray(val) ? 'array' : typeof val;
    error(`${name} root must be a JSON object, got ${actualType}`);
    return null;
  }
  return val;
};

const rawReqs = getRawBuffer('audit/m2m/requirements.json');
const rawCatalog = getRawBuffer('audit/m2m/verification-catalog.json');
const rawManual = getRawBuffer('audit/m2m/manual-checks.json');
const rawWps = getRawBuffer('audit/m2m/work-packages.json');
const rawProgress = getRawBuffer('audit/m2m/progress.json');
const rawLock = getRawBuffer('audit/m2m/registry-lock.json');

const reqs = checkIsObject(parseJsonSafe(rawReqs, 'requirements.json'), 'requirements.json');
const catalog = checkIsObject(parseJsonSafe(rawCatalog, 'verification-catalog.json'), 'verification-catalog.json');
const manual = checkIsObject(parseJsonSafe(rawManual, 'manual-checks.json'), 'manual-checks.json');
const wps = checkIsObject(parseJsonSafe(rawWps, 'work-packages.json'), 'work-packages.json');
const progress = checkIsObject(parseJsonSafe(rawProgress, 'progress.json'), 'progress.json');
const lock = checkIsObject(parseJsonSafe(rawLock, 'registry-lock.json'), 'registry-lock.json');

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

const checkObjectFixedStringValues = (obj, expectedKeys, name) => {
  if (!obj) return;
  const keys = Object.keys(obj);
  const extra = keys.filter(k => !expectedKeys.includes(k));
  const missing = expectedKeys.filter(k => !keys.includes(k));
  if (extra.length) error(`Unknown IDs in ${name}: ${extra.join(', ')}`);
  if (missing.length) error(`Missing IDs in ${name}: ${missing.join(', ')}`);
  for (const k of expectedKeys) {
    if (k in obj) {
      const v = obj[k];
      if (typeof v !== 'string' || v.trim().length === 0) {
        error(`Value for ${k} in ${name} must be a non-empty string, got ${safeStr(v)}`);
      }
    }
  }
};

checkObjectFixedStringValues(reqs, expectedReqs, 'requirements.json');
checkObjectFixedStringValues(manual, expectedManual, 'manual-checks.json');
checkObjectFixedStringValues(wps, expectedWps, 'work-packages.json');

// Exact catalog mapping checks
if (catalog) {
  const catalogKeys = Object.keys(catalog);
  const expectedCatalogKeys = Object.keys(expectedCatalogSpecs);
  const extraCatalogKeys = catalogKeys.filter(k => !expectedCatalogKeys.includes(k));
  const missingCatalogKeys = expectedCatalogKeys.filter(k => !catalogKeys.includes(k));

  if (extraCatalogKeys.length) error(`Unknown IDs in verification-catalog: ${extraCatalogKeys.join(', ')}`);
  if (missingCatalogKeys.length) error(`Missing IDs in verification-catalog: ${missingCatalogKeys.join(', ')}`);

  const coveredReqs = new Set();
  for (const [id, expectedSpec] of Object.entries(expectedCatalogSpecs)) {
    if (!(id in catalog)) continue;
    const entry = catalog[id];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      const actualType = entry === null ? 'null' : Array.isArray(entry) ? 'array' : typeof entry;
      error(`verification-catalog item ${id} must be an object, got ${actualType}`);
      continue;
    }

    const entryKeys = Object.keys(entry);
    const expectedEntryKeys = ['executionPlane', 'requirementIds'];
    const extraEntryKeys = entryKeys.filter(k => !expectedEntryKeys.includes(k));
    const missingEntryKeys = expectedEntryKeys.filter(k => !entryKeys.includes(k));
    let keysMatch = true;
    if (extraEntryKeys.length) {
      error(`Unknown keys in verification-catalog item ${id}: ${extraEntryKeys.join(', ')}`);
      keysMatch = false;
    }
    if (missingEntryKeys.length) {
      error(`Missing keys in verification-catalog item ${id}: ${missingEntryKeys.join(', ')}`);
      keysMatch = false;
    }

    let planeMatch = false;
    if ('executionPlane' in entry) {
      if (typeof entry.executionPlane !== 'string') {
        error(`executionPlane mismatch for ${id}: expected '${expectedSpec.executionPlane}', got ${safeStr(entry.executionPlane)}`);
      } else if (entry.executionPlane !== expectedSpec.executionPlane) {
        error(`executionPlane mismatch for ${id}: expected '${expectedSpec.executionPlane}', got ${safeStr(entry.executionPlane)}`);
      } else {
        planeMatch = true;
      }
    }

    let reqMatch = false;
    if ('requirementIds' in entry) {
      if (!Array.isArray(entry.requirementIds)) {
        error(`requirementIds for ${id} must be an array, got ${safeStr(entry.requirementIds)}`);
      } else {
        const isStringArray = entry.requirementIds.every(x => typeof x === 'string');
        if (!isStringArray) {
          error(`requirementIds mismatch for ${id}: expected [${expectedSpec.requirementIds.join(', ')}], got ${safeStr(entry.requirementIds)}`);
        } else {
          const isSameLength = entry.requirementIds.length === expectedSpec.requirementIds.length;
          const isSameElements = isSameLength && entry.requirementIds.every((r, idx) => r === expectedSpec.requirementIds[idx]);
          if (!isSameElements) {
            error(`requirementIds mismatch for ${id}: expected [${expectedSpec.requirementIds.join(', ')}], got ${safeStr(entry.requirementIds)}`);
          } else {
            reqMatch = true;
          }
        }
      }
    }

    if (id !== 'H01' && id !== 'H02' && keysMatch && planeMatch && reqMatch) {
      entry.requirementIds.forEach(r => coveredReqs.add(r));
    }
  }

  expectedReqs.forEach(r => {
    if (!coveredReqs.has(r)) {
      error(`Requirement ${r} is not covered by any valid non-meta verification.`);
    }
  });
}

// Registry lock object validation
if (lock) {
  const lockKeys = Object.keys(lock);
  const extraLockKeys = lockKeys.filter(k => k !== 'hash');
  if (!('hash' in lock)) {
    error(`Missing 'hash' key in registry-lock.json`);
  }
  if (extraLockKeys.length > 0) {
    error(`Unknown keys in registry-lock.json: ${extraLockKeys.join(', ')}`);
  }
  if ('hash' in lock) {
    if (typeof lock.hash !== 'string' || !/^[0-9a-f]{64}$/.test(lock.hash)) {
      error(`registry-lock.json 'hash' must be a 64-character lowercase hexadecimal string`);
    }
  }
}

// Registry Hash check
if (rawReqs !== null && rawCatalog !== null && rawManual !== null && rawWps !== null) {
  const hash = crypto.createHash('sha256');
  hash.update(rawReqs);
  hash.update(rawCatalog);
  hash.update(rawManual);
  hash.update(rawWps);
  const actualHash = hash.digest('hex');
  if (lock && typeof lock.hash === 'string' && /^[0-9a-f]{64}$/.test(lock.hash) && actualHash !== lock.hash) {
    error(`Registry lock hash mismatch. Expected ${lock.hash}, got ${actualHash}`);
  }
}

// Progress state constraints
if (progress) {
  const expectedProgressKeys = [
    "packetId", "attempt", "externalBaseCommit", "externalBaseCommitVerifiedByAgent",
    "H01", "H02", "D01", "D02", "D03", "D04", "D05", "D06",
    "F01", "F02", "F03", "F04", "X01", "X02", "X03", "X04", "L01",
    "M01", "M02", "M03",
    "WP00", "WP01", "WP02", "WP03", "WP04", "WP05", "WP06", "WP07"
  ];
  const progressKeys = Object.keys(progress);
  const extraProgressKeys = progressKeys.filter(k => !expectedProgressKeys.includes(k));
  const missingProgressKeys = expectedProgressKeys.filter(k => !progressKeys.includes(k));
  if (extraProgressKeys.length) error(`Unknown keys in progress.json: ${extraProgressKeys.join(', ')}`);
  if (missingProgressKeys.length) error(`Missing keys in progress.json: ${missingProgressKeys.join(', ')}`);

  if ('packetId' in progress && progress.packetId !== 'WP00') {
    error(`progress.json packetId must be 'WP00', got ${safeStr(progress.packetId)}`);
  }
  if ('attempt' in progress && progress.attempt !== 'A6') {
    error(`progress.json attempt must be 'A6', got ${safeStr(progress.attempt)}`);
  }
  if ('externalBaseCommit' in progress && progress.externalBaseCommit !== 'ab1431144e2eb2b671cdd3b16f6c994d8a409e76') {
    error(`progress.json externalBaseCommit mismatch: expected 'ab1431144e2eb2b671cdd3b16f6c994d8a409e76', got ${safeStr(progress.externalBaseCommit)}`);
  }
  if ('externalBaseCommitVerifiedByAgent' in progress && progress.externalBaseCommitVerifiedByAgent !== false) {
    error(`progress.json externalBaseCommitVerifiedByAgent must be false, got ${safeStr(progress.externalBaseCommitVerifiedByAgent)}`);
  }
  if ('H01' in progress && progress.H01 !== 'LOCAL_PASS') {
    error(`progress.json H01 state must be 'LOCAL_PASS', got ${safeStr(progress.H01)}`);
  }
  if ('H02' in progress && progress.H02 !== 'EXTERNAL_PENDING') {
    error(`progress.json H02 state must be 'EXTERNAL_PENDING', got ${safeStr(progress.H02)}`);
  }

  const plannedKeys = [
    "D01", "D02", "D03", "D04", "D05", "D06",
    "F01", "F02", "F03", "F04",
    "X01", "X02", "X03", "X04", "L01",
    "M01", "M02", "M03",
    "WP00", "WP01", "WP02", "WP03", "WP04", "WP05", "WP06", "WP07"
  ];
  for (const id of plannedKeys) {
    if (id in progress && progress[id] !== 'PLANNED') {
      error(`progress.json ${id} state must be 'PLANNED', got ${safeStr(progress[id])}`);
    }
  }

  if (progress.WP00 === 'ACCEPTED') {
    error(`progress.json WP00 state cannot be 'ACCEPTED', got ${safeStr(progress.WP00)}`);
  }
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
