// 9-arm prospective A/B: {openai,jev,glide} x {A control, B +pattern, C +pattern+scenarios}.
// Same frozen market snapshot for all 9; modes differ ONLY by added pattern context.
// Gated: APPROVE_LIVE_SPEND=1 (mock: PAPER_AB_MOCK=1, $0). Caps + persistent DB guard.
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {makeRunner, ARMS, actionFor} from '../src/models.mjs';
import {makeCollector} from '../src/collector.mjs';
import {discover} from '../src/discovery.mjs';
import {buildSnapshot, venueLockMs} from '../src/paper.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
loadEnv();
const MOCK = process.env.PAPER_AB_MOCK === '1';
if (!MOCK && process.env.APPROVE_LIVE_SPEND !== '1') {
  console.error('BLOCKED_NEEDS_EXPLICIT_SPEND_APPROVAL: 0 provider calls made.');
  process.exit(2);
}
const TARGET = Math.min(100000, Math.max(1, Number(process.env.P12_ROUNDS || 20)));
const CONTINUOUS = process.env.PAPER_CONTINUOUS === '1'; // 24/7: ignore TARGET, run until stopped
const MODES = ['A','B','C'];
const ARMS9 = ARMS.flatMap(a => MODES.map(m => `${a}-${m}`));
const cfg = {...config(),
  maxCalls: Math.min(Number(process.env.MAX_MODEL_CALLS_PER_SESSION || 300), 330),
  maxArmCalls: Math.min(Number(process.env.MAX_MODEL_CALLS_PER_ARM || 100), 110),
  dataDir: './var/p12ab-live'};
