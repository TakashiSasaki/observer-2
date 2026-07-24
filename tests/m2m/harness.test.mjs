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

const writeRawFile = (tmpDir, file, rawData) => {
  const p = path.join(tmpDir, 'audit/m2m', file);
  fs.writeFileSync(p, rawData);
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

  updateFile(tmp, 'progress.json', d => {
    d['F04'] = 'PLANNED';
    d['D01'] = 'LOCAL_PASS';
  });
  res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /progress.json D01 state must be 'PLANNED'/);
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

test('requirements.jsonをraw JSON構文エラーにし、progress.jsonのH02をLOCAL_PASSにした場合、両方が報告されること', () => {
  const tmp = setupTemp();
  writeRawFile(tmp, 'requirements.json', '{ "R01": "Invalid json", }');
  updateFile(tmp, 'progress.json', d => {
    d['H02'] = 'LOCAL_PASS';
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Syntax error in requirements\.json/);
  assert.match(res.output, /H02 state must be 'EXTERNAL_PENDING'/);
});

test('R12をすべての非メタ検証から外し、H01だけにR12を追加した場合、固定対応不一致とカバレッジ診断が出ること', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['X04'].requirementIds = d['X04'].requirementIds.filter(r => r !== 'R12');
    d['L01'].requirementIds = d['L01'].requirementIds.filter(r => r !== 'R12');
    d['H01'].requirementIds.push('R12');
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /requirementIds mismatch for H01/);
  assert.match(res.output, /Requirement R12 is not covered by any valid non-meta verification/);
});

test('H02の requirementIds が空配列でない場合を拒否すること', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['H02'].requirementIds = ['R01'];
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /requirementIds mismatch for H02/);
});

test('packetId、attempt、externalBaseCommit、externalBaseCommitVerifiedByAgent の各不正値を拒否すること', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => {
    d['packetId'] = 'WP99';
  });
  let res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /packetId must be 'WP00'/);

  updateFile(tmp, 'progress.json', d => {
    d['packetId'] = 'WP00';
    d['attempt'] = 'A99';
  });
  res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /attempt must be 'A5'/);

  updateFile(tmp, 'progress.json', d => {
    d['attempt'] = 'A5';
    d['externalBaseCommit'] = 'badcommit';
  });
  res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /externalBaseCommit mismatch/);

  updateFile(tmp, 'progress.json', d => {
    d['externalBaseCommit'] = '4c0753f4d495bfc03056ec330c554647a8405a4b';
    d['externalBaseCommitVerifiedByAgent'] = true;
  });
  res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /externalBaseCommitVerifiedByAgent must be false/);
});

// New A5 regression tests

test('空の progress.json を拒否し、空文書であることを示す診断を確認する', () => {
  const tmp = setupTemp();
  writeRawFile(tmp, 'progress.json', '');
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Empty JSON document in progress\.json/);
});

test('progress.json のルートを null、false、0、[] のそれぞれへ変更した場合を拒否する', () => {
  const tmp = setupTemp();
  const badRoots = ['null', 'false', '0', '[]'];
  for (const rootVal of badRoots) {
    writeRawFile(tmp, 'progress.json', rootVal);
    const res = runVerify(tmp);
    assert.strictEqual(res.success, false);
    assert.match(res.output, /progress\.json root must be a JSON object/);
  }
});

test('空の registry-lock.json を拒否する', () => {
  const tmp = setupTemp();
  writeRawFile(tmp, 'registry-lock.json', '');
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Empty JSON document in registry-lock\.json/);
});

test('registry-lock.json のルートが null の場合を拒否する', () => {
  const tmp = setupTemp();
  writeRawFile(tmp, 'registry-lock.json', 'null');
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /registry-lock\.json root must be a JSON object, got null/);
});

test('requirements.json のルートを null へ変更し、変更後 raw bytes に合わせて lock を再計算しても拒否する', () => {
  const tmp = setupTemp();
  writeRawFile(tmp, 'requirements.json', 'null');
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /requirements\.json root must be a JSON object, got null/);
});

test('固定レジストリ4ファイルのそれぞれについて、ルートが object でない場合を拒否する', () => {
  const tmp = setupTemp();
  const regFiles = ['requirements.json', 'verification-catalog.json', 'manual-checks.json', 'work-packages.json'];
  for (const f of regFiles) {
    writeRawFile(tmp, f, '[]');
    rehash(tmp);
    const res = runVerify(tmp);
    assert.strictEqual(res.success, false);
    assert.match(res.output, new RegExp(`${f.replace('.', '\\.')} root must be a JSON object, got array`));
    // Restore file
    fs.copyFileSync(path.join(SRC_AUDIT_DIR, f), path.join(tmp, 'audit/m2m', f));
  }
});

