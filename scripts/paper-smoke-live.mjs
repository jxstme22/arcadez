// LIVE prospective benchmark — OPERATOR-INITIATED ONLY (P11 20-round or P12 100-round).
// Requires APPROVE_LIVE_SPEND=1 in process env. Target via P12_ROUNDS (default 20).
// Caps: MAX_MODEL_CALLS_PER_SESSION / _PER_ARM (clamped; never raised here).
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {makeRunner, ARMS} from '../src/models.mjs';
import {makeCollector} from '../src/collector.mjs';
import {discover} from '../src/discovery.mjs';
import {makePaperEngine, venueLockMs} from '../src/paper.mjs';
import {nextRound} from '../src/market.mjs';
import {scoreBenchmark, toComparisonCsv, BASELINES, baselineFor} from '../src/bench.mjs';
import {classifyRegime} from '../src/patterns.mjs';
import fs from 'node:fs';
loadEnv();
if (process.env.APPROVE_LIVE_SPEND !== '1') {
  console.error('BLOCKED_NEEDS_EXPLICIT_SPEND_APPROVAL: set APPROVE_LIVE_SPEND=1 only after provider-side spend caps are configured. 0 provider calls made.');
  process.exit(2);
}
const TARGET = Math.min(200, Math.max(1, Number(process.env.P12_ROUNDS || 20)));
const REPORT = TARGET >= 100 ? 'p12-100-rounds' : 'p11-20-rounds';
const cfg = {...config(),
  maxCalls: Math.min(Number(process.env.MAX_MODEL_CALLS_PER_SESSION || 300), TARGET >= 100 ? 330 : 300),
  maxArmCalls: Math.min(Number(process.env.MAX_MODEL_CALLS_PER_ARM || 100), TARGET >= 100 ? 110 : 100),
  dataDir: TARGET >= 100 ? './var/p12-live' : './var/p11-live'};
console.log(`LIVE_P11 budget total=${cfg.maxCalls} perArm=${cfg.maxArmCalls} keys: OpenAI=${!!cfg.openaiKey} Jev=${!!cfg.typesafeKey} GLiDE=${!!cfg.fastinoKey}`);
const store = new Store(cfg.dataDir);
try {
  const audit = await discover(cfg, store);
  if (!audit.roundsInSchema) throw new Error('BLOCKED_UNVERIFIED_ROUNDS_ROUTE');
  const collector = makeCollector(cfg, store, console);
  const engine = makePaperEngine(cfg, store, makeRunner(cfg));
  collector.start();
  const valid = [];
  const t0 = Date.now();
  const shadow = []; // Pattern Lab shadow only: regime ids, never fed to providers.
  const spent = arm => { try { return store.db.prepare('SELECT COUNT(*) n FROM decisions WHERE arm=? AND sent_ms IS NOT NULL').get(arm).n; } catch { return 0; } };
  const totalSpent = () => { try { return store.db.prepare('SELECT COUNT(*) n FROM decisions WHERE sent_ms IS NOT NULL').get().n; } catch { return 0; } };
  const deadlineMin = TARGET >= 100 ? 400 : 150;
  while (valid.length < TARGET && Date.now() - t0 < deadlineMin*60000) {
    const now = Date.now();
    if (totalSpent() >= cfg.maxCalls || ARMS.some(a => spent(a) >= cfg.maxArmCalls)) {
      console.log('BUDGET_GUARD_STOP (persistent ledger): halting fanout, settling what exists.');
      break;
    }
    const round = nextRound(collector.getRounds(), now);
    if (round) {
      const res = await engine.consider(round, collector.getTicks(), now);
      if (res && res.snapshotHash) {
        try {
          const snap = store.db.prepare('SELECT snapshot FROM snapshots WHERE round_id=?').get(round.id);
          if (snap) shadow.push({roundId: round.id, regime: classifyRegime(JSON.parse(snap.snapshot)?.feature ?? null)});
        } catch {}
      }
    }
    // Settle anything whose end passed, via venue poll data.
    for (const r of collector.getRounds()) {
      if (r.endMs <= Date.now() && r.result && store.hasRoundDecision(r.id) && !valid.includes(r.id)) {
        try { store.settle(r.id, r.result); } catch {}
        if (r.result === 'UP' || r.result === 'DOWN') valid.push(r.id);
      }
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  collector.stop();
  const rounds = valid.slice(0,TARGET).map(id => ({id}));
  const perArm = scoreBenchmark(store, rounds);
  fs.mkdirSync('data/reports',{recursive:true});
  fs.writeFileSync(`data/reports/${REPORT}.json`, JSON.stringify({label: TARGET >= 100 ? 'P12_LIVE_100' : 'P11_LIVE_20', at:new Date().toISOString(), rounds:valid.slice(0,TARGET), perArm, shadow, pnlStatus:'NULL_UNVERIFIED_PAYOUT', caps:{maxCalls:cfg.maxCalls, maxArmCalls:cfg.maxArmCalls, target:TARGET}, spent:{total:totalSpent(), perArm:Object.fromEntries(ARMS.map(a=>[a,spent(a)]))}},null,2));
  const csvName = TARGET >= 100 ? 'p12-provider-comparison.csv' : 'p11-provider-comparison.csv';
  fs.writeFileSync(`data/reports/${csvName}`, toComparisonCsv(perArm));
  console.log('P11_LIVE_DONE valid=' + valid.length);
  console.log(toComparisonCsv(perArm));
} finally { store.close(); }
