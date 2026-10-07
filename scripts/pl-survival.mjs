// R07 survival + R08 base-rate tracking + V2 tertile persistence.
// Same reconstructed-tertile system applied to V1 splits, V2-R splits, unseen rows.
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {plVector} from '../src/plfeatures.mjs';
const T = JSON.parse(fs.readFileSync('research/pattern-lab/library/v2-r/v1r-tertiles.json','utf8')).thresholds;
function loadElig(dbPath, ids) {
  const d = new DatabaseSync(dbPath, {readOnly:true});
  const all = d.prepare(`SELECT id,start_ms AS startMs,open_micro AS openMicro,close_micro AS closeMicro,result FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY startMs`).all();
  const prices = new Map(d.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices').all().map(r=>[r.ts,r.price]));
  d.close();
  const want = new Set(ids); const out = [], prev = [];
  for (const r of all) {
    const b = plVector(prices, r, 60, prev); prev.push(r);
    if (!want.has(r.id) || !b.eligible) continue;
    out.push({id:r.id, startMs:r.startMs, label:r.result, m:b.vec.ret_60, v:b.vec.vol_300, f:b.vec.direction_flips_60s});
  }
  return out;
}
const L1 = s => JSON.parse(fs.readFileSync(`var/pattern-lab/v1/splits/${s}.json`,'utf8')).map(r=>r.id);
const V1 = {train: loadElig('var/pattern-lab/v1/source/history-checkpoint.db', L1('train')),
            validation: loadElig('var/pattern-lab/v1/source/history-checkpoint.db', L1('validation')),
            test: loadElig('var/pattern-lab/v1/splits/test.json' && 'var/pattern-lab/v1/source/history-checkpoint.db', L1('test'))};
const L2 = s => JSON.parse(fs.readFileSync(`var/pattern-lab/v2/r/splits/${s}.json`,'utf8')).map(r=>r.id);
const V2 = {train: loadElig(process.env.PL_DB||'var/pattern-lab/v2/source/history-checkpoint.db', L2('train')),
            validation: loadElig(process.env.PL_DB||'var/pattern-lab/v2/source/history-checkpoint.db', L2('validation')),
            test: loadElig(process.env.PL_DB||'var/pattern-lab/v2/source/history-checkpoint.db', L2('test'))};
const q = r => `Q-${r.m<T.mLo?'down':r.m>T.mHi?'up':'flat'}-${r.v<T.vLo?'low':r.v>T.vHi?'high':'med'}-${r.f<=1?'smooth':'choppy'}`;
const regs = [...new Set([...V1.train,...V1.validation,...V1.test,...V2.train,...V2.validation,...V2.test].map(q))].sort();
function stat(rows, id) { const s = rows.filter(r=>q(r)===id); return {n:s.length, up:s.filter(r=>r.label==='UP').length}; }
function rate(s){ return s.n?+(s.up/s.n).toFixed(4):null; }
const base = rs => rs.filter(r=>r.label==='UP').length/Math.max(1,rs.length);
const B1 = {train:base(V1.train), validation:base(V1.validation), test:base(V1.test)};
const B2 = {train:base(V2.train), validation:base(V2.validation), test:base(V2.test)};
let csv = 'regime,v1_tr_n,v1_tr_up,v1_va_up,v1_te_up,v2_tr_n,v2_tr_up,v2_va_up,v2_te_up,verdict\n';
const counts = {SURVIVED:0, WEAKENED:0, COLLAPSED:0, FLIPPED:0, INSUFFICIENT:0};
for (const id of regs) {
  const a=stat(V1.train,id), b=stat(V1.validation,id), c=stat(V1.test,id);
  const d=stat(V2.train,id), e=stat(V2.validation,id), f=stat(V2.test,id);
  const dev1 = a.n>=50 ? Math.abs(a.up/a.n-B1.train) : null;
  const dev2 = d.n>=50 ? Math.abs(d.up/d.n-B2.train) : null;
  let verdict = 'INSUFFICIENT';
  if ((a.n>=50) && (d.n>=50)) {
    const dir1 = (a.up/a.n)>=0.5?'UP':'DOWN', dir2 = (d.up/d.n)>=0.5?'UP':'DOWN';
    if (Math.max(dev1,dev2) < 0.03) verdict = 'COLLAPSED';
    else if (dir1!==dir2 && dev1>=0.03 && dev2>=0.03) verdict = 'FLIPPED';
    else if (dir1===dir2 && dev1>=0.05 && dev2>=0.05) verdict = 'SURVIVED';
    else if (dir1===dir2 && (dev1>=0.03 || dev2>=0.03)) verdict = 'WEAKENED';
    else verdict = 'COLLAPSED';
  }
  counts[verdict]++;
  csv += `${id},${a.n},${rate(a)},${rate(b)},${rate(c)},${d.n},${rate(d)},${rate(e)},${rate(f)},${verdict}\n`;
}
fs.writeFileSync('data/reports/pattern-lab-v2-pattern-survival.csv', csv);
console.log(JSON.stringify(counts), 'baseV1:', JSON.stringify(B1), 'baseV2:', JSON.stringify(B2));
