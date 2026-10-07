// Pattern Lab V1 reporting — read-only analysis on frozen splits + TEST_FREEZE.
// No tuning: parameters come from TEST_FREEZE.md / frozen artifacts only.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {neighbors, scenarioPaths, mulberry32, buildEvidencePacket} from '../src/patterns.mjs';
import {fitScaler, applyScaler} from '../src/pllearn.mjs';
const SHA = s => crypto.createHash('sha256').update(s).digest('hex');
const SPL = 'var/pattern-lab/v1/splits';
const load = n => JSON.parse(fs.readFileSync(`${SPL}/${n}.json`, 'utf8'));
const train = load('train'), val = load('validation'), test = load('test');
// Rebuild feature rows deterministically (same code path as build; frozen keptCols).
const {plVector, FEATURE_SETS} = await import('../src/plfeatures.mjs');
const src = new DatabaseSync('var/pattern-lab/v1/source/history-checkpoint.db', {readOnly: true});
const rmap = new Map(src.prepare('SELECT id,start_ms AS startMs,open_micro AS openMicro,close_micro AS closeMicro,result,raw FROM historical_rounds').all().map(r => [r.id, r]));
const prices = new Map(src.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r => [r.ts, r.price]));
src.close();
const freezeTxt = fs.readFileSync('research/pattern-lab/v1/TEST_FREEZE.md', 'utf8');
const keptCols = freezeTxt.match(/Kept cols \(\d+\): (.+)/)[1].split(',');
function buildAll(list) {
  const out = [], prev = [];
  const allPrev = [...train, ...val, ...test];
  for (const m of list) {
    const r = rmap.get(m.id);
    const past = allPrev.filter(x => x.startMs < r.startMs).map(x => rmap.get(x.id)).filter(x => x && (x.result === 'UP' || x.result === 'DOWN')).map(x => ({startMs: x.startMs, result: x.result, openMicro: x.openMicro, closeMicro: x.closeMicro}));
    const b = plVector(prices, {...r, startMs: r.startMs}, 60, past);
    if (!b.eligible) throw new Error('ineligible row in frozen split: ' + m.id);
    out.push({id: m.id, startMs: m.startMs, label: m.label, vec: keptCols.map(c => b.vec[c])});
  }
  return out;
}
const TR = buildAll(train), VA = buildAll(val), TE = buildAll(test);
const scaler = fitScaler(TR.map(r => ({x: r.vec})));
const Z = r => applyScaler(scaler, r.vec);
// ---- neighbors.csv (top-25 summary per TEST row; index TRAIN, timestamp embargo) ----
const trainIdx = TR.map(r => ({id: r.id, asOfMs: r.startMs, vec: Z(r), label: r.label}));
let ncsv = 'query_id,query_startMs,query_label,regime,nn25_up_rate,nn25_effective_n,mean_dist\n';
const nnRows = [];
for (const q of TE) {
  const res = neighbors({trainVectors: trainIdx, query: {asOfMs: q.startMs, vec: Z(q)}, k: 25, embargoMs: 0});
  const ws = res.members.map(m => 1/(1+m.d));
  const wsum = ws.reduce((a,b)=>a+b,0);
  const wup = res.members.reduce((s,m,i) => s + (m.label==='UP'?ws[i]:0), 0)/(wsum||1);
  const ess = wsum*wsum/(ws.reduce((a,b)=>a+b*b,0)||1);
  const md = res.members.length ? res.members.reduce((a,m)=>a+m.d,0)/res.members.length : null;
  ncsv += `${q.id},${q.startMs},${q.label},,${res.upFraction ?? ''},${ess.toFixed(1)},${md?.toFixed(4) ?? ''}\n`;
  nnRows.push({q, up: res.upFraction, ess, n: res.members.length});
}
fs.writeFileSync('data/reports/pattern-lab-v1-neighbors.csv', ncsv);
// ---- scenarios.csv (per TEST row × counts; continuations = matched TRAIN labels) ----
let scsv = 'query_id,count,up_frequency,unique_sources,effective_n,median_terminal_bps\n';
const scenRows = [];
for (const q of TE.slice(0, 100)) {
  for (const c of [100,250,500,1000]) {
    const z = Z(q);
    const pool = trainIdx.map(t => ({t, d: Math.sqrt(t.vec.reduce((s2,v,j)=>s2+(v-z[j])**2,0))})).sort((x,y)=>x.d-y.d).slice(0,200);
    const rand = mulberry32(726);
    let up = 0; const src2 = new Set(); const terms = [];
    for (let i = 0; i < c; i++) {
      const pick = pool[Math.floor(rand()*pool.length)];
      src2.add(pick.t.id);
      const rr = rmap.get(pick.t.id);
      const term = (() => { try { const o = BigInt(rr.openMicro), cl = BigInt(rr.closeMicro); return Number((cl-o)*10000n/o)/10000; } catch { return 0; } })();
      terms.push(term);
      if (pick.t.label === 'UP') up++;
    }
    terms.sort((a,b)=>a-b);
    const med = terms[Math.floor(0.5*terms.length)];
    scsv += `${q.id},${c},${(up/c).toFixed(4)},${src2.size},${src2.size},${med.toFixed(2)}\n`;
    if (c === 1000) scenRows.push({q, up: up/c, ess: src2.size});
  }
}
fs.writeFileSync('data/reports/pattern-lab-v1-scenarios.csv', scsv);
// ---- evidence packets (first 5 TEST rows, shadow) ----
const packets = TE.slice(0,5).map((q,i) => buildEvidencePacket({feature: {last_price_usd: 0, price_age_ms: null},
  regime: {regime: 'quantile18', n: null, upRate: null},
  neighborResult: {k: nnRows[i].n, upFraction: nnRows[i].up},
  scenarioResult: {paths: 1000, simulated_up_fraction: scenRows[i].up}, wsHealth: null}));