test('verification-catalog.json の D01 などを null にし、同時に progress.json の H02 を LOCAL_PASS にした場合', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'verification-catalog.json', d => {
    d['D01'] = null;
  });
  updateFile(tmp, 'progress.json', d => {
    d['H02'] = 'LOCAL_PASS';
  });
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /verification-catalog item D01 must be an object, got null/);
  assert.match(res.output, /progress\.json H02 state must be 'EXTERNAL_PENDING'/);
  assert.doesNotMatch(res.output, /TypeError/);
});

test('同一 raw JSON 内で、先に重複キーを置き、その後に構文エラーを置いた場合、重複キー診断と構文エラー診断の両方が出る', () => {
  const tmp = setupTemp();
  const badRaw = `{\n  "H01": { "executionPlane": "ai-local", "executionPlane": "external" },\n  "syntaxErrorHere":\n}`;
  writeRawFile(tmp, 'verification-catalog.json', badRaw);
  rehash(tmp);
  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Duplicate key in verification-catalog\.json at root\.H01: 'executionPlane'/);
  assert.match(res.output, /Syntax error in verification-catalog\.json/);
});

test('registry-lock.json の hash 欠落、不正な長さ、大文字16進、非16進文字、追加キーをそれぞれ拒否する', () => {
  const tmp = setupTemp();
  const badLocks = [
    { data: '{}', expected: /Missing 'hash' key in registry-lock\.json/ },
    { data: '{"hash": "1234"}', expected: /registry-lock\.json 'hash' must be a 64-character lowercase hexadecimal string/ },
    { data: '{"hash": "45426D21E93A3293EA6521C9DF5070A0DAB9F3D05F99DEC0943C182D1663B426"}', expected: /registry-lock\.json 'hash' must be a 64-character lowercase hexadecimal string/ },
    { data: `{"hash": "${'g'.repeat(64)}"}`, expected: /registry-lock\.json 'hash' must be a 64-character lowercase hexadecimal string/ },
    { data: '{"hash": "45426d21e93a3293ea6521c9df5070a0dab9f3d05f99dec0943c182d1663b426", "extra": 1}', expected: /Unknown keys in registry-lock\.json: extra/ },
  ];
  for (const testCase of badLocks) {
    writeRawFile(tmp, 'registry-lock.json', testCase.data);
    const res = runVerify(tmp);
    assert.strictEqual(res.success, false);
    assert.match(res.output, testCase.expected);
  }
});

test('progress.json の必須キー欠落と未知キー追加を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => {
    delete d['packetId'];
  });
  let res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Missing keys in progress\.json: packetId/);

  updateFile(tmp, 'progress.json', d => {
    d['packetId'] = 'WP00';
    d['extraKey'] = true;
  });
  res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Unknown keys in progress\.json: extraKey/);
});

test('M01〜M03およびWP00〜WP07のいずれかを PLANNED 以外に変更した場合を拒否する', () => {
  const tmp = setupTemp();
  updateFile(tmp, 'progress.json', d => {
    d['M01'] = 'LOCAL_PASS';
  });
  let res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /progress\.json M01 state must be 'PLANNED'/);

  updateFile(tmp, 'progress.json', d => {
    d['M01'] = 'PLANNED';
    d['WP01'] = 'LOCAL_PASS';
  });
  res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /progress\.json WP01 state must be 'PLANNED'/);
});

test('固定レジストリ raw bytes へ不正な UTF-8 byte を挿入し、その実際の Buffer に合わせて lock を再計算した場合', () => {
  const tmp = setupTemp();
  const reqPath = path.join(tmp, 'audit/m2m/requirements.json');
  const buf = fs.readFileSync(reqPath);
  const badBuf = Buffer.concat([buf, Buffer.from([0xFF, 0xFF])]);
  fs.writeFileSync(reqPath, badBuf);

  // Hash using actual raw buffers
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(path.join(tmp, 'audit/m2m/requirements.json')));
  hash.update(fs.readFileSync(path.join(tmp, 'audit/m2m/verification-catalog.json')));
  hash.update(fs.readFileSync(path.join(tmp, 'audit/m2m/manual-checks.json')));
  hash.update(fs.readFileSync(path.join(tmp, 'audit/m2m/work-packages.json')));
  const lock = { hash: hash.digest('hex') };
  fs.writeFileSync(path.join(tmp, 'audit/m2m/registry-lock.json'), JSON.stringify(lock, null, 2));

  const res = runVerify(tmp);
  assert.strictEqual(res.success, false);
  assert.match(res.output, /Invalid UTF-8 encoding in requirements\.json/);
  assert.doesNotMatch(res.output, /Registry lock hash mismatch/);
});
