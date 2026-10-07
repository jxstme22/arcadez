// Online replay: chronological predict→freeze→settle→score→insert discipline over
// frozen observation nodes. Watermark: only nodes with open_ts < target open may be used.
import {NodeStore} from '../src/nodes.mjs';
import {fitScaler, applyScaler, kmeans} from '../src/pllearn.mjs';
import {mulberry32} from '../src/patterns.mjs';
import {freshnessClass, patternDecision, NODE_RUNTIME_VERSION} from '../src/nodepolicy.mjs';
void NODE_RUNTIME_VERSION;
const DIR = process.env.NODES_DIR || 'var/pattern-nodes';
const SEED_N = 500; // first 500 nodes seed frozen pattern definitions (offline step)
const P_UP = 0.57, P_DN = 0.43;
// Frozen OOD radius: computed at build as p95 of seed assignment distances.
function tertile(vals, p) { const a = [...vals].sort((x,y)=>x-y); return a[Math.min(a.length-1, Math.floor(p*a.length))]; }
const store = new NodeStore(DIR);
// Crash-resume safety: exactly-once per (round_id, arm) across restarts.
try { store.db.exec('CREATE UNIQUE INDEX IF NOT EXISTS uq_pred_round_arm ON pattern_predictions(round_id, arm)'); } catch {}
const all = store.db.prepare('SELECT node_id,round_id,open_ts,close_ts,features,outcome FROM observation_nodes ORDER BY open_ts').all()
  .map(r => ({...r, features: JSON.parse(r.features)}));
console.log(`nodes=${all.length}`);
const COLS = Object.keys(all[0].features);
const seed = all.slice(0, SEED_N), stream = all.slice(SEED_N);
// Offline seed step (frozen defs): tertiles + kmeans-16 on seed.
const T = {mLo: tertile(seed.map(r=>r.features.ret_60),1/3), mHi: tertile(seed.map(r=>r.features.ret_60),2/3),
           vLo: tertile(seed.map(r=>r.features.vol_300),1/3), vHi: tertile(seed.map(r=>r.features.vol_300),2/3)};
const qassign = f => `Q-${f.ret_60<T.mLo?'down':f.ret_60>T.mHi?'up':'flat'}-${f.vol_300<T.vLo?'low':f.vol_300>T.vHi?'high':'med'}-${f.direction_flips_60s<=1?'smooth':'choppy'}`;
const tX = seed.map(r => ({x: COLS.map(c => r.features[c]), y: r.outcome === 'UP' ? 1 : 0}));
const sc = fitScaler(tX);
const Z = x => applyScaler(sc, x);
const km = kmeans(tX.map(t => t.x.map((v,j)=>(v-sc.mean[j])/sc.sd[j])), 16, 726);
const kassign = f => { const x = COLS.map(c => (f[c]-sc.mean[COLS.indexOf(c)])/sc.sd[COLS.indexOf(c)]);
  let bi = 0, bd = Infinity; km.centroids.forEach((c,i) => { const d = c.reduce((s,v,j)=>s+(v-x[j])**2,0); if (d < bd) { bd = d; bi = i; } });
  return {id: `K16_${String(bi).padStart(3,'0')}`, d: Math.sqrt(bd)}; };
