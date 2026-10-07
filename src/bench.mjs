// Frozen prospective benchmark harness — P11 (20) / P12 (100).
// Uses the live paper engine (same snapshot hash, deadline gate, settlement truth).
// Provider calls go through makeRunner (budget enforced). Baselines deterministic.
import {makePaperEngine} from './paper.mjs';
import {ARMS} from './models.mjs';
function pct(xs, p) { if (!xs.length) return null; const s=[...xs].sort((a,b)=>a-b); return s[Math.min(s.length-1, Math.floor(p*s.length))]; }
export function baselineFor(name, round, prevResult, idx) {
  if (name === 'alwaysUP') return 'UP';
  if (name === 'alwaysDOWN') return 'DOWN';
  if (name === 'prevCont') return prevResult === 'UP' || prevResult === 'DOWN' ? prevResult : 'SKIP';
  if (name === 'prevRev') return prevResult === 'UP' ? 'DOWN' : prevResult === 'DOWN' ? 'UP' : 'SKIP';
  if (name === 'fifty') return 'SKIP'; // p=0.5 abstains under .57/.43 thresholds
  if (name === 'momentum') return idx % 2 === 0 ? 'UP' : 'DOWN'; // deterministic placeholder, not fitted
  return 'SKIP';
}
export const BASELINES = ['alwaysUP','alwaysDOWN','prevCont','prevRev','fifty','momentum'];
export async function runBenchmark({cfg, store, rounds, ticksByRound, runner, settleByRound, label='BENCH', log}) {
  const engine = makePaperEngine(cfg, store, runner);
  const records = [];
  let prevResult = null;
  for (const round of rounds) {
    const now = round.startMs - cfg.beforeMs;
    const ticks = ticksByRound(round);
    const res = await engine.consider(round, ticks, now);
    const settle = settleByRound(round);
    if (settle && ['UP','DOWN','VOID'].includes(settle)) { try { store.settle(round.id, settle); } catch {} }
    const base = {};
    for (const b of BASELINES) base[b] = baselineFor(b, round, prevResult, records.length);
    records.push({roundId: round.id, startMs: round.startMs, result: res, settle, baselines: base});
    if (settle === 'UP' || settle === 'DOWN') prevResult = settle;
    log?.(`BENCH_ROUND ${round.id} ${JSON.stringify(res?.status || res)}`);
  }
  return {label, records};
}
export function scoreBenchmark(store, rounds) {
  const ids = rounds.map(r => r.id);
  const perArm = {};
  for (const arm of ARMS) {
    const rows = store.db.prepare(`SELECT d.status,d.p_up AS pUp,d.action,d.sent_ms AS sentMs,d.received_ms AS recMs,p.correct,p.result AS paperResult,r.result AS venueResult
      FROM decisions d LEFT JOIN paper p ON p.round_id=d.round_id AND p.arm=d.arm LEFT JOIN rounds r ON r.id=d.round_id
      WHERE d.round_id IN (${ids.map(()=>'?').join(',')}) AND d.arm=?`).all(...ids, arm);
    const ok = rows.filter(r => r.status === 'OK' && r.pUp != null);
    const acted = rows.filter(r => r.action === 'UP' || r.action === 'DOWN');
    const settled = acted.filter(r => r.venueResult === 'UP' || r.venueResult === 'DOWN');
    const wins = settled.filter(r => (r.action === r.venueResult)).length;
    const brier = ok.filter(r => r.venueResult === 'UP' || r.venueResult === 'DOWN')
      .map(r => (r.pUp - (r.venueResult === 'UP' ? 1 : 0)) ** 2);
    const lat = rows.filter(r => r.sentMs != null && r.recMs != null).map(r => r.recMs - r.sentMs);
    const mean = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
    perArm[arm] = {
      eligible: rows.length, acted: acted.length, skipRate: rows.length ? 1 - acted.length/rows.length : null,
      up: rows.filter(r=>r.action==='UP').length, down: rows.filter(r=>r.action==='DOWN').length,
      wins, losses: settled.length - wins,
      accuracy: settled.length ? wins/settled.length : null,
      brier: mean(brier), logloss: null,
      latP50: pct(lat, .5), latP90: pct(lat, .9), latP99: pct(lat, .99),
      late: rows.filter(r=>r.status==='LATE').length, errors: rows.filter(r=>r.status==='ERROR').length,
      spendEstimateUsd: null, // usage-based pricing varies; reconcile via usage column
    };
  }
  return perArm;
}
export function toComparisonCsv(perArm) {
  const head = 'arm,eligible,acted,skipRate,up,down,wins,losses,accuracy,brier,latP50,latP90,latP99,late,errors';
  const lines = Object.entries(perArm).map(([a,m]) => [a,m.eligible,m.acted,m.skipRate?.toFixed?.(3) ?? '',m.up,m.down,m.wins,m.losses,m.accuracy?.toFixed?.(4) ?? '',m.brier?.toFixed?.(4) ?? '',m.latP50 ?? '',m.latP90 ?? '',m.latP99 ?? '',m.late,m.errors].join(','));
  return [head, ...lines].join('\n');
}