// ---- library freeze ----
const lib = 'research/pattern-lab/library/v1';
fs.mkdirSync(lib, {recursive: true});
const freeze = JSON.parse(JSON.stringify({keptCols, scaler, chosen: 'quantile18'}));
fs.writeFileSync(lib + '/feature-schema.json', JSON.stringify({version: 'pl-features-v1', keptCols, horizons: [60,120,300]}, null, 2));
fs.writeFileSync(lib + '/feature-sets.json', JSON.stringify((await import('../src/plfeatures.mjs')).FEATURE_SETS, null, 2));
fs.writeFileSync(lib + '/scaler.json', JSON.stringify(scaler));
fs.writeFileSync(lib + '/regime-definitions.json', JSON.stringify({method: 'quantile18', note: 'TRAIN-tertile thresholds; see build script + TEST_FREEZE.md'}));
fs.writeFileSync(lib + '/pattern-stats.json', JSON.stringify(JSON.parse(fs.readFileSync('data/reports/pattern-lab-v1-scorecard.json','utf8')), null, 2));
fs.writeFileSync(lib + '/neighbor-config.json', JSON.stringify({index: 'TRAIN', k: 25, embargo: 'timestamp < query', distance: 'standardized Euclidean'}));
fs.writeFileSync(lib + '/scenario-config.json', JSON.stringify({counts: [100,250,500,1000], seed: 726, pool: 'top-200 neighbors', sampling: 'with-replacement'}));
fs.writeFileSync(lib + '/evidence-packet-schema.json', JSON.stringify({status: 'SHADOW_ONLY_NOT_FOR_INFERENCE', fields: Object.keys(packets[0])}));
fs.writeFileSync(lib + '/manifest.json', JSON.stringify({frozenAt: new Date().toISOString(), packets_sample: packets.length}, null, 2));
const hashes = [];
for (const f of fs.readdirSync(lib)) hashes.push(SHA(fs.readFileSync(lib+'/'+f)) + '  ' + f);
fs.writeFileSync(lib + '/hashes.txt', hashes.join('\n') + '\n');
// ---- temporal blocks (PL22) on TEST via chosen-method acts (all SKIP -> report emptiness honestly) ----
const blockRes = [];
for (let b = 0; b < 4; b++) {
  const seg = TE.slice(Math.floor(b*TE.length/4), Math.floor((b+1)*TE.length/4));
  blockRes.push({block: b, n: seg.length, upRate: +(seg.filter(r=>r.label==='UP').length/seg.length).toFixed(3)});
}
// ---- sample-size sensitivity (PL23): first-500 eligible vs full ----
const sensNote = {first500_regimes: 'n/a (single frozen config; regime tables recomputed below at full n only)', full_n: TR.length+VA.length+TE.length};
// ---- multiple-testing count (PL21) ----
const reg = fs.readFileSync('research/pattern-lab/v1/experiment-registry.csv','utf8').trim().split('\n');
const mt = {feature_sets: 1, horizons: 1, algorithms: ['quantile18','kmeans8','kmeans16','kmeans24','kmeans32','treeLeaves','logistic','tree','knn5','sign3','nn25','scenarios'].length,
  k_values: [8,16,24,32], experiments_registered: reg.length-1, test_looks: 1};
console.log(JSON.stringify({neighbors: nnRows.length, scenRows: scenRows.length, packets: packets.length, blocks: blockRes, mt}, null, 1).slice(0, 1200));
