// Historical pattern foundation — Jupiter-only, deterministic, chronological.
// Features use ONLY data with source_ts strictly before the round's open (past-only).
// Live availability of pool fields is UNPROVEN (retrieved post-settlement); they are
// research-only and excluded from the live snapshot path.
import {createHash} from 'node:crypto';
export const HISTORY_VERSION = 'history-v1-20261007';
// Fixed vector order. All returns in bps from 60s-sampled HISTORICAL_BACKFILL prices.
export const VECTOR_ORDER = ['ret_60','ret_120','ret_300','vol_300','range_300_bps','flips_300','prev_up_1','prev_up_2','prev_up_3','pool_imbal'];
function bps(a,b){ return b ? +(10000*(a/b-1)).toFixed(4) : null; }
export function loadLabeledRounds(store) {
  return store.db.prepare(`SELECT id,start_ms AS startMs,end_ms AS endMs,open_micro AS openMicro,close_micro AS closeMicro,result,raw FROM historical_rounds WHERE result IN ('UP','DOWN') ORDER BY start_ms`).all();
}
export function loadPriceMap(store) {
  const rows = store.db.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices ORDER BY ts').all();
  const m = new Map(rows.map(r=>[r.ts, r.price]));
  return m;
}
// Nearest available price within tolMs (deterministic: closest, ties → earlier).
// Harvest grids may differ from venue grids; snapping is documented, never interpolated.
export function priceAt(prices, ts, tolMs=120000) {
  if (prices.has(ts)) return prices.get(ts);
  let best = null, bestD = Infinity;
  for (const k of prices.keys()) {
    const d = Math.abs(k - ts);
    if (d <= tolMs && (d < bestD || (d === bestD && k < best))) { best = k; bestD = d; }
  }
  return best == null ? null : prices.get(best);
}
// Build one past-only vector per labeled round. Returns {rows, skipped}.
export function buildVectors(store) {
  const rounds = loadLabeledRounds(store);
  const prices = loadPriceMap(store);
  const out = []; let skipped = 0;
  const seq = [];
  for (const r of rounds) {
    const openSec = Math.floor(r.startMs/1000);
    const need = [60,120,180,240,300,360].map(d => priceAt(prices, (openSec-d)*1000));
    if (need.some(v => v == null || !Number.isFinite(v))) { skipped++; seq.push(r.result); continue; }
    const pNow = priceAt(prices, openSec*1000);
    const v = {
      ret_60: pNow != null ? bps(pNow, priceAt(prices, (openSec-60)*1000)) : null,
      ret_120: pNow != null ? bps(pNow, priceAt(prices, (openSec-120)*1000)) : null,
      ret_300: pNow != null ? bps(pNow, priceAt(prices, (openSec-300)*1000)) : null,
    };
    const window = [60,120,180,240,300].map(d => priceAt(prices, (openSec-d)*1000));
    const retsSeq = window.slice(1).map((p,i) => bps(window[i], p));
    const mean = retsSeq.reduce((a,b)=>a+b,0)/retsSeq.length;
    const vol = Math.sqrt(retsSeq.reduce((a,b)=>a+(b-mean)**2,0)/retsSeq.length);
    const hi = Math.max(...window), lo = Math.min(...window);
    let flips = 0, prior = 0;
    for (const x of retsSeq) { const d = Math.sign(x); if (d && prior && d !== prior) flips++; if (d) prior = d; }
    let raw = {};
    try { raw = JSON.parse(r.raw || '{}'); } catch {}
    const up = Number(raw.upPool ?? NaN), down = Number(raw.downPool ?? NaN);
    const imbal = (Number.isFinite(up) && Number.isFinite(down) && (up+down) > 0) ? (up-down)/(up+down) : null;
    const vec = [v.ret_60, v.ret_120, v.ret_300, +vol.toFixed(4), bps(hi,lo), flips,
      seq.slice(-1)[0] === 'UP' ? 1 : 0, seq.slice(-2,-1)[0] === 'UP' ? 1 : 0, seq.slice(-3,-2)[0] === 'UP' ? 1 : 0,
      imbal == null ? null : +imbal.toFixed(4)];
    out.push({id: r.id, startMs: r.startMs, label: r.result, vec, poolNote: 'POST_SETTLEMENT_RESEARCH_ONLY'});
    seq.push(r.result);
  }
  return {rows: out, skipped};
}
// Chronological split by time (no shuffling). fracs must sum to 1.
export function chronoSplit(rows, fracs=[0.6,0.2,0.2]) {
  const n = rows.length;
  const a = Math.floor(n*fracs[0]), b = Math.floor(n*(fracs[0]+fracs[1]));
  return {train: rows.slice(0,a), validation: rows.slice(a,b), test: rows.slice(b)};
}
// Quantile thresholds from TRAIN only. Returns {thresholds, norms} with train means/stds.
export function fitThresholds(trainRows, idx=[0,3]) {
  const col = i => trainRows.map(r=>r.vec[i]).filter(v=>v!=null).sort((a,b)=>a-b);
  const q = (arr,p) => arr.length ? arr[Math.min(arr.length-1, Math.floor(p*arr.length))] : null;
  const mom = col(idx[0]);
  const vol = col(idx[1]);
  const thresholds = {momLo: q(mom,1/3), momHi: q(mom,2/3), volLo: q(vol,1/3), volHi: q(vol,2/3)};
  const norms = {};
  VECTOR_ORDER.forEach((name,i) => {
    const vals = trainRows.map(r=>r.vec[i]).filter(v=>typeof v==='number' && Number.isFinite(v));
    const mean = vals.reduce((a,b)=>a+b,0)/Math.max(1,vals.length);
    const sd = Math.sqrt(vals.reduce((a,b)=>a+(b-mean)**2,0)/Math.max(1,vals.length)) || 1;
    norms[name] = {mean, sd};
  });
  return {thresholds, norms, hash: createHash('sha256').update(JSON.stringify({thresholds, v:HISTORY_VERSION})).digest('hex')};
}
export function assignRegime(vec, thresholds) {
  const [r60, , , vol, , flips] = vec;
  const mom = r60 == null ? 'flat' : r60 < thresholds.momLo ? 'down' : r60 > thresholds.momHi ? 'up' : 'flat';
  const v = vol == null ? 'med' : vol < thresholds.volLo ? 'low' : vol > thresholds.volHi ? 'high' : 'med';
  const r = flips == null ? 'smooth' : flips <= 1 ? 'smooth' : 'choppy';
  return `H-${mom}-${v}-${r}`;
}
export function wilson(lb, n, z=1.96) {
  if (!n) return [null,null];
  const p = lb/n, d = 1+z*z/n, c = p+z*z/(2*n), m = z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));
  return [+((c-m)/d).toFixed(4), +((c+m)/d).toFixed(4)];
}