import {liveGridVector, fillSeq, patternEvidence, bodyFor, INDEX_SHA, INDEX_KEPT} from '../src/ab.mjs';
// ---------- live loop ----------
import {nextRound} from '../src/market.mjs';
import {postJson, TRUSTED} from '../src/http.mjs';
import {parseAnswer} from '../src/models.mjs';
const store = new Store(cfg.dataDir);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const mockCall = async (url, key, body, ms) => {
  const h = Number('0x' + createHash('sha256').update(JSON.stringify(body).slice(0, 200)).digest('hex').slice(0, 8)) / 2**32;
  const p = +(0.35 + h * 0.3).toFixed(3);
  if (url === TRUSTED.openai) return {answers: [{name: 'next_btc_arcade_up', type: 'predicate', probability: p}], model: 'mock', usage: {input_tokens: 10}};
  return {answers: {next_btc_arcade_up: {type: 'noul', noul: p}}, model: 'mock', usage: {input_tokens: 10}};
};
const call = MOCK ? mockCall : postJson;
const counts = new Map(ARMS9.map(a => [a, 0]));
let total = 0;
async function runOne(arm9, roundId, snapshot, snapshotHash, deadlineMs) {
  const [arm, mode] = [arm9.slice(0, arm9.length - 2), arm9.slice(-1)];
  const common = {roundId, arm: arm9, snapshotHash, pUp: null, action: 'SKIP', status: 'SKIP', model: null};
  const r = bodyFor(arm, mode, snapshot, runOne._ev, cfg);
  if (!r.key) return {...common, status: 'DISABLED_MISSING_KEY', errorCode: 'MISSING_KEY'};
  if (total >= cfg.maxCalls || counts.get(arm9) >= cfg.maxArmCalls) return {...common, status: 'DISABLED_BUDGET', errorCode: 'BUDGET_CAP'};
  const sentMs = Date.now();
  if (sentMs >= deadlineMs) return {...common, status: 'MISSED_LOCK', sentMs, errorCode: 'REQUEST_START_LATE'};
  total++; counts.set(arm9, counts.get(arm9) + 1);
  try {
    const reply = await call(r.url, r.key, r.body, Math.min(cfg.requestTimeoutMs, Math.max(100, deadlineMs - sentMs)));
    const receivedMs = Date.now();
    const parsed = parseAnswer(arm, reply);
    const late = receivedMs >= deadlineMs;
    return {...common, status: late ? 'LATE' : 'OK', pUp: parsed.pUp, action: late ? 'SKIP' : actionFor(parsed.pUp, cfg),
      model: parsed.model || r.model, usage: parsed.usage, answer: reply, receivedMs, sentMs, errorCode: late ? 'RESPONSE_AFTER_LOCK' : null};
  } catch (e) {
    return {...common, status: 'ERROR', sentMs, receivedMs: Date.now(), model: r.model, errorCode: String(e?.message || 'E').slice(0, 96)};
  }
}
const audit = await discover(cfg, store);
if (!audit.roundsInSchema) throw new Error('BLOCKED_UNVERIFIED_ROUNDS_ROUTE');
const collector = makeCollector(cfg, store, console);
collector.start();
const valid = [];
const attempted = new Set();
const t0 = Date.now();
while (CONTINUOUS || (valid.length < TARGET && Date.now() - t0 < (TARGET >= 100 ? 400 : 150)*60000)) {
  const now = Date.now();
  if (store.db.prepare('SELECT COUNT(*) n FROM decisions WHERE sent_ms IS NOT NULL').get().n >= cfg.maxCalls) { console.log('BUDGET_GUARD_STOP'); break; }
  const round = nextRound(collector.getRounds(), now);
  if (round && !attempted.has(round.id) && !store.hasRoundDecision(round.id)) {
    const delta = round.startMs - now;
    if (delta <= cfg.beforeMs + 2000 && delta >= cfg.beforeMs - 2000) {
      attempted.add(round.id);
      const snapshot = buildSnapshot(round, collector.getTicks(), now, cfg);
      const deadline = venueLockMs(round, cfg);
      if (!snapshot) {
        for (const a9 of ARMS9) store.saveDecision({roundId: round.id, arm: a9, status: 'SKIP_NO_LIVE_DATA', action: 'SKIP', errorCode: 'FRESHNESS_OR_COVERAGE'}, cfg.stake);
      } else {
        const hash = store.saveSnapshot(round.id, now, snapshot);
        // prev settled labels for sequence features (causal: endMs < now).
        const prevLabels = store.db.prepare('SELECT result FROM rounds WHERE end_ms < ? AND result IN (?,?) ORDER BY end_ms').all(now, 'UP', 'DOWN').map(r => r.result).slice(-10);
        const grid = fillSeq(liveGridVector(collector.getTicks(), now) || Object.fromEntries(INDEX_KEPT.map(k => [k, null])), prevLabels);
        const ev = grid && INDEX_KEPT.every(k => typeof grid[k] === 'number' && Number.isFinite(grid[k]))
          ? patternEvidence(Object.fromEntries(INDEX_KEPT.map(k => [k, grid[k]])), round.id, now) : null;
        runOne._ev = ev || {regime: null, pRegime: null, nn: null, scen: null, reason: 'NO_GRID'};
        const results = await Promise.all(ARMS9.map(a9 => runOne(a9, round.id, snapshot, hash, deadline)));
        for (const d of results) store.saveDecision({...d, roundId: round.id}, cfg.stake);
        // NOTE: decisions stored under venue round id; snapshot hash shared across all 9.
      }
    }
  }
  for (const r of collector.getRounds()) {
    if (r.endMs <= Date.now() && r.result && (r.result === 'UP' || r.result === 'DOWN') && store.hasRoundDecision(r.id) && !valid.includes(r.id)) {
      try { store.settle(r.id, r.result); } catch {}
      valid.push(r.id);
    }
  }
  await sleep(2000);
}
collector.stop();
console.log(`AB_DONE valid=${valid.length} spent=${store.db.prepare('SELECT COUNT(*) n FROM decisions WHERE sent_ms IS NOT NULL').get().n}`);
store.close();
