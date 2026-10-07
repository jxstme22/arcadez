// Pattern Nodes live runtime — T-7 primary horizon, 11 paper arms, paper-only.
// Order per round: snapshot -> freeze -> predict -> persist -> settle -> score -> insert.
// Watermark: only nodes with open_ts < target open are usable. Crash-resumable.
// Frozen node features for insertion come from the T-7 snapshot persisted at predict
// time (never rebuilt at settlement — that would leak post-cutoff data).
import {loadEnv, config} from '../src/config.mjs';
import {Store} from '../src/store.mjs';
import {NodeStore} from '../src/nodes.mjs';
import {makeCollector} from '../src/collector.mjs';
import {makeTradesStream} from '../src/trades.mjs';
import {featuresRich} from '../src/features.mjs';
import {sha} from '../src/market.mjs';
import {freshnessClass, patternDecision, oodDecision, NODE_RUNTIME_VERSION} from '../src/nodepolicy.mjs';
import {readLiveRounds, readLiveTicks} from '../src/liveread.mjs';
loadEnv();
const cfg = {...config(), dataDir: process.env.LIVE_DIR || './var/live'};
const NODES_DIR = process.env.NODES_LIVE_DIR || (cfg.dataDir + '-nodes');
const HORIZON_MS = 7000; // T-7 primary (venue lock worst-case T-6)
const MICRO_MIN = 100; // micro support gate: below => INFRA_ONLY SKIP
const GRID_T = {mLo: 0, mHi: 0, vLo: 1.8792, vHi: 3.0841}; // frozen V1 tertiles (reconstructed, documented)
const OOD_R = 4.691; // frozen p95 radius (grid-kmeans; micro OOD uses own radius below)
const MICRO_OOD_R = 6.0; // predeclared micro OOD radius (standardized units; validates in shadow)
const MICRO_NN_COLS = ['return_1s_bps','return_3s_bps','return_5s_bps','return_10s_bps','return_15s_bps','return_30s_bps','return_60s_bps','realized_vol_15s_bps','realized_vol_60s_bps','range_15s_bps','range_60s_bps','direction_flips_60s','momentum_change_1_5','momentum_change_5_15','momentum_change_15_60'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = new Store(cfg.dataDir);
const nodes = new NodeStore(NODES_DIR);
const collector = makeCollector(cfg, store, console);
const trades = makeTradesStream(store, console);
const momOf = (F, s) => { const v = F[`return_${s}s_bps`]; return v == null ? 'SKIP' : v > 0 ? 'UP' : v < 0 ? 'DOWN' : 'SKIP'; };
function microVec(F) {
  const x = MICRO_NN_COLS.map(k => F[k]);
  return x.every(v => typeof v === 'number' && Number.isFinite(v)) ? x : null;
}
function microScaler() {
  const row = nodes.db.prepare("SELECT spec FROM library_versions WHERE version='MICRO-SCALER-V1'").get();
  return row ? JSON.parse(row.spec) : null;
}
function ensureMicroScaler(mem) {
  let sc = microScaler();
  if (sc) return sc;
  if (mem.length < MICRO_MIN) return null;
  const d = MICRO_NN_COLS.length;
  const mean = [], sd = [];
  for (let j = 0; j < d; j++) {
    const vs = mem.map(m => m.x[j]);
    const m = vs.reduce((a,b)=>a+b,0)/vs.length;
    mean.push(m); sd.push(Math.sqrt(vs.reduce((a,b)=>a+(b-m)**2,0)/vs.length) || 1);
  }
  sc = {mean, sd, fitN: mem.length, frozenAt: new Date().toISOString()};
  nodes.db.prepare('INSERT OR IGNORE INTO library_versions(version,created_ms,spec,sha) VALUES(?,?,?,?)')
    .run('MICRO-SCALER-V1', Date.now(), JSON.stringify(sc), sha(sc));
  return microScaler();
}
async function main() {
  const external = process.env.LIVE_EXTERNAL === '1';
  if (!external) { collector.start(); trades.start(); }
  else console.log('LIVE_EXTERNAL=1: using external collector DB (no local WS/REST pollers)');
  console.log(`PATTERN_LIVE start dir=${cfg.dataDir} nodes=${NODES_DIR} horizon=T-7 runtime=v${NODE_RUNTIME_VERSION}`);
  if (!nodes.db.prepare('SELECT ms FROM runtime_watermarks WHERE key=?').get('benchmark_start')) {
    nodes.setWatermark('benchmark_start', Date.now(), 'PATTERN_NODES_PAPER_V1');
    console.log('BENCHMARK_START recorded (prospective from here; prior rows are replay/history)');
  }
  const done = new Set();
  let stop = false;
  const halt = () => { stop = true; };
  process.once('SIGINT', halt); process.once('SIGTERM', halt);
  // In EXTERNAL mode our own collector never polls; read rounds/ticks from the
  // shared live DB instead (read-only; pattern process never writes collector tables).
  function dbRounds() { return readLiveRounds(store); }
  function dbTicks() { return readLiveTicks(store); }
  const liveRounds = () => external ? dbRounds() : collector.getRounds();
  const liveTicks = () => external ? dbTicks() : collector.getTicks();
  while (!stop) {
    const now = Date.now();
    try {
      // 1. T-7 predictions.
      for (const r of liveRounds()) {
        if (done.has(r.id)) continue;
        const cutoff = r.startMs - HORIZON_MS;
        if (now < cutoff || now > cutoff + 2000) continue;
        if (nodes.db.prepare('SELECT 1 FROM pattern_predictions WHERE round_id=? AND arm=?').get(r.id, 'A0')) { done.add(r.id); continue; }
        const ticks = liveTicks();
        const snap = featuresRich(ticks, cutoff, {prevLabels: [], maxAge: cfg.maxPriceAgeMs, lockMs: r.startMs - 6000});
        if (!snap) continue; // no fresh data -> INVALID_DATA round (absence documents it)
        const snapHash = sha({r: r.id, c: cutoff, f: snap});
        try { store.saveSnapshot(r.id + '@T-7', cutoff, {...snap, target: r.id, horizonS: 7}); } catch {}
        try { store.saveEvidence('microsnap.' + r.id, {cutoffMs: cutoff, hash: snapHash, values: snap.values, quality: snap.quality}); } catch {}
        const F = snap.values;
        const acts = {A0: 'UP', A1: 'DOWN', A2: momOf(F,5), A3: momOf(F,15), A4: momOf(F,60)};
        // GRID memory (watermarked).
        const gmem = nodes.db.prepare("SELECT features,outcome,open_ts FROM observation_nodes WHERE open_ts<? AND (provenance='VENUE_RECORDED' OR provenance LIKE 'GRID%')").all(r.startMs)
          .map(x => ({f: JSON.parse(x.features), y: x.outcome === 'UP' ? 1 : 0}));
        // A5 grid pattern (momentum class needs only ret_60 — always resolvable live).
        let pB = null;
        // A5 grid pattern (momentum class needs only return_60s — always resolvable live).
        const m60 = F.return_60s_bps;
        if (m60 != null) {
          const q = m60 < GRID_T.mLo ? 'down' : m60 > GRID_T.mHi ? 'up' : 'flat';
          const cls = gmem.filter(m => {
            const v = m.f.ret_60;
            if (typeof v !== 'number') return false;
            return (v < GRID_T.mLo ? 'down' : v > GRID_T.mHi ? 'up' : 'flat') === q;
          });
          const p = cls.length >= 10 ? cls.filter(m => m.y === 1).length / cls.length : null;
          const rec = cls.slice(-250);
          const fresh = cls.length >= 10 && rec.length >= 10
            ? freshnessClass(cls.filter(m => m.y === 1).length / cls.length,
                rec.filter(m => m.y === 1).length / rec.length, rec.length) : 'INSUFFICIENT';
          const dec = patternDecision({ood: false, fresh, supportN: cls.length, pUp: p});
          acts.A5 = dec.action;
          if (dec.action !== 'SKIP') pB = p;
        } else acts.A5 = 'SKIP';
        // A6 grid NN25: requires the frozen 19-col projection (mostly minute-grid fields
        // unavailable at 1s snapshots) -> SKIP documented until mapping validated.
        acts.A6 = 'SKIP';
        // A7 hybrid needs A5+A6 -> SKIP while A6 shadow.
        acts.A7 = 'SKIP';
        // MICRO memory (watermarked by query open_ts cutoff).
        const mmem = nodes.db.prepare("SELECT features,outcome FROM observation_nodes WHERE open_ts<? AND provenance LIKE 'MICRO%'").all(r.startMs)
          .map(x => { try { const f = JSON.parse(x.features); const flat = f.values ?? f; const v = microVec(flat); return v ? {x: v, y: x.outcome === 'UP' ? 1 : 0} : null; } catch { return null; } })
          .filter(Boolean);
        const scaler = ensureMicroScaler(mmem);
        let pMicro = null;
        if (scaler) {
          const mv = microVec(F);
          if (mv) {
            const z = mv.map((v, j) => (v - scaler.mean[j]) / scaler.sd[j]);
            const ds = mmem
              .map(m => ({m, d: Math.sqrt(m.x.map((v, j) => { const zj = (v - scaler.mean[j]) / scaler.sd[j]; return (zj - z[j])**2; }).reduce((a,b)=>a+b,0))}))
              .sort((x, y) => x.d - y.d).slice(0, 25);
            if (ds.length >= 10) pMicro = ds.filter(o => o.m.y === 1).length / ds.length;
          }
        }
        const microN = mmem.length;
        const mDec = microN < MICRO_MIN ? {action: 'SKIP'} : patternDecision({ood: pMicro == null, fresh: 'INSUFFICIENT', supportN: microN, pUp: pMicro});
        acts.A8 = microN < MICRO_MIN ? 'SKIP' : mDec.action;
        acts.A9 = 'SKIP'; // micro pattern family: SHADOW until support gate + family exists
        acts.A10 = 'SKIP'; // micro hybrid: SHADOW until A9 exists
        const frozen = Date.now();
        for (const [arm, act] of Object.entries(acts)) {
          nodes.db.prepare(`INSERT OR IGNORE INTO pattern_predictions(round_id,arm,snapshot_id,pattern_id,p_up,action,watermark_ms,frozen_ms,provenance)
            VALUES(?,?,?,?,?,?,?,?,?)`).run(r.id, arm, r.id + '@T-7', arm[1] <= '4' ? 'CTRL' : arm[1] === '5' ? 'GRID' : 'MICRO', null, act, r.startMs, frozen, 'LIVE');
        }
        nodes.setWatermark('latest_round_predicted', r.startMs, r.id);
        done.add(r.id);
        console.log(`PREDICT ${r.id} ` + Object.entries(acts).map(([a, v]) => `${a}:${v}`).join(' '));
      }
      // 2. Settlement sweep: score frozen arms, then insert node (exactly once).
      for (const r of liveRounds()) {
        if (r.endMs > now || !r.result || !['UP','DOWN','VOID'].includes(r.result)) continue;
        const scored = nodes.db.prepare('SELECT 1 FROM prediction_results WHERE round_id=? AND arm=?').get(r.id, 'A0');
        if (!scored) {
          const preds = nodes.db.prepare('SELECT arm,action FROM pattern_predictions WHERE round_id=?').all(r.id);
          for (const p of preds) {
            const correct = p.action === 'SKIP' ? null : (p.action === r.result ? 1 : 0);
            nodes.db.prepare('INSERT OR IGNORE INTO prediction_results(round_id,arm,correct,venue_result,scored_ms) VALUES(?,?,?,?,?)')
              .run(r.id, p.arm, correct, r.result, Date.now());
          }
          if (preds.length) nodes.setWatermark('latest_round_scored', r.endMs, r.id);
        }
        const hasScore = nodes.db.prepare('SELECT 1 FROM prediction_results WHERE round_id=? LIMIT 1').get(r.id);
        if (hasScore && r.result !== 'VOID') {
          const ev = store.evidence('microsnap.' + r.id); // FROZEN T-7 features only
          if (ev && ev.cutoffMs === r.startMs - HORIZON_MS) {
            nodes.insertObservation({nodeId: `OBS_LIVE_${r.id}`, roundId: r.id, openTs: r.startMs, closeTs: r.endMs,
              features: ev.values, outcome: r.result, moveBps: null, quality: ev.quality, provenance: 'MICRO_LIVE', schemaVersion: 'micro-v1'});
          }
          nodes.setWatermark('latest_round_node_created', r.endMs, r.id);
        }
      }
    } catch (e) { console.log('RUNTIME_ERR', String(e?.message || e).slice(0, 200)); }
    await sleep(700);
  }
  try { collector.stop(); trades.stop(); } catch {}
  store.close(); nodes.close();
  console.log('PATTERN_LIVE_STOPPED');
}
await main();
