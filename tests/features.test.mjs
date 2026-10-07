import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildTape, featuresRich, snapshotsForRound, SNAPSHOT_HORIZONS_S} from '../src/features.mjs';

const AT = 1791360000000;
const mk = (n, stepMs = 1000, base = 84000) => Array.from({length: n}, (_, i) => ({
  price: base + i*0.1, sourceMs: AT - (n-1-i)*stepMs, receivedMs: AT - (n-1-i)*stepMs,
  provenance: 'LIVE_RECEIVED_WS', raw: {}}));
test('tape emits one row per second with NULL gaps, never filled', () => {
  const ticks = [...mk(5, 1000), ...mk(5, 1000, 84100).map(t => ({...t, sourceMs: t.sourceMs + 8000, receivedMs: t.receivedMs + 8000}))];
  const {rows} = buildTape(ticks);
  const missing = rows.filter(r => r.quality === 'MISSING');
  assert.ok(missing.length >= 3);
  assert.ok(missing.every(r => r.price === null));
  const ok = rows.filter(r => r.quality === 'OK');
  assert.ok(ok.every(r => r.tickCount >= 1 && r.min <= r.max));
});
test('features are deterministic', () => {
  const t = mk(120);
  assert.deepEqual(featuresRich(t, AT, {}), featuresRich(t, AT, {}));
});
test('receive-time cutoff excludes future-received ticks', () => {
  const t = mk(120);
  const leak = {price: 90000, sourceMs: AT - 5000, receivedMs: AT + 10000, provenance: 'LIVE_RECEIVED_WS', raw: {}};
  const a = featuresRich(t, AT - 1000, {});
  const b = featuresRich([...t, leak], AT - 1000, {});
  assert.deepEqual(a, b);
});
test('stale feed returns null, low coverage flagged', () => {
  assert.equal(featuresRich(mk(2, 1000, 84000).map(t => ({...t, sourceMs: t.sourceMs - 60000, receivedMs: t.receivedMs - 60000})), AT, {}), null);
  const f = featuresRich(mk(7), AT, {});
  assert.ok(f.quality.quality_flags.includes('LOW_COVERAGE'));
});
test('pool and next-round fields are null with documented reasons', () => {
  const f = featuresRich(mk(120), AT, {prevLabels: ['UP','DOWN','UP']});
  assert.equal(f.values.up_pool, null);
  assert.ok(f.quality.missing_fields.some(m => m.startsWith('up_pool')));
  assert.equal(f.values.distance_from_current_open_bps, null);
  assert.equal(f.values.previous_round_direction, 'UP');
  assert.equal(f.values.previous_2_sequence, 'DOWNUP');
  assert.equal(f.values.previous_3_sequence, 'UPDOWNUP');
});
test('multi-horizon snapshots share implementation and cutoffs', () => {
  const t = mk(200);
  const round = {id: 'r', startMs: AT + 60000, endMs: AT + 120000};
  const snaps = snapshotsForRound(round, t, {prevLabels: ['UP']});
  assert.equal(snaps.length, SNAPSHOT_HORIZONS_S.length);
  assert.deepEqual(snaps.map(s => s.horizonS), SNAPSHOT_HORIZONS_S);
  assert.ok(snaps.every(s => s.cutoffMs === round.startMs - s.horizonS*1000));
});
test('replay from shuffled raw order reproduces identical features (order-independent)', () => {
  const t = mk(120);
  const rev = [...t].reverse();
  assert.deepEqual(featuresRich(t, AT, {}), featuresRich(rev, AT, {}));
  assert.deepEqual(buildTape(t), buildTape(rev));
});