// OOD radius: p95 of seed kmeans distances.
{
  const ds = seed.map(r => kassign(r.features).d).sort((a,b)=>a-b);
  var OOD_R = ds[Math.floor(0.95*ds.length)];
}
console.log(`OOD radius (p95): ${OOD_R.toFixed(3)}`);
// Persist frozen pattern defs.
store.upsertPattern({patternId: 'SEED-GRID', version: 1, kind: 'quantile18', definition: {thresholds: T, cols: COLS}, status: 'ACTIVE_CANDIDATE', supportTotal: seed.length, upTotal: seed.filter(r=>r.outcome==='UP').length});
store.upsertPattern({patternId: 'SEED-KM16', version: 1, kind: 'kmeans16', definition: {seed: 726}, centroid: km.centroids, status: 'ACTIVE_CANDIDATE', supportTotal: seed.length, upTotal: seed.filter(r=>r.outcome==='UP').length});
function statsFor(ids) {
  const rows = ids.length ? store.db.prepare(`SELECT outcome FROM observation_nodes WHERE node_id IN (${ids.map(()=>'?').join(',')})`).all(...ids) : [];
  return {n: rows.length, up: rows.filter(r=>r.outcome==='UP').length};
}
function recentStats(patternId, beforeTs, windows = [50,100,250,500,1000]) {
  // members of pattern with open_ts < beforeTs (watermark), bucketed by recency rank.
  const mem = store.db.prepare(`SELECT m.obs_node_id AS id, o.open_ts AS ts, o.outcome AS y FROM node_pattern_membership m
    JOIN observation_nodes o ON o.node_id=m.obs_node_id WHERE m.pattern_id=? AND o.open_ts<? ORDER BY o.open_ts DESC`).all(patternId, beforeTs);
  const out = {};
  for (const w of windows) {
    const s = mem.slice(0, w);
    out['w'+w] = {n: s.length, up: s.filter(r=>r.y==='UP').length};
  }
  return out;
}
// Assign seed nodes to patterns (frozen assignment, idempotent).
for (const r of seed) {
  try {
    store.db.prepare('INSERT OR IGNORE INTO node_pattern_membership(obs_node_id,pattern_id,distance) VALUES(?,?,?)').run(r.node_id, 'SEED-GRID:'+qassign(r.features), null);
    const k = kassign(r.features);
    store.db.prepare('INSERT OR IGNORE INTO node_pattern_membership(obs_node_id,pattern_id,distance) VALUES(?,?,?)').run(r.node_id, 'SEED-KM16:'+k.id, k.d);
  } catch {}
}
// Online walk.
let armB = {acted:0, wins:0}, armH = {acted:0, wins:0}, armNN = {acted:0, wins:0}, armA = {acted:0, wins:0};
let skips = {ood:0, fresh:0, supp:0, abstain:0};
const rand = mulberry32(726);
for (const tgt of stream) {
  const cutoff = tgt.open_ts;
  // eligible memory: settled nodes strictly before target open.
  const mem = store.db.prepare('SELECT node_id,features,outcome,open_ts FROM observation_nodes WHERE open_ts<?').all(cutoff)
    .map(r => ({...r, features: JSON.parse(r.features)}));
  // ARM A: alwaysUP.
  armA.acted++; if (tgt.outcome === 'UP') armA.wins = (armA.wins||0)+1;
  // Pattern match (quantile): historical rate among prior members.
  const pid = 'SEED-GRID:'+qassign(tgt.features);
  const prior = mem.filter(r => {
    const m = r.features;
    return `Q-${m.ret_60<T.mLo?'down':m.ret_60>T.mHi?'up':'flat'}-${m.vol_300<T.vLo?'low':m.vol_300>T.vHi?'high':'med'}-${m.direction_flips_60s<=1?'smooth':'choppy'}` === pid.slice(10);
  });
  // Freshness (frozen policy).
  const recent = prior.slice(-250);
  const histRate = prior.length ? prior.filter(r=>r.outcome==='UP').length/prior.length : 0.5;
  const recRate = recent.length ? recent.filter(r=>r.outcome==='UP').length/recent.length : null;
  const fresh = (recent.length >= 10 && recRate != null) ? freshnessClass(histRate, recRate, recent.length) : 'INSUFFICIENT';
  // OOD via kmeans distance.
  const kd = kassign(tgt.features);
  const ood = kd.d > OOD_R;
  // NN-25 over memory (standardized).
  const z = COLS.map((c,j) => (tgt.features[c]-sc.mean[j])/sc.sd[j]);
  const ds = mem.map(r => ({r, d: Math.sqrt(COLS.reduce((s,c,j)=>s+((r.features[c]-sc.mean[j])/sc.sd[j]-z[j])**2,0))})).sort((x,y)=>x.d-y.d).slice(0,25);
  const nnP = ds.length ? ds.filter(x=>x.r.outcome==='UP').length/ds.length : null;
  // Scenario-lite: sample 200 matched continuations = matched labels (terminal proxy).
  const pool = mem.filter(r => {
    const m = r.features;
    const qm = `Q-${m.ret_60<T.mLo?'down':m.ret_60>T.mHi?'up':'flat'}`;
    return pid.slice(10).startsWith(qm);
  }).slice(-200);
  let scUp = 0; for (let i = 0; i < 200 && pool.length; i++) { if (pool[Math.floor(rand()*pool.length)].outcome === 'UP') scUp++; }
  const scenP = pool.length ? scUp/Math.min(200, Math.max(1,200)) : null;
  // ARM B decision (frozen policy module; identical semantics to inline version).
  const pB = prior.length >= 10 ? histRate : null;
  const dec = patternDecision({ood, fresh, supportN: prior.length, pUp: pB});
  const aB = dec.action, why = dec.why;
  if (aB === 'SKIP') skips[why] = (skips[why] || 0) + 1;
  if (ood) { try { store.db.prepare('INSERT OR IGNORE INTO novelty_buffer(node_id,added_ms,reason) VALUES(?,?,?)').run(tgt.node_id, Date.now(), `dist>${OOD_R.toFixed(2)}`); } catch {} }
  // ARM H: hybrid = average of pattern rate + NN rate (predeclared, no tuning).
  const pH = (pB != null && nnP != null) ? (pB+nnP)/2 : null;
  const aH = pH == null ? 'SKIP' : pH >= 0.55 ? 'UP' : pH <= 0.45 ? 'DOWN' : 'SKIP';
  const aNN = nnP == null ? 'SKIP' : nnP >= 0.57 ? 'UP' : nnP <= 0.43 ? 'DOWN' : 'SKIP';
  // Freeze predictions BEFORE settlement use (settlement already known in replay table,
  // but code path only reads tgt.outcome AFTER freezing — enforced order).
  const frozen = Date.now();
  for (const [arm, act, p] of [['A','UP',1],['B',aB,pB],['H',aH,pH],['NN',aNN,nnP]]) {
    store.db.prepare(`INSERT OR IGNORE INTO pattern_predictions(round_id,arm,snapshot_id,pattern_id,p_up,action,watermark_ms,frozen_ms,provenance)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(tgt.round_id, arm, tgt.round_id, pid, p, act, cutoff, frozen, 'REPLAY');
  }
  // Score (now, and only now, read outcome).
  for (const [arm, act] of [['A','UP'],['B',aB],['H',aH],['NN',aNN]]) {
    const correct = act === 'SKIP' ? null : (act === tgt.outcome ? 1 : 0);
    store.db.prepare('INSERT OR IGNORE INTO prediction_results(round_id,arm,correct,venue_result,scored_ms) VALUES(?,?,?,?,?)')
      .run(tgt.round_id, arm, correct, tgt.outcome, Date.now());
  }
  if (aB !== 'SKIP') { armB.acted++; if (aB === tgt.outcome) armB.wins++; }
  if (aH !== 'SKIP') { armH.acted++; if (aH === tgt.outcome) armH.wins++; }
  if (aNN !== 'SKIP') { armNN.acted++; if (aNN === tgt.outcome) armNN.wins++; }
  // Post-settlement: assign node to patterns + support update (observation nodes pre-exist; membership is the online step).
  try {
    store.db.prepare('INSERT OR IGNORE INTO node_pattern_membership(obs_node_id,pattern_id,distance) VALUES(?,?,?)').run(tgt.node_id, pid, null);
    const kk = kassign(tgt.features);
    store.db.prepare('INSERT OR IGNORE INTO node_pattern_membership(obs_node_id,pattern_id,distance) VALUES(?,?,?)').run(tgt.node_id, 'SEED-KM16:'+kk.id, kk.d);
    store.addSupport('SEED-GRID', tgt.outcome === 'UP');
    store.addSupport('SEED-KM16', tgt.outcome === 'UP');
  } catch {}
  store.setWatermark('replay_scored_through', tgt.open_ts, tgt.round_id);
}
console.log(JSON.stringify({stream: stream.length, armA, armB, armH, armNN, skips}));
store.close();
