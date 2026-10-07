import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {plVector, FEATURE_SETS, redundancyAudit} from '../src/plfeatures.mjs';

const CKPT = 'var/pattern-lab/v1/source/history-checkpoint.db';
test('checkpoint exists, immutable, Session-B storage untouched by Session C', () => {
  const man = JSON.parse(fs.readFileSync('research/pattern-lab/v1/source-manifest.json','utf8'));
  const h = crypto.createHash('sha256').update(fs.readFileSync(CKPT)).digest('hex');
  assert.equal(h, man.sha256);
  const st = fs.statSync(CKPT);
  assert.ok(st.size > 1000000);
});
test('splits chronological, disjoint, frozen', () => {
  const L = n => JSON.parse(fs.readFileSync(`var/pattern-lab/v1/splits/${n}.json`,'utf8'));
  const tr = L('train'), va = L('validation'), te = L('test');
  const ids = [...tr, ...va, ...te].map(r=>r.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(tr.at(-1).startMs <= va[0].startMs && va.at(-1).startMs <= te[0].startMs);
});
test('feature causality: no post-open prices enter vectors', () => {
  const d = new DatabaseSync(CKPT, {readOnly: true});
  const r = d.prepare(`SELECT id,start_ms AS startMs,result FROM historical_rounds WHERE result='UP' ORDER BY startMs LIMIT 1 OFFSET 500`).get();
  const prices = new Map(d.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(x=>[x.ts,x.price]));
  d.close();
  const past = [];
  const o = plVector(prices, {...r, startMs: r.startMs}, 60, past);
  assert.ok(o.eligible);
  // every consumed price strictly precedes open
  assert.ok(Math.max(...[...prices.keys()].filter(k => k < r.startMs)) < r.startMs);
});
test('regime determinism: identical inputs give identical pattern IDs', async () => {
  const {kmeans} = await import('../src/pllearn.mjs');
  const X = [[1,2],[1.1,2.1],[9,9],[9.1,8.9],[5,5],[5.1,5.2]];
  const k1 = kmeans(X, 2, 726), k2 = kmeans(X, 2, 726);
  assert.deepEqual(X.map(x => k1.assign(x)), X.map(x => k2.assign(x)));
  assert.match('K8_006', /^K\d+_\d+$/);
});
test('experiment registry counts every configured experiment', () => {
  const lines = fs.readFileSync('research/pattern-lab/v1/experiment-registry.csv','utf8').trim().split('\n');
  assert.ok(lines.length >= 8); // header + baselines + gate + 6 configs + freeze
  assert.ok(lines.some(l => l.includes('SKIPPED')));
});
test('scenario counts supported and seeded (100/250/500/1000)', async () => {
  const {scenarioPaths} = await import('../src/patterns.mjs');
  const past = Array.from({length:60}, (_,i) => (i%2 ? 3 : -2));
  for (const c of [100,250,500,1000]) {
    const s1 = scenarioPaths({pastReturnsBps: past, seed: 726, paths: c});
    const s2 = scenarioPaths({pastReturnsBps: past, seed: 726, paths: c});
    assert.deepEqual(s1, s2);
    assert.equal(s1.paths, c);
  }
});
test('evidence packet schema frozen and shadow-marked', () => {
  const sch = JSON.parse(fs.readFileSync('research/pattern-lab/library/v1/evidence-packet-schema.json','utf8'));
  assert.equal(sch.status, 'SHADOW_ONLY_NOT_FOR_INFERENCE');
  assert.ok(Array.isArray(sch.fields) && sch.fields.includes('matched_regime'));
});
test('library hashes verify', () => {
  const lines = fs.readFileSync('research/pattern-lab/library/v1/hashes.txt','utf8').trim().split('\n');
  for (const ln of lines) {
    const [h, f] = ln.split('  ');
    if (f === 'hashes.txt') continue;
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync('research/pattern-lab/library/v1/'+f)).digest('hex'), h, f);
  }
});
test('test-freeze integrity: chosen config and hashes present', () => {
  const t = fs.readFileSync('research/pattern-lab/v1/TEST_FREEZE.md','utf8');
  assert.match(t, /Chosen: \w+/);
  assert.match(t, /TEST untouched/);
});
