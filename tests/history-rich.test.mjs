import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {loadLabeledRounds, loadPriceSeries, contextPath, buildSnapshots, snapshotFeatures, longerContext, SNAPSHOT_OFFSETS_SEC, RICH_VERSION} from '../src/history_rich.mjs';

function seed() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-rich-'));
  const s = new Store(dir);
  const base = 1791300000; // minute-aligned
  // 10 venue rounds, alternating UP/DOWN + 1 VOID (excluded from labels)
  for (let i = 0; i < 10; i++) {
    const ts = base + i * 60;
    const up = i % 2 === 0;
    s.saveHistoricalRound({id: `btc-${ts}`, startMs: ts * 1000, endMs: (ts + 60) * 1000,
      openMicro: '84000000000', closeMicro: up ? '84001000000' : '83999000000',
      result: up ? 'UP' : 'DOWN', raw: {}}, 'VENUE_RECORDED', Date.now());
  }
  const vt = base + 10 * 60;
  s.saveHistoricalRound({id: `btc-${vt}`, startMs: vt * 1000, endMs: (vt + 60) * 1000,
    openMicro: '84000000000', closeMicro: '84000000000', result: 'VOID', raw: {}}, 'VENUE_RECORDED_VOID', Date.now());
  // 60s price grid over the span (deliberately NOT second-dense)
  for (let t = base - 3600; t <= vt + 120; t += 60)
    s.db.prepare('INSERT OR IGNORE INTO historical_prices(source_ts_ms,queried_at_ms,received_at_ms,price_usd,raw_sha,provenance) VALUES(?,?,?,?,?,?)')
      .run(t * 1000, Date.now(), Date.now(), 84000 + (t % 97) * 0.1, 'h', 'HISTORICAL_BACKFILL');
  return {s, base};
}

test('labels are venue UP/DOWN only; VOID excluded', () => {
  const {s} = seed();
  const rows = loadLabeledRounds(s);
  assert.equal(rows.length, 10);
  assert.ok(rows.every(r => r.result === 'UP' || r.result === 'DOWN'));
  s.close();
});

test('snapshots use only timestamps at or before cutoff (future never enters)', () => {
  const {s, base} = seed();
  const prices = loadPriceSeries(s);
  const openSec = base + 5 * 60;
  const before = buildSnapshots(openSec, prices);
  assert.deepEqual(Object.keys(before).length, SNAPSHOT_OFFSETS_SEC.length);
  // Poison all prices strictly after T-1s cutoff with absurd values.
  for (const [k, v] of prices) if (k > (openSec - 1) * 1000) prices.set(k, 1e9);
  const after = buildSnapshots(openSec, prices);
  assert.deepEqual(after, before); // identical: future had zero influence
  // But the T-1s snapshot itself must see the T-1s price when present.
  prices.set((openSec - 1) * 1000, 12345.67);
  const withCutoff = buildSnapshots(openSec, prices);
  assert.equal(withCutoff['T-1s'].last, 12345.67);
  // And T-2s must NOT see it (cutoff one second earlier).
  assert.notEqual(withCutoff['T-2s'].last, 12345.67);
  s.close();
});

test('snapshot at exact cutoff second is included, next second excluded', () => {
  const prices = new Map([[(1000) * 1000, 100], [(1001) * 1000, 200]]);
  const f = snapshotFeatures(prices, 1000);
  assert.equal(f.last, 100); // 200 (t=1001) invisible at asOf=1000
  s_close_helper();
  function s_close_helper() {}
});

test('context path has no interpolation; gaps stay null', () => {
  const {s, base} = seed();
  const prices = loadPriceSeries(s);
  const openSec = base + 5 * 60;
  const ctx = contextPath(openSec, prices, 600, 60);
  assert.equal(ctx.path.length, 661);
  assert.equal(ctx.path[600], prices.get(openSec * 1000)); // index `back` == open
  const nulls = ctx.path.filter(v => v == null).length;
  assert.ok(nulls > 600); // 60s grid: only ~11 of 661 exact seconds present
  assert.equal(ctx.coverage.back600.tot, 600);
  s.close();
});

test('longer context is past-only and deterministic', () => {
  const {s, base} = seed();
  const prices = loadPriceSeries(s);
  const openSec = base + 8 * 60;
  const dirs = ['UP', 'DOWN', 'UP', 'UP', 'DOWN', 'UP', 'DOWN', 'DOWN'];
  const a = longerContext(openSec, prices, dirs);
  const b = longerContext(openSec, prices, dirs);
  assert.deepEqual(a, b);
  assert.equal(a.prev_10_dirs.length, 8);
  assert.equal(a.streak_before, 2); // last two DOWN
  assert.ok(a.m30.n >= a.m5.n);
  // Poison future: no change.
  for (const [k] of prices) if (k >= openSec * 1000) prices.set(k, -1);
  assert.deepEqual(longerContext(openSec, prices, dirs), a);
  s.close();
});

test('rich version pinned', () => {
  assert.match(RICH_VERSION, /history-rich-v1/);
});
