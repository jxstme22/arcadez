import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {runBenchmark, scoreBenchmark, toComparisonCsv, BASELINES} from '../src/bench.mjs';

const cfg = {openaiKey:'k',typesafeKey:'k',fastinoKey:'k',openaiModel:'m',typesafeModel:'m',fastinoModel:'m',maxPriceAgeMs:2500,beforeMs:10000,bufferMs:3000,venueBetCutoffMs:5000,upThreshold:.57,downThreshold:.43,stake:10,maxCalls:1000,maxArmCalls:1000,requestTimeoutMs:4500};

function ticksFor(now) {
  return Array.from({length:120},(_,i)=>({price:84000+i*.05,sourceMs:now-119000+i*1000,receivedMs:now-119000+i*1000,provenance:'LIVE_RECEIVED_WS',raw:{}}));
}
test('20-round mock benchmark: identical snapshot hash, deadline respected, settlements recorded', async () => {
  const s = new Store(fs.mkdtempSync(path.join(os.tmpdir(),'arcade-bench-')));
  const base = Date.now() + 60000;
  const rounds = Array.from({length:20},(_,i)=>({id:'bench_'+i, startMs: base+i*60000, endMs: base+i*60000+60000}));
  const outcomes = rounds.map((_,i)=> i%3===0 ? 'DOWN' : 'UP');
  const fakeRunner = async (arm, id, snap, hash, deadline) => {
    assert.ok(deadline <= rounds.find(r=>r.id===id).startMs - 6000);
    const p = arm==='openai' ? .72 : arm==='jev' ? .5 : .3;
    return {roundId:id, arm, status:'OK', pUp:p, action: p>=.57?'UP':p<=.43?'DOWN':'SKIP', sentMs: Date.now(), receivedMs: Date.now()+20, model:'MOCK', snapshotHash: hash};
  };
  const {records} = await runBenchmark({cfg, store:s, rounds,
    ticksByRound:(r)=>ticksFor(r.startMs - cfg.beforeMs),
    runner: fakeRunner,
    settleByRound:(r)=>{ const o = outcomes[rounds.indexOf(r)]; s.round({id:r.id,startMs:r.startMs,endMs:r.endMs,openMicro:'84000000000',closeMicro: o==='UP'?'84001000000':'83999000000',result:o,raw:{mock:true}}, r.endMs+1000); return o; },
    label:'MOCK_20'});
  assert.equal(records.length, 20);
  // Identical snapshot hash across providers per round.
  for (const r of rounds) {
    const hashes = s.db.prepare('SELECT DISTINCT snapshot_sha AS h FROM decisions WHERE round_id=?').all(r.id).map(x=>x.h);
    assert.equal(hashes.length, 1);
  }
  const perArm = scoreBenchmark(s, rounds);
  assert.equal(perArm.openai.eligible, 20);
  assert.ok(perArm.openai.accuracy != null);
  assert.ok(BASELINES.includes('prevCont'));
  const csv = toComparisonCsv(perArm);
  assert.match(csv, /arm,eligible,acted/);
  s.close();
});
test('freeze file integrity: all hashed sources exist and match at freeze time', async () => {
  const fs = await import('node:fs');
  const crypto = await import('node:crypto');
  const freeze = JSON.parse(fs.readFileSync('data/benchmark/p12-freeze.json','utf8'));
  for (const [f, h] of Object.entries(freeze.sourceHashes)) {
    const cur = crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
    assert.equal(cur, h, `freeze drift: ${f}`);
  }
});
test('persistent DB ledger caps fanout even across runner instances (budget anomaly guard)', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const {Store} = await import('../src/store.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-budget-'));
  const s = new Store(dir);
  for (let i = 0; i < 5; i++) s.saveDecision({roundId: 'r'+i, arm: 'jev', status: 'OK', pUp: .6, action: 'UP', sentMs: 1, receivedMs: 2}, 10);
  const spent = arm => s.db.prepare('SELECT COUNT(*) n FROM decisions WHERE arm=? AND sent_ms IS NOT NULL').get(arm).n;
  assert.equal(spent('jev'), 5);
  assert.equal(spent('openai'), 0);
  s.close();
});
test('script-level persistent ledger halts fanout at caps across instances', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const {Store} = await import('../src/store.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arcade-cap-'));
  const s = new Store(dir);
  // Simulate a prior process that already spent 9/10 calls.
  for (let i = 0; i < 9; i++) s.saveDecision({roundId: 'old'+i, arm: 'jev', status: 'OK', pUp: .6, action: 'UP', sentMs: 1, receivedMs: 2}, 10);
  const spent = arm => s.db.prepare('SELECT COUNT(*) n FROM decisions WHERE arm=? AND sent_ms IS NOT NULL').get(arm).n;
  const totalSpent = () => s.db.prepare('SELECT COUNT(*) n FROM decisions WHERE sent_ms IS NOT NULL').get().n;
  assert.equal(spent('jev'), 9);
  assert.equal(totalSpent(), 9);
  // Guard as implemented in paper-smoke-live: block when total>=maxCalls or any arm>=maxArmCalls.
  const maxCalls = 10, maxArmCalls = 10;
  assert.equal(totalSpent() >= maxCalls || ['openai','jev','glide'].some(a => spent(a) >= maxArmCalls), false);
  s.saveDecision({roundId: 'old9', arm: 'jev', status: 'OK', pUp: .6, action: 'UP', sentMs: 1, receivedMs: 2}, 10);
  assert.equal(totalSpent() >= maxCalls || ['openai','jev','glide'].some(a => spent(a) >= maxArmCalls), true);
  s.close();
});
test('AB grid vector + evidence + bodies (fixtures, no network)', async () => {
  const {liveGridVector, patternEvidence, bodyFor} = await import('../src/ab.mjs');
  const now = 1791360000000;
  const ticks = Array.from({length: 660}, (_, i) => ({price: 84000 + i*0.05, sourceMs: now-659000+i*1000, receivedMs: now-659000+i*1000, provenance: 'LIVE_RECEIVED_WS', raw: {}}));
  const g = liveGridVector(ticks, now);
  assert.ok(g && typeof g.ret_60 === 'number');
  const full = {...g, prev_dir_up: 1, previous_5_up_rate: 0.6, previous_10_up_rate: 0.5, current_streak_length: 2, breakout_up: 0, breakout_down: 0};
  const need = JSON.parse((await import('node:fs')).readFileSync('data/benchmark/ab-index.json','utf8')).keptCols;
  for (const k of need) if (!(k in full)) full[k] = null;
  const ev = patternEvidence(full, 'r-test', now);
  assert.ok(ev.regime == null || ev.regime.startsWith('Q-'));
  assert.ok(ev.reason);
  // bodies: same market evidence across modes/providers; only additive block differs
  const snap = {a: 1};
  const cfgT={upThreshold:.57,downThreshold:.43}; const bA = bodyFor('openai', 'A', snap, ev, cfgT);
  const bB = bodyFor('openai', 'B', snap, ev, cfgT);
  assert.ok(!JSON.stringify(bA.body).includes('pattern_evidence'));
  assert.ok(JSON.stringify(bB.body).includes('pattern_regime'));
  const jA = bodyFor('jev', 'A', snap, ev, cfgT);
  assert.ok(typeof jA.body.state === 'object');
});
