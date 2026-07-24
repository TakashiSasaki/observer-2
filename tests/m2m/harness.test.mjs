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
    execSync(`node "${VERIFY_SCRIPT}"`, { cwd, stdio: 'pipe' });
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

test('要件の欠落を拒否する', () => {
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

test('ID重複を拒否する (JSON syntax handles it, but replacing expected with unknown tests it)', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    delete d['H01'];
    d['H01_DUP'] = { executionPlane: 'ai-local', requirementIds: [] };
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Missing IDs in verification-catalog: H01/);
});

test('requirement参照切れを拒否する', () => {
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

test('hash不一致を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'requirements.json', d => { d['R12'] = "Changed text"; });
  // Intentionally not rehashing
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Registry lock hash mismatch/);
});

test('AI Studioによる外部PASSの偽装を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => { d['H02'] = 'EXTERNAL_PASS'; });
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /AI Studio cannot set EXTERNAL_PASS/);
});
