// V2-R neighbor/scenario/growth reports on frozen splits (descriptive, no selection).
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {neighbors} from '../src/patterns.mjs';
import {mulberry32} from '../src/patterns.mjs';
import {plVector, FEATURE_SETS, redundancyAudit} from '../src/plfeatures.mjs';
import {fitScaler, applyScaler} from '../src/pllearn.mjs';
const OUT = 'var/pattern-lab/v2/r';
const DB = process.env.PL_DB || 'var/pattern-lab/v2/source/history-checkpoint.db';
const L = s => JSON.parse(fs.readFileSync(`${OUT}/splits/${s}.json`, 'utf8'));
function load(ids) {
  const d = new DatabaseSync(DB, {readOnly: true});
  const all = d.prepare(`SELECT id,start_ms AS startMs,open_micro AS openMicro,close_micro AS closeMicro,result FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
  const prices = new Map(d.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r => [r.ts, r.price]));
  d.close();
  const want = new Set(ids); const out = [], prev = [];
  for (const r of all) {
    const b = plVector(prices, r, 60, prev); prev.push(r);
    if (!want.has(r.id) || !b.eligible) continue;
    out.push({id: r.id, startMs: r.startMs, label: r.result, full: b.vec, openMicro: r.openMicro, closeMicro: r.closeMicro});
  }
  return out;
}
const TR0 = load(L('train').map(r=>r.id)), VA0 = load(L('validation').map(r=>r.id)), TE0 = load(L('test').map(r=>r.id));
const red = redundancyAudit(TR0.map(r => ({vec: Object.fromEntries(FEATURE_SETS.FULL_CLEAN.map(k => [k, r.full[k]]))})), FEATURE_SETS.FULL_CLEAN);
const kept = FEATURE_SETS.FULL_CLEAN.filter(c => !red.nearDuplicates.map(p=>p.b).includes(c) && !red.stats[c].constant);
const TR = TR0.map(r => ({...r, x: kept.map(k => r.full[k]), y: r.label==='UP'?1:0}));
const sc = fitScaler(TR);
const Z = r => applyScaler(sc, r.x);
const idx = TR.map(r => ({id: r.id, asOfMs: r.startMs, vec: Z(r), label: r.label}));
// neighbors.csv
let ncsv = 'query_id,query_label,nn25_up_rate,nn25_effective_n,mean_dist\n';
for (const q of TE0) {
  const z = Z({x: kept.map(k => q.full[k])});
  const res = neighbors({trainVectors: idx, query: {asOfMs: q.startMs, vec: z}, k: 25, embargoMs: 0});
  const ws = res.members.map(m => 1/(1+m.d));
  const wsum = ws.reduce((a,b)=>a+b,0);
  const ess = wsum*wsum/(ws.reduce((a,b)=>a+b*b,0)||1);
  const md = res.members.length ? res.members.reduce((a,m)=>a+m.d,0)/res.members.length : null;
  ncsv += `${q.id},${q.label},${res.upFraction ?? ''},${ess.toFixed(1)},${md?.toFixed(4) ?? ''}\n`;
}
fs.writeFileSync('data/reports/pattern-lab-v2-neighbors.csv', ncsv);
// scenarios.csv (100-row TEST sample × 4 counts; pool = top-200 TRAIN by distance)
let scsv = 'query_id,count,up_frequency,unique_sources,effective_n,median_terminal_bps\n';
for (const q of TE0.slice(0,100)) {
  const z = Z({x: kept.map(k => q.full[k])});
  const pool = idx.map(t => ({t, d: Math.sqrt(t.vec.reduce((s,v,j)=>s+(v-z[j])**2,0))})).sort((x,y)=>x.d-y.d).slice(0,200);
  const terms = new Map(pool.map(p => {
    const rr = TR0.find(r => r.id === p.t.id);
    let term = 0;
    try { const o = BigInt(rr.openMicro), c = BigInt(rr.closeMicro); term = Number((c-o)*10000n/o)/10000; } catch {}
    return [p.t.id, {label: p.t.label, term}];
  }));
  for (const c of [100,250,500,1000]) {
    const rand = mulberry32(726);
    let up = 0; const src = new Set(); const ts = [];
    for (let i = 0; i < c; i++) {
      const pick = pool[Math.floor(rand()*pool.length)];
      src.add(pick.t.id);
      const t = terms.get(pick.t.id);
      ts.push(t.term);
      if (t.label === 'UP') up++;
    }
    ts.sort((a,b)=>a-b);
    scsv += `${q.id},${c},${(up/c).toFixed(4)},${src.size},${src.size},${ts[Math.floor(0.5*ts.length)].toFixed(2)}\n`;
  }
}
fs.writeFileSync('data/reports/pattern-lab-v2-scenarios.csv', scsv);
// growth sensitivity: chrono prefixes of eligible universe
const d2 = new DatabaseSync(DB, {readOnly: true});
const allE = d2.prepare(`SELECT id,start_ms AS startMs FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
d2.close();
let gcsv = 'prefix,eligible_n,baseUP,note\n';
const allR = (() => { const dd = new DatabaseSync(DB, {readOnly: true});
  const rr = dd.prepare(`SELECT id,start_ms AS startMs,open_micro AS openMicro,close_micro AS closeMicro,result FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
  const pr = new Map(dd.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r=>[r.ts,r.price]));
  dd.close(); return {rr, pr}; })();
for (const N of [500, 1000, 1677]) {
  const sub = allR.rr.slice(0, N);
  const prev = []; let el = 0, up = 0;
  for (const r of sub) {
    const b = plVector(allR.pr, r, 60, prev); prev.push(r);
    if (!b.eligible) continue;
    el++; if (r.result === 'UP') up++;
  }
  gcsv += `first_${N},${el},${el?(up/el).toFixed(4):''},eligibility-only; regimes recomputed at full-n only\n`;
}
gcsv += `full,2066,,see v2-r scorecard\n`;
fs.writeFileSync('data/reports/pattern-lab-v2-growth-sensitivity.csv', gcsv);
console.log('reports written');
