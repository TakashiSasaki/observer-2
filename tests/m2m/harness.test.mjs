import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import os from 'os';

const SRC_AUDIT_DIR = path.join(process.cwd(), 'audit/m2m');
const VERIFY_SCRIPT = path.join(process.cwd(), 'scripts/verify-m2m-harness.mjs');

const setupTemp = () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm2m-harness-'));
  const tmpAudit = path.join(tmpDir, 'audit/m2m');
  fs.mkdirSync(tmpAudit, { recursive: true });
  
  const files = ['requirements.json', 'verification-catalog.json', 'manual-checks.json', 'work-packages.json', 'progress.json', 'registry-lock.json', 'decisions.json', 'handoff.json'];
  for (const f of files) {
    fs.copyFileSync(path.join(SRC_AUDIT_DIR, f), path.join(tmpAudit, f));
  }
  
  return tmpDir;
};

const runVerify = (cwd) => {
  try {
    execSync(`node "${VERIFY_SCRIPT}" --root "${cwd}"`, { cwd, stdio: 'pipe' });
    return { success: true, output: '' };
  } catch (err) {
    return { success: false, output: err.stderr ? err.stderr.toString() : err.message };
  }
};

const updateFile = (tmpDir, file, mutator) => {
  const p = path.join(tmpDir, 'audit/m2m', file);
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
  mutator(data);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
};

const writeRawFile = (tmpDir, file, rawString) => {
  const p = path.join(tmpDir, 'audit/m2m', file);
  fs.writeFileSync(p, rawString);
};

const rehash = (tmpDir) => {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(path.join(tmpDir, 'audit/m2m/requirements.json')));
  hash.update(fs.readFileSync(path.join(tmpDir, 'audit/m2m/verification-catalog.json')));
  hash.update(fs.readFileSync(path.join(tmpDir, 'audit/m2m/manual-checks.json')));
  hash.update(fs.readFileSync(path.join(tmpDir, 'audit/m2m/work-packages.json')));
  const lock = { hash: hash.digest('hex') };
  fs.writeFileSync(path.join(tmpDir, 'audit/m2m/registry-lock.json'), JSON.stringify(lock, null, 2));
};

test('正しいレジストリと進捗状態を受理する', () => {
  const tmp = setupTemp();
  const res = runVerify(tmp);
  assert.strictEqual(res.success, true, res.output);
});

test('R01〜R12のいずれかの欠落を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'requirements.json', d => { delete d['R12']; });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Missing IDs in requirements/);
});

test('未知の検証ID追加を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['H99'] = { executionPlane: 'ai-local', requirementIds: [] };
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Unknown IDs in verification-catalog: H99/);
});

test('トップレベルで既存の検証IDを実際に二重定義したraw JSONを拒否する', () => {
  const tmp = setupTemp();
  const raw = fs.readFileSync(path.join(tmp, 'audit/m2m/verification-catalog.json'), 'utf-8');
  const duplicateRaw = raw.replace(/}\s*$/, ',\n  "H01": { "executionPlane": "ai-local", "requirementIds": [] }\n}');
  writeRawFile(tmp, 'verification-catalog.json', duplicateRaw);
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Duplicate key in verification-catalog\.json at root: 'H01'/);
});

test('入れ子object内でキーを二重定義したraw JSONを拒否する', () => {
  const tmp = setupTemp();
  const raw = fs.readFileSync(path.join(tmp, 'audit/m2m/verification-catalog.json'), 'utf-8');
  const duplicateRaw = raw.replace('"executionPlane": "ai-local"', '"executionPlane": "ai-local", "executionPlane": "external"');
  writeRawFile(tmp, 'verification-catalog.json', duplicateRaw);
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Duplicate key in verification-catalog\.json at root\.H01: 'executionPlane'/);
});

test('JSON escapeを使って意味上同じ入れ子キーを二重定義したraw JSONを拒否する', () => {
  const tmp = setupTemp();
  const raw = fs.readFileSync(path.join(tmp, 'audit/m2m/verification-catalog.json'), 'utf-8');
  const duplicateRaw = raw.replace('"executionPlane": "ai-local"', '"executionPlane": "ai-local", "execution\\u0050lane": "external"');
  writeRawFile(tmp, 'verification-catalog.json', duplicateRaw);
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Duplicate key in verification-catalog\.json at root\.H01: 'executionPlane'/);
});

test('requirementIds への R99 追加を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['F02'].requirementIds.push('R99');
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /requirementIds mismatch for F02/);
});

test('既知IDだけから成るが固定対応関係と異なる requirementIds を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['D02'].requirementIds.push('R11');
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /requirementIds mismatch for D02/);
});

test('H01またはH02の空でない requirementIds を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['H01'].requirementIds = ['R01'];
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /requirementIds mismatch for H01/);
});

test('指定と異なる executionPlane を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['F01'].executionPlane = 'ai-local';
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /executionPlane mismatch for F01/);
});

test('H01が LOCAL_PASS 以外の場合を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => {
    d['H01'] = 'PLANNED';
  });
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /H01 state must be 'LOCAL_PASS'/);
});

test('H02が EXTERNAL_PENDING 以外の場合を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => {
    d['H02'] = 'EXTERNAL_PASS';
  });
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /H02 state must be 'EXTERNAL_PENDING'/);
});

test('F01、F04、またはその他の未実施自動検証が PLANNED 以外の場合を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => {
    d['F01'] = 'LOCAL_PASS';
  });
  let res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /progress.json F01 state must be 'PLANNED'/);

  updateFile(tmp, 'progress.json', d => {
    d['F01'] = 'PLANNED';
    d['F04'] = 'EXTERNAL_PASS';
  });
  res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /progress.json F04 state must be 'PLANNED'/);
});

test('WP00が ACCEPTED の場合を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => {
    d['WP00'] = 'ACCEPTED';
  });
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /WP00 state cannot be 'ACCEPTED'/);
});

test('SHA-256不一致を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'requirements.json', d => {
    d['R12'] = 'Changed requirement text';
  });
  // Do NOT call rehash(tmp)
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Registry lock hash mismatch/);
});
