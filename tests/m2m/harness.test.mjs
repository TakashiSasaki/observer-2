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
  
  // copy original files
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
    return { success: false, output: err.stderr.toString() };
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

test('正しいレジストリを受理する', () => {
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
  assert.match(res.output, /Missing IDs in requirements: R12/);
});

test('未知の検証ID追加を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => { d['H99'] = { executionPlane: 'ai-local', requirementIds: [] }; });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Unknown IDs in verification-catalog: H99/);
});

test('実際の重複キーを拒否する', () => {
  const tmp = setupTemp();
  const raw = fs.readFileSync(path.join(tmp, 'audit/m2m/verification-catalog.json'), 'utf-8');
  // Inject duplicate H01 at the very end
  const duplicateRaw = raw.replace(/}\s*$/, ',\n  "H01": { "executionPlane": "ai-local", "requirementIds": [] }\n}');
  writeRawFile(tmp, 'verification-catalog.json', duplicateRaw);
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Duplicate key in verification-catalog\.json: H01/);
});

test('未知要件参照を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['F02'].requirementIds.push('R99');
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Unknown requirement ID referenced in F02: R99/);
});

test('参照切れまたは非メタ検証・手動確認によるカバレッジ不足を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['X04'].requirementIds = [];
    d['L01'].requirementIds = ["R01"]; // removed R12
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Requirement R12 is not covered/);
});

test('H01またはH02だけがある要件を参照しても、カバー済みと扱わない', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['X04'].requirementIds = [];
    d['L01'].requirementIds = ["R01"]; // removed R12
    d['H01'].requirementIds = ["R12"]; // Only covered by H01 now
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Requirement R12 is not covered/);
});

test('SHA-256不一致を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'requirements.json', d => { d['R12'] = "Changed text"; });
  // Intentionally not rehashing
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Registry lock hash mismatch/);
});

test('H02をEXTERNAL_PENDING以外の任意の状態にした場合も拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => { d['H02'] = 'EXTERNAL_PASS'; });
  let res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /H02 state must be EXTERNAL_PENDING/);
  
  updateFile(tmp, 'progress.json', d => { d['H02'] = 'LOCAL_PASS'; });
  res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /H02 state must be EXTERNAL_PENDING/);
});

test('H02以外の外部検証をAI Studioが完了扱いにする偽装を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => { d['F01'] = 'EXTERNAL_PASS'; });
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /AI Studio cannot set EXTERNAL_PASS/);
});
