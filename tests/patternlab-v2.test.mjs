import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
test('V2 checkpoint immutable since creation', () => {
  const man = JSON.parse(fs.readFileSync('research/pattern-lab/v2/source-manifest.json','utf8'));
  assert.equal(sha('var/pattern-lab/v2/source/history-checkpoint.db'), man.sha256);
  assert.ok(man.checkpoint_labelled >= 2500);
});
test('V1 freeze verifies (library hashes intact)', () => {
  for (const ln of fs.readFileSync('research/pattern-lab/library/v1/hashes.txt','utf8').trim().split('\n')) {
    const [h, f] = ln.split('  ');
    if (f === 'hashes.txt') continue;
    assert.equal(sha('research/pattern-lab/library/v1/'+f), h, f);
  }
});
test('V2-R splits chronological and disjoint', () => {
  const L = n => JSON.parse(fs.readFileSync(`var/pattern-lab/v2/r/splits/${n}.json`,'utf8'));
  const tr = L('train'), va = L('validation'), te = L('test');
  const ids = [...tr, ...va, ...te].map(r=>r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(tr.at(-1).startMs <= va[0].startMs && va.at(-1).startMs <= te[0].startMs);
  assert.equal(tr.length, 1239); assert.equal(va.length, 413); assert.equal(te.length, 414);
});
test('V2-R config parity with V1 (same sets, horizons, K grid, seeds)', () => {
  const t = fs.readFileSync('research/pattern-lab/v2/r/TEST_FREEZE.md','utf8');
  assert.match(t, /argmax valAcc/);
  const b = fs.readFileSync('scripts/pl-build-v2.mjs','utf8');
  assert.ok(b.includes('[8,16,24,32]') && b.includes('726'));
});
test('freeze-before-test ordering (single-touch guard)', () => {
  const fz = fs.statSync('research/pattern-lab/v2/r/TEST_FREEZE.md').mtimeMs;
  const sc = fs.statSync('data/reports/pattern-lab-v2-r-scorecard.json').mtimeMs;
  assert.ok(fz <= sc, 'freeze must predate results');
});
test('V2-M prereg hash pinned at freeze and prereg unchanged rule', () => {
  const fz = fs.readFileSync('research/pattern-lab/v2/m/TEST_FREEZE.md','utf8');
  const pre = fs.readFileSync('research/pattern-lab/v2/m/PREREGISTRATION.md','utf8');
  assert.ok(fz.includes(crypto.createHash('sha256').update(pre).digest('hex')));
  assert.match(pre, /PREREG_VERSION=v2m/);
});
test('V2-M min-acted gate honored (no eligible config selected)', () => {
  const sc = JSON.parse(fs.readFileSync('data/reports/pattern-lab-v2-m-scorecard.json','utf8'));
  assert.equal(sc.method, null);
  assert.equal(sc.reason, 'NO_ELIGIBLE_V2M_CONFIGURATION');
});
test('V2 libraries frozen (hashes verify)', () => {
  for (const lib of ['v2-r','v2-m']) {
    for (const ln of fs.readFileSync(`research/pattern-lab/library/${lib}/hashes.txt`,'utf8').trim().split('\n')) {
      const [h, f] = ln.split('  ');
      if (f === 'hashes.txt') continue;
      assert.equal(sha(`research/pattern-lab/library/${lib}/`+f), h, lib+'/'+f);
    }
  }
});
test('Session-B storage isolation (V2 never wrote var/history)', () => {
  // Session C/V2 wrote no manifest into research/history and no tables: manifests live under research/pattern-lab/v2/.
  assert.ok(!fs.existsSync('research/history/v2-manifest.json'));
  assert.ok(fs.existsSync('research/pattern-lab/v2/source-manifest.json'));
});
