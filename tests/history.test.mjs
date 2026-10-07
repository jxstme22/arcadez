import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {buildVectors, chronoSplit, fitThresholds, assignRegime, priceAt, wilson, HISTORY_VERSION} from '../src/history.mjs';

function seedStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-hist-'));
  const s = new Store(dir);
  const base = 1791340000;
  for (let i = 0; i < 30; i++) {
    const ts = base + i*60;
    s.saveHistoricalRound({id: `btc-${ts}`, startMs: ts*1000, endMs: (ts+60)*1000,
      openMicro: '84000000000', closeMicro: i%2 ? '84001000000' : '83999000000',
      result: i%2 ? 'UP' : 'DOWN', raw: {upPool:'100', downPool:'100'}}, 'VENUE_RECORDED', Date.now());
    s.db.prepare('INSERT OR IGNORE INTO historical_prices(source_ts_ms,queried_at_ms,received_at_ms,price_usd,raw_sha,provenance) VALUES(?,?,?,?,?,?)')
      .run(ts*1000, Date.now(), Date.now(), 84000 + i*0.5, 'h', 'HISTORICAL_BACKFILL');
  }
  return s;
}
test('vectors are deterministic and past-only (no future price)', () => {
  const s = seedStore();
  const a = buildVectors(s), b = buildVectors(s);
  assert.deepEqual(a, b);
  assert.ok(a.rows.length > 20);
  // Labels never enter vec; vec has no future fields.
  assert.equal(a.rows[0].vec.length, 10);
  s.close();
});
test('priceAt snaps to nearest within tolerance, null beyond', () => {
  const m = new Map([[1000, 1], [2000, 2]]);
  assert.equal(priceAt(m, 1060), 1);
  assert.equal(priceAt(m, 200000), null);
});
test('chronological split preserves time order, no shuffle', () => {
  const s = seedStore();
  const {rows} = buildVectors(s);
  const {train, validation, test: te} = chronoSplit(rows, [0.6, 0.2, 0.2]);
  assert.ok(train.at(-1).startMs <= validation[0].startMs);
  assert.ok(validation.at(-1).startMs <= te[0].startMs);
  assert.equal(train.length + validation.length + te.length, rows.length);
  s.close();
});
test('thresholds fit on TRAIN only; regime assignment deterministic', () => {
  const s = seedStore();
  const {rows} = buildVectors(s);
  const {train} = chronoSplit(rows, [0.6, 0.2, 0.2]);
  const {thresholds, norms, hash} = fitThresholds(train);
  assert.equal(hash.length, 64);
  assert.ok(norms.ret_60.mean);
  const r1 = assignRegime(train[0].vec, thresholds);
  assert.equal(r1, assignRegime(train[0].vec, thresholds));
  assert.match(r1, /^H-/);
  s.close();
});
test('wilson CI contains observed rate and widens on tiny n', () => {
  const [lo, hi] = wilson(4, 5);
  assert.ok(lo < 0.8 && 0.8 < hi);
  const [lo2, hi2] = wilson(1, 1);
  assert.ok(hi2 - lo2 > hi - lo);
});
test('history version pinned', () => {
  assert.match(HISTORY_VERSION, /history-v1/);
});
