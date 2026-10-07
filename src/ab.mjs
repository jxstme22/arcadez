// A/B pure helpers (no side effects): grid vectors, evidence, mode bodies.
import {requestFor} from './models.mjs';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
const IDX = JSON.parse(fs.readFileSync('data/benchmark/ab-index.json','utf8'));
export const INDEX_SHA = IDX.sha;
export const INDEX_KEPT = IDX.keptCols;
const bps = (p, o) => (o ? +(10000*(p/o-1)).toFixed(4) : null);
// Live minute-grid vector compatible with the frozen index (last tick at/before each mark).
export function liveGridVector(ticks, cutoffMs) {
  const px = s => {
    const c = ticks.filter(t => t.receivedMs <= cutoffMs - s*1000).at(-1);
    return c && (cutoffMs - s*1000) - c.receivedMs <= 5000 ? c.price : null;
  };
  const P = {};
  for (let d = 600; d >= 60; d -= 60) P[d] = px(d);
  if (Object.values(P).some(v => v == null)) return null;
  const last = P[60];
  const R = d => bps(last, P[d]);
  const win = [600,540,480,420,360,300,240,180,120,60].map(d => P[d]);
  const slice = n => win.slice(-n);
  const rets = s => s.slice(1).map((p,i) => bps(s[i], p));
  const vol = r => r.length < 2 ? null : +Math.sqrt(r.reduce((a,b)=>a+b*b,0)/r.length).toFixed(4);
  const full = {
    ret_60: R(60), ret_120: R(120), ret_180: R(180), ret_300: R(300), ret_600: R(600),
    vol_180: vol(rets(slice(4))), vol_300: vol(rets(slice(6))), vol_600: vol(rets(slice(10))),
    range_60: bps(Math.max(...slice(2)), Math.min(...slice(2))),
    range_300: bps(Math.max(...slice(6)), Math.min(...slice(6))),
    position_in_range_300: (() => { const s = slice(6), hi = Math.max(...s), lo = Math.min(...s); return hi > lo ? +((last-lo)/(hi-lo)).toFixed(4) : null; })(),
    direction_flips_300s: (() => { const s = slice(6); let f = 0, p = 0; for (let i = 1; i < s.length; i++) { const dd = Math.sign(s[i]-s[i-1]); if (dd && p && dd !== p) f++; if (dd) p = dd; } return f; })(),
    vol_expansion_180v300: null, range_expansion_180v300: null,
    prev_dir_up: null, previous_5_up_rate: null, previous_10_up_rate: null, current_streak_length: null,
    breakout_up: null, breakout_down: null,
  };
  const r180 = (() => { const s = slice(4), hi = Math.max(...s), lo = Math.min(...s); return bps(hi, lo); })();
  full.vol_expansion_180v300 = full.vol_300 != null && full.vol_180 != null ? +(full.vol_300/Math.max(1e-9,full.vol_180)).toFixed(4) : null;
  full.range_expansion_180v300 = full.range_300 != null && r180 != null ? +(full.range_300/Math.max(1e-9,r180)).toFixed(4) : null;
  return full;
}
export function fillSeq(full, prevLabels) {
  const L = prevLabels.filter(x => x === 'UP' || x === 'DOWN');
  full.prev_dir_up = L.length ? (L.at(-1) === 'UP' ? 1 : 0) : null;
  const rate = n => L.length >= n ? +(L.slice(-n).filter(x=>x==='UP').length/n).toFixed(4) : null;
  full.previous_5_up_rate = rate(5); full.previous_10_up_rate = rate(10);
  let s = 0;
  for (let i = L.length-1; i >= 0 && L[i] === L.at(-1); i--) s++;
  full.current_streak_length = L.length ? s : null;
  return full;
}
// Frozen pattern evidence from the index (TRAIN-only, embargoed by asOfMs).
export function patternEvidence(grid, roundId, asOfMs) {
  const T = IDX.tertiles, kc = IDX.keptCols;
  const g = k => grid[k];
  const regime = (g('ret_60') == null || g('vol_300') == null || g('direction_flips_300s') == null) ? null
    : `Q-${g('ret_60')<T.mLo?'down':g('ret_60')>T.mHi?'up':'flat'}-${g('vol_300')<T.vLo?'low':g('vol_300')>T.vHi?'high':'med'}-${g('direction_flips_300s')<=1?'smooth':'choppy'}`;
  const q = kc.map(c => grid[c]);
  if (q.some(v => typeof v !== 'number' || !Number.isFinite(v))) return {regime: null, pRegime: null, nn: null, scen: null, reason: 'NONFINITE_QUERY'};
  const z = q.map((v, j) => (v - IDX.scaler.mean[j]) / IDX.scaler.sd[j]);
  const pool = IDX.train.filter(t => t.startMs < asOfMs)
    .map(t => ({t, d: Math.sqrt(t.z.reduce((s2, vv, j) => s2 + (vv - z[j])**2, 0))})).sort((x, y) => x.d - y.d);
  if (!pool.length) return {regime, pRegime: null, nn: null, scen: null, reason: 'EMPTY_POOL'};
  // Regime vote over TRAIN rows sharing the query regime (frozen tertiles on stored raw).
  const qi = k => kc.indexOf(k);
  const qOf = raw => `Q-${raw[qi('ret_60')]<T.mLo?'down':raw[qi('ret_60')]>T.mHi?'up':'flat'}-${raw[qi('vol_300')]<T.vLo?'low':raw[qi('vol_300')]>T.vHi?'high':'med'}-${raw[qi('direction_flips_300s')]<=1?'smooth':'choppy'}`;
  const same = regime ? pool.filter(p => qOf(p.t.raw) === regime) : [];
  const pv = same.length >= 10 ? same.filter(p => p.t.label === 'UP').length / same.length : null;
  const nn = pool.slice(0, 25);
  const nnUp = nn.length ? nn.filter(p => p.t.label === 'UP').length / nn.length : null;
  const seed = Number('0x' + createHash('sha256').update(roundId).digest('hex').slice(0, 8));
  let s = seed >>> 0;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const top = pool.slice(0, 200);
  let up = 0; const src = new Set();
  const N = 100;
  for (let i = 0; i < N && top.length; i++) {
    const pick = top[Math.floor(rnd()*top.length)];
    src.add(pick.t.id);
    if (pick.t.label === 'UP') up++;
  }
  return {regime, pRegime: pv == null ? null : +pv.toFixed(4),
    nn: nn.length ? {n: nn.length, upRate: +nnUp.toFixed(4)} : null,
    scen: top.length ? {n: N, upFreq: +(up/Math.max(1,N)).toFixed(4), unique: src.size} : null, reason: 'OK'};
}
// Mode-specific request bodies: identical market evidence + additive pattern context.
export function bodyFor(arm, mode, snapshot, ev, cfg) {
  const r = requestFor(arm, snapshot, cfg);
  const block = mode === 'A' ? {} : {pattern_regime: ev.regime, regime_up_rate: ev.pRegime,
    ...(mode === 'C' ? {neighbor_up_rate: ev.nn?.upRate ?? null, scenario_up_freq: ev.scen?.upFreq ?? null} : {})};
  if (Object.keys(block).length === 0) return r;
  if (arm === 'openai') return {...r, body: {...r.body, input: JSON.stringify({...snapshot, pattern_evidence: block})}};
  return {...r, body: {...r.body, state: {...snapshot, pattern_evidence: block}}};
}

