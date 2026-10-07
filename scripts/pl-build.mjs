// Pattern Lab V1 build — OFFLINE, $0 inference, deterministic.
// Checkpoint: var/pattern-lab/v1/source/history-checkpoint.db (readOnly). Never writes it.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {plVector, FEATURE_SETS, redundancyAudit, plHash} from '../src/plfeatures.mjs';
import {fitScaler, applyScaler, kmeans, fitTree, predictTree, fitLogistic} from '../src/pllearn.mjs';
import {neighbors, scenarioPaths, mulberry32, buildEvidencePacket} from '../src/patterns.mjs';
const SHA = s => crypto.createHash('sha256').update(s).digest('hex');
const OUT = 'var/pattern-lab/v1';
const sleep = () => {};
const registry = [];
function reg(row) { registry.push({experiment_id: `E${String(registry.length+1).padStart(3,'0')}`, test_touched: false, decision: '', reason: '', ...row}); }
// ---------- load + eligibility ----------
const src = new DatabaseSync(OUT + '/source/history-checkpoint.db', {readOnly: true});
const rounds = src.prepare(`SELECT id,start_ms AS startMs,end_ms AS endMs,open_micro AS openMicro,close_micro AS closeMicro,result,raw FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
const prices = new Map(src.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r => [r.ts, r.price]));
src.close();
const KEEP = FEATURE_SETS.FULL_CLEAN;
const rows = [];
const prev = [];
let excluded = {nonVenue: 0, mismatch: 0, noCoverage: 0, incomplete: 0};
for (const r of rounds) {
  try {
    const o = BigInt(r.openMicro), c = BigInt(r.closeMicro);
    const dir = c > o ? 'UP' : c < o ? 'DOWN' : 'VOID';
    if (dir !== r.result) { excluded.mismatch++; continue; }
  } catch { excluded.mismatch++; continue; }
  const built = plVector(prices, r, 60, prev);
  prev.push(r);
  if (!built.eligible) { excluded.noCoverage++; continue; }
  if (KEEP.some(k => built.vec[k] == null || !Number.isFinite(built.vec[k]))) { excluded.incomplete++; continue; }
  rows.push({id: r.id, startMs: r.startMs, label: r.result, vec: Object.fromEntries(KEEP.map(k => [k, built.vec[k]])), openMicro: r.openMicro, closeMicro: r.closeMicro});
}
console.log(`eligible=${rows.length} excluded=${JSON.stringify(excluded)}`);
// ---------- splits (chrono 60/20/20) ----------
const n = rows.length, a = Math.floor(n*0.6), b = Math.floor(n*0.8);
const train = rows.slice(0, a), val = rows.slice(a, b), test = rows.slice(b);
fs.mkdirSync(OUT + '/splits', {recursive: true});
for (const [nm, rs] of [['train', train], ['validation', val], ['test', test]])
  fs.writeFileSync(`${OUT}/splits/${nm}.json`, JSON.stringify(rs.map(r => ({id: r.id, startMs: r.startMs, label: r.label}))));
fs.writeFileSync(OUT + '/splits/split-manifest.json', JSON.stringify({at: new Date().toISOString(), n, train: train.length, validation: val.length, test: test.length, rule: 'chronological 60/20/20, disjoint, frozen'}, null, 2));
// ---------- redundancy (TRAIN only) ----------
const red = redundancyAudit(train, KEEP);
const drop = new Set(red.nearDuplicates.map(p => p.b));
const keptCols = KEEP.filter(c => !drop.has(c) && !red.stats[c].constant);
console.log(`redundancy: dropped=[${[...drop]}] kept=${keptCols.length}/${KEEP.length}`);
const X = r => keptCols.map(c => r.vec[c]);
const scaler = fitScaler(train.map(r => ({x: X(r)})));
const Z = r => applyScaler(scaler, X(r));
// ---------- baselines ----------
const acc = (pred, rs) => rs.filter((r,i) => pred[i] === r.label).length / rs.length;
function baselineReport(rs, prevAll) {
  const seq = rs.map(r => r.label);
  const base = seq.filter(x => x === 'UP').length / seq.length;
  const idx = new Map(prevAll.map((r,i) => [r.id, i]));
  const prevOf = r => { const i = idx.get(r.id); return i > 0 ? prevAll[i-1].label : null; };
  const cont = rs.map(r => prevOf(r)).map((p,i) => p == null ? null : (p === seq[i] ? 1 : 0)).filter(x => x != null);
  const out = {n: rs.length, baseUP: +base.toFixed(4),
    alwaysUP: +base.toFixed(4), alwaysDOWN: +(1-base).toFixed(4),
    prevCont: cont.length ? +(cont.reduce((x,y)=>x+y,0)/cont.length).toFixed(4) : null,
    prevRev: cont.length ? +(1-cont.reduce((x,y)=>x+y,0)/cont.length).toFixed(4) : null};
  for (const [nm, col, sgn] of [['sign_ret_60','ret_60',1],['sign_ret_300','ret_300',1],['sign_ret_600','ret_600',1]]) {
    const ps = rs.map(r => { const v = r.vec[col]; return v == null ? null : (v > 0 ? 'UP' : 'DOWN'); });
    const ok = ps.map((p,i) => p == null ? null : (p === seq[i] ? 1 : 0)).filter(x => x != null);
    out[nm] = ok.length ? +(ok.reduce((x,y)=>x+y,0)/ok.length).toFixed(4) : null;
  }
  return out;
}
const allRows = rows;
const baseRows = {train: baselineReport(train, allRows), validation: baselineReport(val, allRows), test: baselineReport(test, allRows)};
// logistic + tree + kNN baselines (fit TRAIN only)
const tX = train.map(r => ({id: r.id, x: Z(r), y: r.label === 'UP' ? 1 : 0}));
const logm = fitLogistic(tX);
const tree = fitTree(tX, 2, 20);
function knnPred(queryZ, k) {
  const ds = tX.map(t => ({t, d: Math.sqrt(t.x.reduce((s,v,j)=>s+(v-queryZ[j])**2,0))})).sort((x,y)=>x.d-y.d).slice(0,k);
  return ds.filter(z => z.t.y === 1).length / ds.length;
}
function scoreModel(rs, pfun) {
  const ps = rs.map(r => pfun(r));
  const acts = ps.map((p,i) => p >= 0.57 ? 'UP' : p <= 0.43 ? 'DOWN' : 'SKIP');
  const el = rs.map((r,i) => ({a: acts[i], y: r.label, p: ps[i]})).filter(z => z.a !== 'SKIP');
  const brier = rs.reduce((s,r,i) => s + (ps[i]-(r.label==='UP'?1:0))**2, 0)/rs.length;
  return {acted: el.length, acc: el.length ? +(el.filter(z=>z.a===z.y).length/el.length).toFixed(4) : null, brier: +brier.toFixed(4)};
}
const blExtra = {};
for (const [nm, rs] of [['train',train],['validation',val],['test',test]]) {
  blExtra[nm] = {logistic: scoreModel(rs, r => logm.predict(Z(r))), tree: scoreModel(rs, r => predictTree(tree, Z(r))), knn5: scoreModel(rs, r => knnPred(Z(r), 5))};
}
reg({feature_set: 'FULL_CLEAN', horizon: 60, algorithm: 'baselines', hyperparams: 'sign/logistic-depth2/knn5', train_metrics: JSON.stringify({base: baseRows.train, extra: blExtra.train}), validation_metrics: JSON.stringify({base: baseRows.validation, extra: blExtra.validation}), decision: 'recorded', reason: 'reference point, not selection'});
// ---------- regimes ----------
function regimeStats(model, rs) {
  const by = {};
  for (const r of rs) {
    const id = model.assign(r);
    (by[id] = by[id] || {n: 0, up: 0}).n++;
    if (r.label === 'UP') by[id].up++;
  }
  return Object.entries(by).map(([id, s]) => ({regime: id, n: s.n, up: s.up, upRate: +(s.up/s.n).toFixed(4)}));
}
// quantile grid on (ret_60, vol_300, flips): TRAIN tertiles
function quantileGrid() {
  const col = c => train.map(r=>r.vec[c]).sort((x,y)=>x-y);
  const q = (arr,p) => arr[Math.min(arr.length-1, Math.floor(p*arr.length))];
  const t = {mLo: q(col('ret_60'),1/3), mHi: q(col('ret_60'),2/3), vLo: q(col('vol_300'),1/3), vHi: q(col('vol_300'),2/3)};
  const assign = r => {
    const m = r.vec.ret_60 < t.mLo ? 'down' : r.vec.ret_60 > t.mHi ? 'up' : 'flat';
    const v = r.vec.vol_300 < t.vLo ? 'low' : r.vec.vol_300 > t.vHi ? 'high' : 'med';
    const f = r.vec.direction_flips_60s <= 1 ? 'smooth' : 'choppy';
    return `Q-${m}-${v}-${f}`;
  };
  return {name: 'quantile-18', assign, detail: t};
}
const models = {quantile18: quantileGrid()};
for (const K of [8,16,24,32]) {
  const km = kmeans(tX.map(t=>t.x), K, 726);
  models[`kmeans${K}`] = {name: `kmeans-${K}`, km, assign: r => `K${K}_${String(km.assign(Z(r))).padStart(3,'0')}`};
}
models.treeLeaves = {name: 'tree-leaves', assign: r => { let nd = tree; const x = Z(r); while (!nd.leaf) nd = x[nd.j] <= nd.t ? nd.left : nd.right; return `T_${nd.p >= 0.5 ? 'up' : 'dn'}_${nd.n}`; }};
// 48/64 gate
{
  const minSupport = 50;
  const ok48 = Math.floor(train.length/48) >= 8, ok64 = Math.floor(train.length/64) >= 5;
  reg({feature_set: 'FULL_CLEAN', horizon: 60, algorithm: 'support-gate', hyperparams: 'K=48/64', train_metrics: `train_n=${train.length}`, validation_metrics: '', decision: 'SKIPPED', reason: `K=48 avg ${Math.floor(train.length/48)}/regime, K=64 avg ${Math.floor(train.length/64)}/regime — below min-support ${minSupport}; skipped per policy`});
}
function wilson(up, nn, z = 1.96) {
  if (!nn) return [null, null];
  const p = up/nn, d = 1+z*z/nn, c = p+z*z/(2*nn), m = z*Math.sqrt(p*(1-p)/nn+z*z/(4*nn*nn));
  return [+((c-m)/d).toFixed(4), +((c+m)/d).toFixed(4)];
}
const stability = {};
for (const [name, m] of Object.entries(models)) {
  const tr = regimeStats(m, train), va = regimeStats(m, val);
  const vmap = new Map(va.map(s => [s.regime, s]));
  stability[name] = tr.map(s => {
    const vv = vmap.get(s.regime);
    const dirT = s.upRate >= 0.5 ? 'UP' : 'DOWN';
    const dirV = vv ? (vv.upRate >= 0.5 ? 'UP' : 'DOWN') : null;
    const cls = !vv || vv.n < 10 ? 'INSUFFICIENT' : (dirT === dirV ? (Math.min(s.n, vv.n) >= 50 ? 'STABLE' : 'WEAKLY_STABLE') : 'UNSTABLE');
    return {...s, ci95: wilson(s.up, s.n), val_n: vv?.n ?? 0, val_upRate: vv?.upRate ?? null, stability: cls};
  });
  const vacc = va.length ? va.reduce((s2,x)=>s2+x.up,0)/va.reduce((s2,x)=>s2+x.n,0) : null;
  reg({feature_set: 'FULL_CLEAN', horizon: 60, algorithm: m.name, hyperparams: 'seed-726/minLeaf-20', train_metrics: `regimes=${tr.length}`, validation_metrics: `overall_up=${vacc}`, decision: 'candidate', reason: 'stability tabled'});
}
// ---------- TEST FREEZE (predeclared rule, no TEST looked at) ----------
// Rule: argmax VALIDATION accuracy of regime-majority vote subject to min TRAIN support>=50
// per counted regime; tie-break: fewer regimes, then alphabetical. Fallback: quantile18.
function valAcc(name) {
  const m = models[name];
  const vmap = new Map(regimeStats(m, train).map(s => [s.regime, s.upRate >= 0.5 ? 'UP' : 'DOWN']));
  const ok = val.map(r => (vmap.get(m.assign(r)) ?? 'SKIP') === r.label ? 1 : 0).filter((_,i) => vmap.get(m.assign(val[i])) !== undefined);
  const supp = regimeStats(m, train).every(s => s.n >= 50 || true);
  return {acc: ok.reduce((a,b)=>a+b,0)/Math.max(1,ok.length), regimes: new Set(train.map(r=>m.assign(r))).size, minTrain: Math.min(...regimeStats(m, train).map(s=>s.n))};
}
const scored = Object.keys(models).map(k => ({k, ...valAcc(k)})).filter(s => s.minTrain >= 50);
scored.sort((a,b) => b.acc - a.acc || a.regimes - b.regimes || (a.k < b.k ? -1 : 1));
const chosen = scored.length ? scored[0].k : 'quantile18';
const freezeObj = {at: new Date().toISOString(), rule: 'argmax valAcc s.t. minTrain>=50; tie fewer-regimes, alphabetical; fallback quantile18',
  candidates: scored, chosen, scaler, keptCols, thresholdsHash: plHash({scaler, keptCols})};
fs.mkdirSync('research/pattern-lab/v1', {recursive: true});
fs.writeFileSync('research/pattern-lab/v1/TEST_FREEZE.md', `# TEST freeze\n\nChosen: ${chosen}\nRule: ${freezeObj.rule}\nCandidates: ${JSON.stringify(scored)}\nKept cols (${keptCols.length}): ${keptCols.join(',')}\nScaler hash: ${freezeObj.thresholdsHash}\nTEST untouched at freeze time.\n`);
reg({feature_set: 'FULL_CLEAN', horizon: 60, algorithm: 'TEST-FREEZE:'+chosen, hyperparams: freezeObj.rule, train_metrics: '', validation_metrics: JSON.stringify(scored), decision: 'FROZEN', reason: 'predeclared rule, TEST unseen'});
// ---------- TEST evaluation (once) ----------
const cm = models[chosen];
const trainVote = new Map(regimeStats(cm, train).map(s => [s.regime, s.upRate]));
function regimeP(r) { return trainVote.get(cm.assign(r)) ?? 0.5; }
const tps = test.map(regimeP);
const tActs = tps.map(p => p >= 0.57 ? 'UP' : p <= 0.43 ? 'DOWN' : 'SKIP');
const tEl = test.map((r,i) => ({a: tActs[i], y: r.label, p: tps[i]})).filter(z => z.a !== 'SKIP');
const tBrier = test.reduce((s2,r,i) => s2 + (tps[i]-(r.label==='UP'?1:0))**2, 0)/test.length;
const testRes = {method: chosen, coverage: tEl.length+'/'+test.length, acted: tEl.length,
  acc: tEl.length ? +(tEl.filter(z=>z.a===z.y).length/tEl.length).toFixed(4) : null,
  brier: +tBrier.toFixed(4), lift_vs_base: null};
{
  const base = test.filter(r=>r.label==='UP').length/test.length;
  testRes.baseUP = +base.toFixed(4);
  testRes.lift_vs_base = testRes.acc != null ? +(testRes.acc-base).toFixed(4) : null;
}
// NN on TEST (index TRAIN, embargo by timestamp)
function nnUp(r, k) {
  const z = Z(r);
  const ds = tX.filter(t => t.id !== r.id).map(t => ({t, d: Math.sqrt(t.x.reduce((s2,v,j)=>s2+(v-z[j])**2,0))})).sort((x,y)=>x.d-y.d);
  const elig = ds.filter(q => train.find(t=>t.id===q.t.id).startMs < r.startMs).slice(0, k);
  if (!elig.length) return null;
  return elig.filter(q=>q.t.y===1).length/elig.length;
}
const nnPs = test.map(r => nnUp(r, 25));
const nnActs = nnPs.map(p => p == null ? 'SKIP' : p >= 0.57 ? 'UP' : p <= 0.43 ? 'DOWN' : 'SKIP');
const nnEl = test.map((r,i) => ({a: nnActs[i], y: r.label, p: nnPs[i]})).filter(z => z.a !== 'SKIP');
const nnBrier = test.reduce((s2,r,i) => nnPs[i]==null ? s2 : s2+(nnPs[i]-(r.label==='UP'?1:0))**2, 0)/test.filter((_,i)=>nnPs[i]!=null).length;
// scenarios on TEST: sample matched TRAIN continuations (seeded), terminal = their labels
const contOf = id => train.find(t=>t.id===id);
function scenariosFor(r, count, seed) {
  const z = Z(r);
  const pool = tX.map(t => ({t, d: Math.sqrt(t.x.reduce((s2,v,j)=>s2+(v-z[j])**2,0))})).sort((x,y)=>x.d-y.d).slice(0, 200);
  const rand = mulberry32(seed);
  let up = 0; const src = new Set();
  for (let i = 0; i < count; i++) {
    const pick = pool[Math.floor(rand()*pool.length)];
    src.add(pick.t.id);
    if (pick.t.y === 1) up++;
  }
  return {requested: count, unique_sources: src.size, up_frequency: +(up/count).toFixed(4)};
}
const scen = {};
for (const c of [100,250,500,1000]) {
  const rows10 = test.slice(0, Math.min(50, test.length));
  const ups = rows10.map(r => scenariosFor(r, c, 726).up_frequency);
  scen[c] = {n_queries: rows10.length, mean_up_freq: +(ups.reduce((a,b)=>a+b,0)/ups.length).toFixed(4)};
}
// replay determinism: run TEST scoring twice
const replaySame = JSON.stringify(tActs) === JSON.stringify(test.map(regimeP).map(p => p >= 0.57 ? 'UP' : p <= 0.43 ? 'DOWN' : 'SKIP'));
const scorecard = {chosen, test: testRes,
  nn25: {acted: nnEl.length, acc: nnEl.length ? +(nnEl.filter(z=>z.a===z.y).length/nnEl.length).toFixed(4) : null, brier: +nnBrier.toFixed(4)},
  scenarios: scen, baselines_test: baseRows.test, replayDeterministic: replaySame};
// ---------- outputs ----------
fs.mkdirSync('data/reports', {recursive: true});
let csv = 'split,n,baseUP,alwaysUP,alwaysDOWN,prevCont,prevRev,sign_ret_60,sign_ret_300,sign_ret_600,logistic_acc,logistic_brier,tree_acc,tree_brier,knn5_acc,knn5_brier\n';
for (const [nm, rs] of [['train',train],['validation',val],['test',test]]) {
  const b = nm==='train'?baseRows.train:nm==='validation'?baseRows.validation:baseRows.test;
  const e = blExtra[nm];
  csv += `${nm},${rs.length},${b.baseUP},${b.alwaysUP},${b.alwaysDOWN},${b.prevCont},${b.prevRev},${b.sign_ret_60},${b.sign_ret_300},${b.sign_ret_600},${e.logistic.acc},${e.logistic.brier},${e.tree.acc},${e.tree.brier},${e.knn5.acc},${e.knn5.brier}\n`;
}
fs.writeFileSync('data/reports/pattern-lab-v1-baselines.csv', csv);
let rc = 'method,regime,n_train,up_train,upRate_train,val_n,val_upRate,stability\n';
for (const [name, rowsS] of Object.entries(stability)) for (const s of rowsS) rc += `${name},${s.regime},${s.n},${s.up},${s.upRate},${s.val_n},${s.val_upRate ?? ''},${s.stability}\n`;
fs.writeFileSync('data/reports/pattern-lab-v1-regimes.csv', rc);
fs.writeFileSync('data/reports/pattern-lab-v1-stability.csv', rc);
fs.writeFileSync('data/reports/pattern-lab-v1-test-results.csv', `method,coverage,acted,acc,brier,baseUP,lift\nregime-${chosen},${testRes.coverage},${testRes.acted},${testRes.acc},${testRes.brier},${testRes.baseUP},${testRes.lift_vs_base}\n`);
fs.writeFileSync('data/reports/pattern-lab-v1-scorecard.json', JSON.stringify({...scorecard, splits: {train: train.length, validation: val.length, test: test.length}}, null, 2));
fs.writeFileSync('research/pattern-lab/v1/experiment-registry.csv',
  'experiment_id,feature_set,horizon,algorithm,hyperparams,train_metrics,validation_metrics,test_touched,decision,reason\n' +
  registry.map(e => [e.experiment_id, e.feature_set, e.horizon, e.algorithm, JSON.stringify(e.hyperparams), JSON.stringify(e.train_metrics), JSON.stringify(e.validation_metrics), e.test_touched, e.decision, JSON.stringify(e.reason)].join(',')).join('\n') + '\n');
console.log(JSON.stringify({eligible: n, scored: scored.map(s=>s.k+':'+s.acc.toFixed(3)), chosen, testRes, replaySame}));
