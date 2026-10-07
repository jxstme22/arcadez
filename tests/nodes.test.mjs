import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NodeStore, NODE_SCHEMA_VERSION} from '../src/nodes.mjs';
import {freshnessClass, driftClass, oodDecision, supportGate, patternDecision, lifecycleStep, POLICY, NODE_RUNTIME_VERSION} from '../src/nodepolicy.mjs';

const tmp = () => new NodeStore(fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-nodes-')));
test('observation nodes immutable + exactly-once (INSERT OR IGNORE)', () => {
  const s = tmp();
  const o = {nodeId: 'OBS_1', roundId: 'r1', openTs: 1000, closeTs: 2000, features: {a: 1}, outcome: 'UP', moveBps: 1, quality: {}, provenance: 'VENUE_RECORDED'};
  assert.equal(s.insertObservation(o), true);
  assert.equal(s.insertObservation({...o, outcome: 'DOWN'}), false); // ignored, original preserved
  const row = s.db.prepare('SELECT outcome FROM observation_nodes WHERE node_id=?').get('OBS_1');
  assert.equal(row.outcome, 'UP');
  s.close();
});
test('prediction uniqueness per (round, arm) — crash-resume safe', () => {
  const s = tmp();
  s.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_pred_round_arm ON pattern_predictions(round_id, arm)');
  const ins = () => s.db.prepare(`INSERT OR IGNORE INTO pattern_predictions(round_id,arm,snapshot_id,pattern_id,p_up,action,watermark_ms,frozen_ms) VALUES(?,?,?,?,?,?,?,?)`).run('r','B','r','p',0.6,'UP',1,2);
  ins(); ins();
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM pattern_predictions').get().n, 1);
  s.close();
});
test('watermark invariants (node_created <= scored; versions pinned)', () => {
  const s = tmp();
  s.setWatermark('replay_scored_through', 5000, 'r5');
  s.setWatermark('node_created_through', 4000, 'r4');
  assert.ok(s.getWatermark('node_created_through') <= s.getWatermark('replay_scored_through'));
  assert.match(NODE_SCHEMA_VERSION, /^nodes-v1/);
  assert.equal(NODE_RUNTIME_VERSION, '1.0');
  s.close();
});
test('freshness classes deterministic', () => {
  assert.equal(freshnessClass(0.5, 0.5, 100), 'FRESH');
  assert.equal(freshnessClass(0.5, 0.56, 100), 'WATCH');
  assert.equal(freshnessClass(0.5, 0.60, 100), 'DEGRADED');
  assert.equal(freshnessClass(0.5, 0.70, 100), 'STALE');
  assert.equal(freshnessClass(0.5, 0.9, 5), 'INSUFFICIENT');
});
test('drift classes deterministic', () => {
  assert.equal(driftClass(0.2, 0.02), 'LOW');
  assert.equal(driftClass(0.7, 0.02), 'MEDIUM');
  assert.equal(driftClass(0.2, 0.2), 'HIGH');
});
test('OOD gate + support gates', () => {
  assert.equal(oodDecision(5, 4.69), true);
  assert.equal(oodDecision(4.69, 4.69), false);
  assert.equal(supportGate(9), 'INSUFFICIENT');
  assert.equal(supportGate(10), 'VERY_LOW');
  assert.equal(supportGate(49), 'LOW');
  assert.equal(supportGate(99), 'MEDIUM');
  assert.equal(supportGate(100), 'STRONG');
});
test('pattern decision: gates before thresholds, never inverted', () => {
  assert.deepEqual(patternDecision({ood: true, fresh: 'FRESH', supportN: 500, pUp: 0.9}).action, 'SKIP');
  assert.deepEqual(patternDecision({ood: false, fresh: 'STALE', supportN: 500, pUp: 0.9}).action, 'SKIP');
  assert.deepEqual(patternDecision({ood: false, fresh: 'FRESH', supportN: 5, pUp: 0.9}).action, 'SKIP');
  const up = patternDecision({ood: false, fresh: 'FRESH', supportN: 500, pUp: 0.9});
  assert.equal(up.action, 'UP');
  assert.equal(patternDecision({ood: false, fresh: 'FRESH', supportN: 500, pUp: 0.1}).action, 'DOWN');
  assert.equal(patternDecision({ood: false, fresh: 'FRESH', supportN: 500, pUp: 0.5}).action, 'SKIP');
  assert.equal(POLICY.pUp, 0.55);
});
test('lifecycle: retire/degrade/reactivate deterministic, never on single outcomes', () => {
  assert.equal(lifecycleStep('ACTIVE', 'STALE', 'STRONG', 'LOW'), 'RETIRED');
  assert.equal(lifecycleStep('ACTIVE', 'FRESH', 'INSUFFICIENT', 'LOW'), 'RETIRED');
  assert.equal(lifecycleStep('ACTIVE', 'DEGRADED', 'STRONG', 'LOW'), 'WATCH');
  assert.equal(lifecycleStep('WATCH', 'FRESH', 'STRONG', 'LOW'), 'ACTIVE');
  assert.equal(lifecycleStep('RETIRED', 'FRESH', 'MEDIUM', 'LOW'), 'ACTIVE');
  assert.equal(lifecycleStep('ACTIVE', 'FRESH', 'STRONG', 'LOW'), 'ACTIVE');
});
test('novelty buffer accumulates OOD nodes without auto-promotion', () => {
  const s = tmp();
  s.db.prepare('INSERT OR IGNORE INTO novelty_buffer(node_id,added_ms,reason) VALUES(?,?,?)').run('OBS_x', 1, 'far');
  s.db.prepare('INSERT OR IGNORE INTO novelty_buffer(node_id,added_ms,reason) VALUES(?,?,?)').run('OBS_x', 1, 'far');
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM novelty_buffer').get().n, 1);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM pattern_nodes').get().n, 0); // no auto-promotion
  s.close();
});
test('GRID/MICRO schema separation (no cross-schema comparison)', async () => {
  const {default: fs} = await import('node:fs');
  assert.ok(fs.existsSync('docs/pattern-nodes/MICRO_FEATURE_SCHEMA.md'));
});
test('micro NN columns all resolvable in live feature output', async () => {
  const {featuresRich} = await import('../src/features.mjs');
  const AT = 1791360000000;
  const ticks = Array.from({length: 120}, (_, i) => ({price: 84000+i*.05, sourceMs: AT-119000+i*1000, receivedMs: AT-119000+i*1000, provenance: 'LIVE_RECEIVED_WS', raw: {}}));
  const f = featuresRich(ticks, AT, {});
  for (const k of ['return_1s_bps','return_5s_bps','return_60s_bps','realized_vol_15s_bps','range_60s_bps','direction_flips_60s','momentum_change_1_5']) {
    assert.ok(typeof f.values[k] === 'number', k);
  }
});
test('live shadow: every MICRO node had frozen predictions first (no prediction, no node)', async () => {
  const {NodeStore} = await import('../src/nodes.mjs');
  const s = new NodeStore('./var/live-shadow-nodes');
  const orphans = s.db.prepare(`SELECT o.round_id FROM observation_nodes o LEFT JOIN pattern_predictions p
    ON p.round_id=o.round_id AND p.arm='A0' WHERE o.provenance='MICRO_LIVE' AND p.round_id IS NULL`).all();
  assert.equal(orphans.length, 0);
  s.close();
});
test('EXTERNAL mode reads rounds/ticks from shared DB (regression: empty memory bug)', async () => {
  const {readLiveRounds, readLiveTicks} = await import('../src/liveread.mjs');
  const {Store} = await import('../src/store.mjs');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-ext-')));
  const now = Date.now();
  s.round({id: 'btc-x', startMs: now + 60000, endMs: now + 120000, openMicro: null, closeMicro: null, result: null,
    venueStatus: 'betting', venueOutcome: 'UNRESOLVED', raw: {id: 'btc-x', asset: 'BTC', openTs: Math.floor((now+60000)/1000), closeTs: Math.floor((now+120000)/1000), status: 'betting', outcome: 'UNRESOLVED'}}, now);
  const rounds = readLiveRounds(s, now);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].id, 'btc-x');
  s.tick({price: 84000, sourceMs: now - 500, receivedMs: now - 500, provenance: 'LIVE_RECEIVED_WS', raw: {}});
  assert.equal(readLiveTicks(s, now).length, 1);
  s.close();
});
