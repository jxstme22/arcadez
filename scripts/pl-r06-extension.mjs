// R06 locked-V1 extension: V1 frozen artifacts applied WITHOUT refit to V2-only-new rows.
// V1 tertiles reconstructed deterministically: same frozen code + same frozen V1 TRAIN rows.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {plVector, FEATURE_SETS} from '../src/plfeatures.mjs';
import {fitScaler, applyScaler} from '../src/pllearn.mjs';
import {neighbors} from '../src/patterns.mjs';
import {mulberry32} from '../src/patterns.mjs';
const KEEP = FEATURE_SETS.FULL_CLEAN;
const v1ckpt = 'var/pattern-lab/v1/source/history-checkpoint.db';
const v1split = id => JSON.parse(fs.readFileSync(`var/pattern-lab/v1/splits/${id}.json`, 'utf8'));
const v1trainIds = new Set(v1split('train').map(r => r.id));
function loadRows(dbPath) {
  const d = new DatabaseSync(dbPath, {readOnly: true});
  const rounds = d.prepare(`SELECT id,start_ms AS startMs,open_micro AS openMicro,close_micro AS closeMicro,result,raw FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
  const prices = new Map(d.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r => [r.ts, r.price]));
  d.close();
  return {rounds, prices};
}
function buildEligible(rounds, prices) {
  const out = [], prev = [];
  for (const r of rounds) {
    const b = plVector(prices, r, 60, prev);
    prev.push(r);
    if (!b.eligible) continue;
    if (KEEP.some(k => b.vec[k] == null || !Number.isFinite(b.vec[k]))) continue;
    out.push({id: r.id, startMs: r.startMs, label: r.result, vec: KEEP.map(k => b.vec[k])});
  }
  return out;
}
const v1 = loadRows(v1ckpt);
const v1train = buildEligible(v1.rounds.filter(r => v1trainIds.has(r.id)), v1.prices);
// V1 quantile tertiles (same definition as V1 build).
function tertile(vals, p) { const a = [...vals].sort((x,y)=>x-y); return a[Math.min(a.length-1, Math.floor(p*a.length))]; }
const col = c => v1train.map(r => FEATURE_SETS.FULL_CLEAN.indexOf(c)).map((_, i) => null);
const ret60 = v1train.map(r => r.vec[KEEP.indexOf('ret_60')]);
const vol300 = v1train.map(r => r.vec[KEEP.indexOf('vol_300')]);
const T = {mLo: tertile(ret60,1/3), mHi: tertile(ret60,2/3), vLo: tertile(vol300,1/3), vHi: tertile(vol300,2/3)};
const v1assign = r => {
  const m = r.vec[KEEP.indexOf('ret_60')], v = r.vec[KEEP.indexOf('vol_300')];
  const flips = r.vec[KEEP.indexOf('direction_flips_60s')];
  return `Q-${m < T.mLo ? 'down' : m > T.mHi ? 'up' : 'flat'}-${v < T.vLo ? 'low' : v > T.vHi ? 'high' : 'med'}-${flips <= 1 ? 'smooth' : 'choppy'}`;
};
// V1 scaler from frozen library (no refit).
const v1scaler = JSON.parse(fs.readFileSync('research/pattern-lab/library/v1/scaler.json', 'utf8'));
const Z1 = x => applyScaler(v1scaler, x);
const v1idx = v1train.map(r => ({id: r.id, asOfMs: r.startMs, vec: Z1(r.vec), label: r.label, y: r.label === 'UP' ? 1 : 0}));
// V2 extension rows: startMs strictly after V1 checkpoint max.
const V1MAX = Date.parse(JSON.parse(fs.readFileSync('research/pattern-lab/v1/source-manifest.json','utf8')).latest);
const v2 = loadRows(process.env.PL_DB || 'var/pattern-lab/v2/source/history-checkpoint.db');
const ext = buildEligible(v2.rounds.filter(r => r.startMs > V1MAX), v2.prices);
console.log(`V1MAX=${new Date(V1MAX).toISOString()} extension=${ext.length}`);
// Regime transfer
let acted = 0, wins = 0; const perReg = {};
const trainVote = {};
for (const r of v1train) { const id = v1assign(r); (trainVote[id] = trainVote[id] || {n:0,up:0}); trainVote[id].n++; if (r.label==='UP') trainVote[id].up++; }
for (const r of ext) {
  const id = v1assign(r);
  const v = trainVote[id];
  const p = v ? v.up/v.n : 0.5;
  perReg[id] = perReg[id] || {n:0, up:0, wins:0, acted:0};
  perReg[id].n++; if (r.label==='UP') perReg[id].up++;
  const a = p >= 0.57 ? 'UP' : p <= 0.43 ? 'DOWN' : 'SKIP';
  if (a !== 'SKIP') { acted++; perReg[id].acted++; if (a === r.label) { wins++; perReg[id].wins++; } }
}
const brier = ext.reduce((s,r) => { const v = trainVote[v1assign(r)]; const p = v ? v.up/v.n : 0.5; return s + (p-(r.label==='UP'?1:0))**2; }, 0)/Math.max(1,ext.length);
console.log(`regime: acted=${acted}/${ext.length} acc=${acted?(wins/acted).toFixed(4):null} brier=${brier.toFixed(4)}`);
// kNN transfer (V1 index + V1 scaler, k=25)
let nActs = 0, nWins = 0, nb = 0;
for (const r of ext) {
  const res = neighbors({trainVectors: v1idx, query: {asOfMs: r.startMs, vec: Z1(r.vec)}, k: 25, embargoMs: 0});
  if (res.upFraction == null) continue;
  nb += (res.upFraction-(r.label==='UP'?1:0))**2;
  const a = res.upFraction >= 0.57 ? 'UP' : res.upFraction <= 0.43 ? 'DOWN' : 'SKIP';
  if (a !== 'SKIP') { nActs++; if (a === r.label) nWins++; }
}
console.log(`knn: acted=${nActs}/${ext.length} acc=${nActs?(nWins/nActs).toFixed(4):null} brier=${(nb/ext.length).toFixed(4)}`);
// Scenario transfer: sample V1 TRAIN pool matched continuations (labels), seeded.
function scenFor(r, count, seed) {
  const z = Z1(r.vec);
  const pool = v1idx.map(t => ({t, d: Math.sqrt(t.vec.reduce((s2,v,j)=>s2+(v-z[j])**2,0))})).sort((x,y)=>x.d-y.d).slice(0,200);
  const rand = mulberry32(seed);
  let up = 0; const src = new Set();
  for (let i = 0; i < count; i++) { const p = pool[Math.floor(rand()*pool.length)]; src.add(p.t.id); if (p.t.label === 'UP') up++; }
  return {up: up/count, ess: src.size};
}
let sActs = 0, sWins = 0, sb = 0;
for (const r of ext) {
  const s1000 = scenFor(r, 1000, 726);
  sb += (s1000.up-(r.label==='UP'?1:0))**2;
  const a = s1000.up >= 0.57 ? 'UP' : s1000.up <= 0.43 ? 'DOWN' : 'SKIP';
  if (a !== 'SKIP') { sActs++; if (a === r.label) sWins++; }
}
console.log(`scen1000: acted=${sActs}/${ext.length} acc=${sActs?(sWins/sActs).toFixed(4):null} brier=${(sb/ext.length).toFixed(4)}`);
const baseUP = ext.filter(r=>r.label==='UP').length/ext.length;
console.log(`extension baseUP=${baseUP.toFixed(4)}`);
fs.mkdirSync('research/pattern-lab/v2', {recursive: true});
fs.writeFileSync('research/pattern-lab/v2/extension-test.json', JSON.stringify({v1max: new Date(V1MAX).toISOString(), n: ext.length, baseUP: +baseUP.toFixed(4),
  regime: {acted, acc: acted?+(wins/acted).toFixed(4):null, brier: +brier.toFixed(4), perRegime: perReg},
  knn: {acted: nActs, acc: nActs?+(nWins/nActs).toFixed(4):null, brier: +(nb/ext.length).toFixed(4)},
  scen1000: {acted: sActs, acc: sActs?+(sWins/sActs).toFixed(4):null, brier: +(sb/ext.length).toFixed(4)}}, null, 2));
