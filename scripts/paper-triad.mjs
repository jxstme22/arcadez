// TRIAD paper loop — pure price-action arms, $0 inference, no approval needed.
// Arms: TD (router), HR (high-risk), KF (kalman), STORM, SKY (solo detectors).
// T-6s decisions (D=startMs-6000); never backfilled; VOID excluded; PnL NULL.
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {makeCollector} from '../src/collector.mjs';
import {discover} from '../src/discovery.mjs';
import {nextRound} from '../src/market.mjs';
import {triadDecide, triadHRDecide, kalmanDecide, triadSignals, microVol} from '../strategies/triad/triad.mjs';
loadEnv();
const TARGET = Math.min(100000, Math.max(1, Number(process.env.TRIAD_ROUNDS || 100000)));
const CONTINUOUS = process.env.TRIAD_CONTINUOUS === '1';
const cfg = {...config(), dataDir: process.env.TRIAD_DIR || './var/triad-paper'};
const ARMS = ['TD','HR','KF','STORM','SKY'];
const store = new Store(cfg.dataDir);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const audit = await discover(cfg, store);
if (!audit.roundsInSchema) throw new Error('BLOCKED_UNVERIFIED_ROUNDS_ROUTE');
const collector = makeCollector(cfg, store, console);
collector.start();
const toFeed = ticks => ticks.map(t => ({source_ms: t.sourceMs, price: t.price})).sort((a,b) => a.source_ms - b.source_ms);
const volHist = [];
const valid = [];
const attempted = new Set();
const t0 = Date.now();
console.log(`TRIAD_PAPER target=${CONTINUOUS ? 'continuous' : TARGET} arms=${ARMS.join(',')}`);
while (CONTINUOUS || (valid.length < TARGET && Date.now() - t0 < 400*60000)) {
  const now = Date.now();
  const round = nextRound(collector.getRounds(), now);
  if (round && !attempted.has(round.id)) {
    const D = round.startMs - 6000;
    if (now >= D && now <= D + 2000) {
      attempted.add(round.id);
      const feed = toFeed(collector.getTicks());
      // Maintain trailing per-minute microVol history (causal: windows fully before D).
      const v = microVol(D - 60000, feed);
      if (v != null) { volHist.push(v); if (volHist.length > 120) volHist.shift(); }
      const out = {
        TD: triadDecide(round.startMs, feed, volHist),
        HR: triadHRDecide(round.startMs, feed, volHist),
        KF: kalmanDecide(round.startMs, feed, volHist),
      };
      const s = triadSignals(round.startMs, feed, volHist);
      out.STORM = {action: s.storm && !s.sky && !s.calm ? 'DOWN' : 'SKIP', p_up: s.storm ? 0.35 : null, note: 'solo-storm'};
      out.SKY = {action: s.sky && !s.storm && !s.calm ? 'UP' : 'SKIP', p_up: s.sky ? 0.65 : null, note: 'solo-sky'};
      for (const a of ARMS) {
        store.saveDecision({roundId: round.id, arm: 'triad-' + a, status: 'OK', pUp: out[a].p_up,
          action: out[a].action, sentMs: now, receivedMs: Date.now(), model: 'triad-' + a.toLowerCase(),
          errorCode: null, snapshotHash: null}, cfg.stake);
      }
    }
  }
  for (const r of collector.getRounds()) {
    if (r.endMs <= Date.now() && (r.result === 'UP' || r.result === 'DOWN') && store.hasRoundDecision(r.id) && !valid.includes(r.id)) {
      try { store.settle(r.id, r.result); } catch {}
      valid.push(r.id);
    }
  }
  await sleep(1500);
}
collector.stop();
const n = store.db.prepare('SELECT COUNT(DISTINCT round_id) n FROM decisions').get().n;
console.log(`TRIAD_DONE valid=${valid.length} decided=${n}`);
store.close();
