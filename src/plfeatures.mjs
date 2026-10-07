// Pattern Lab V1 feature engine — Jupiter-only, past-only, deterministic.
// Grid reality: historical prices are ~60s samples, so sub-minute horizons are
// UNRESOLVABLE here (documented, not tested). Primary horizon T-60; T-120/T-300
// as controlled dimensions. Live 1s application is a separate (Session A) concern.
import {createHash} from 'node:crypto';
export const PL_VERSION = 'pl-features-v1-20261007';
export const HORIZONS = [60, 120, 300]; // seconds before open; primary 60
const bps = (p, old) => (old ? +(10000*(p/old-1)).toFixed(4) : null);
function priceAt(prices, ts, tolMs = 120000) {
  if (prices.has(ts)) return prices.get(ts);
  let best = null, bestD = Infinity;
  for (const k of prices.keys()) { const d = Math.abs(k-ts); if (d <= tolMs && (d < bestD || (d === bestD && k < best))) { best = k; bestD = d; } }
  return best == null ? null : prices.get(best);
}
// All prices strictly before openSec (causal). Returns null when coverage fails.
export function causalWindow(prices, openSec, spanS) {
  const out = [];
  for (let d = spanS; d >= 60; d -= 60) {
    const p = priceAt(prices, (openSec-d)*1000);
    if (p == null || !Number.isFinite(p)) return null;
    out.push(p);
  }
  const p0 = priceAt(prices, openSec*1000);
  // p0 may equal the open minute's own observation; venue open is independent —
  // use only strictly-prior prices for features (drop p0).
  return out.length ? out : null;
}
const retsOf = w => w.slice(1).map((p,i) => bps(w[i], p));
const volOf = rs => { if (rs.length < 2) return null; const m = rs.reduce((a,b)=>a+b,0)/rs.length; return +Math.sqrt(rs.reduce((a,b)=>a+(b-m)**2,0)/rs.length).toFixed(4); };
// Full vector for one (round, horizon). Missing => {eligible:false, reasons[]}.
export function plVector(prices, round, horizonS, prevRounds) {
  const missing = [];
  const openSec = Math.floor(round.startMs/1000);
  const needSpan = Math.max(600, horizonS + 60);
  const win = [];
  for (let d = needSpan; d >= 60; d -= 60) {
    const p = priceAt(prices, (openSec-d)*1000);
    if (p == null) { missing.push('PRICE_COVERAGE'); break; }
    win.push(p);
  }
  if (missing.length || win.length < 10) return {eligible: false, missing: missing.length?missing:['PRICE_COVERAGE'], vec: null};
  const v = {};
  const R = [60,120,180,300,600];
  for (const d of R) { const base = win[win.length - d/60]; v[`ret_${d}`] = base != null ? bps(win.at(-1), base) : (missing.push(`ret_${d}`), null); }
  const vel = (a,b) => v[`ret_${a}`] != null && v[`ret_${b}`] != null ? +(v[`ret_${a}`]-v[`ret_${b}`]).toFixed(4) : (missing.push(`velocity_${a}_${b}`), null);
  for (const k of ['velocity_1_3','velocity_3_5','velocity_5_10','velocity_10_15','velocity_15_30']) { v[k] = null; missing.push(k+':GRID_60S_UNRESOLVABLE'); }
  v.velocity_60_120 = vel(60,120); v.velocity_120_300 = vel(120,300); v.velocity_300_600 = vel(300,600);
  v.acceleration_short = null; missing.push('acceleration_short:GRID_60S_UNRESOLVABLE');
  v.acceleration_medium = v.velocity_60_120 != null && v.velocity_120_300 != null ? +(v.velocity_60_120-v.velocity_120_300).toFixed(4) : (missing.push('acceleration_medium'), null);
  v.acceleration_long = v.velocity_120_300 != null && v.velocity_300_600 != null ? +(v.velocity_120_300-v.velocity_300_600).toFixed(4) : (missing.push('acceleration_long'), null);
  for (const w of [300, 600]) {
    const slice = win.slice(-(w/60+1));
    const rs = retsOf(slice);
    v[`vol_${w/60*60}`] = volOf(rs);
    if (v[`vol_${w/60*60}`] == null) missing.push(`vol_${w/60*60}`);
    const hi = Math.max(...slice), lo = Math.min(...slice);
    v[`range_${w/60*60}`] = bps(hi, lo);
    const last = slice.at(-1);
    v[`distance_from_high_${w/60*60}`] = bps(last, hi);
    v[`distance_from_low_${w/60*60}`] = bps(last, lo);
    v[`position_in_range_${w/60*60}`] = hi > lo ? +((last-lo)/(hi-lo)).toFixed(4) : (missing.push(`position_in_range_${w/60*60}`), null);
  }
  for (const w of [60, 120, 180]) {
    const slice = win.slice(-(w/60+1));
    const rs = retsOf(slice);
    v[`vol_${w}`] = volOf(rs);
    if (v[`vol_${w}`] == null) missing.push(`vol_${w}`);
    const hi = Math.max(...slice), lo = Math.min(...slice);
    v[`range_${w}`] = bps(hi, lo);
  }
  const tail60 = win.slice(-2);
  const flips = w => { const s = win.slice(-(w/60+1)); let f = 0, p = 0; for (let i = 1; i < s.length; i++) { const d = Math.sign(s[i]-s[i-1]); if (d && p && d !== p) f++; if (d) p = d; } return f; };
  v.direction_flips_60s = flips(60); v.direction_flips_300s = flips(300); v.direction_flips_600s = flips(600);
  v.direction_flips_5s = null; missing.push('direction_flips_5s:GRID_60S_UNRESOLVABLE');
  v.direction_flips_10s = null; missing.push('direction_flips_10s:GRID_60S_UNRESOLVABLE');
  v.direction_flips_15s = null; missing.push('direction_flips_15s:GRID_60S_UNRESOLVABLE');
  v.direction_flips_30s = null; missing.push('direction_flips_30s:GRID_60S_UNRESOLVABLE');
  const mono = w => { const s = win.slice(-(w/60+1)); const ds = []; for (let i = 1; i < s.length; i++) { const d = Math.sign(s[i]-s[i-1]); if (d) ds.push(d); } return ds.length ? (ds.every(d=>d>=0)||ds.every(d=>d<=0) ? 1 : 0) : null; };
  v.monotonicity_60s = mono(60) ?? (missing.push('monotonicity_60s'), null);
  v.monotonicity_5s = null; missing.push('monotonicity_5s:GRID_60S_UNRESOLVABLE');
  v.monotonicity_15s = null; missing.push('monotonicity_15s:GRID_60S_UNRESOLVABLE');
  const min1 = win.slice(-2);
  v.max_drawup_60s = null; v.max_drawdown_60s = null;
  {
    const s = win.slice(-2);
    if (s.length === 2) { const d = s[1]-s[0]; v.max_drawup_60s = d > 0 ? +d.toFixed(4) : 0; v.max_drawdown_60s = d < 0 ? +d.toFixed(4) : 0; }
    else { missing.push('max_drawup_60s', 'max_drawdown_60s'); }
  }
  v.max_drawup_15s = null; missing.push('max_drawup_15s:GRID_60S_UNRESOLVABLE');
  v.max_drawdown_15s = null; missing.push('max_drawdown_15s:GRID_60S_UNRESOLVABLE');
  v.pullback_depth = null; missing.push('pullback_depth:NEEDS_INTRAMINUTE_PATH');
  v.recovery_ratio = null; missing.push('recovery_ratio:NEEDS_INTRAMINUTE_PATH');
  {
    const hi300 = Math.max(...win.slice(-6)), lo300 = Math.min(...win.slice(-6));
    const last = win.at(-1);
    v.breakout_up = last >= hi300 ? 1 : 0; v.breakout_down = last <= lo300 ? 1 : 0;
    v.failed_breakout_up = 0; v.failed_breakout_down = 0;
    missing.push('failed_breakout_up:HEURISTIC_ZERO', 'failed_breakout_down:HEURISTIC_ZERO');
  }
  {
    const r1 = volOf(retsOf(win.slice(-2))) ?? 0, r5 = volOf(retsOf(win.slice(-6))) ?? 0;
    v.compression = r5 ? +(r1/Math.max(1e-9,r5)).toFixed(4) : (missing.push('compression'), null);
    v.expansion = v.compression;
  }
  const mc = (a,b) => v[`ret_${a}`] != null && v[`ret_${b}`] != null ? +(v[`ret_${a}`]-v[`ret_${b}`]).toFixed(4) : (missing.push(`momentum_change_${a}_${b}`), null);
  v.momentum_change_1_5 = null; missing.push('momentum_change_1_5:GRID_60S_UNRESOLVABLE');
  v.momentum_change_5_15 = null; missing.push('momentum_change_5_15:GRID_60S_UNRESOLVABLE');
  v.momentum_change_15_60 = mc(60,300);
  v.vol_expansion_5v30 = null; missing.push('vol_expansion_5v30:GRID_60S_UNRESOLVABLE');
  v.vol_expansion_180v300 = v.vol_300 != null && v.vol_180 != null ? +(v.vol_300/Math.max(1e-9,v.vol_180)).toFixed(4) : (missing.push('vol_expansion_180v300'), null);
  v.vol_expansion_30v300 = v.vol_300 != null && v.vol_600 != null ? +(v.vol_300/Math.max(1e-9,v.vol_600)).toFixed(4) : (missing.push('vol_expansion_30v300'), null);
  v.range_expansion_180v300 = v.range_300 != null && v.range_180 != null ? +(v.range_300/Math.max(1e-9,v.range_180)).toFixed(4) : (missing.push('range_expansion_180v300'), null);
  v.trend_strength_change = v.momentum_change_15_60;
  v.flip_rate_change = null; missing.push('flip_rate_change:GRID_60S_UNRESOLVABLE');
  // Sequences from settled past only (prevRounds oldest->newest, all with startMs < round.startMs).
  const L = (prevRounds||[]).filter(r => r.startMs < round.startMs && (r.result === 'UP' || r.result === 'DOWN'));
  v.previous_round_direction = L.length ? L.at(-1).result : (missing.push('previous_round_direction'), null);
  v.prev_dir_up = L.length ? (L.at(-1).result === 'UP' ? 1 : 0) : (missing.push('prev_dir_up'), null);
  const seq = n => L.length >= n ? L.slice(-n).map(r=>r.result[0]).join('') : (missing.push(`previous_${n}_direction_sequence`), null);
  v.previous_2_direction_sequence = seq(2); v.previous_3_direction_sequence = seq(3); v.previous_5_direction_sequence = seq(5);
  const rate = n => L.length >= n ? +(L.slice(-n).filter(r=>r.result==='UP').length/n).toFixed(4) : (missing.push(`previous_${n}_up_rate`), null);
  v.previous_3_up_rate = rate(3); v.previous_5_up_rate = rate(5); v.previous_10_up_rate = rate(10);
  const mag = r => { try { const o = BigInt(r.openMicro), c = BigInt(r.closeMicro); return Number((c>o?c-o:o-c)*10000n/o)/10000; } catch { return null; } };
  v.previous_round_move_bps = L.length ? (mag(L.at(-1)) ?? (missing.push('previous_round_move_bps'), null)) : (missing.push('previous_round_move_bps'), null);
  const mm = n => L.length >= n ? (() => { const ms = L.slice(-n).map(mag).filter(x=>x!=null); return ms.length===n ? +(ms.reduce((a,b)=>a+b,0)/n).toFixed(4) : (missing.push(`previous_${n}_mean_abs_move`), null); })() : (missing.push(`previous_${n}_mean_abs_move`), null);
  v.previous_3_mean_abs_move = mm(3); v.previous_5_mean_abs_move = mm(5);
  let streak = 0;
  for (let i = L.length-1; i >= 0 && L[i].result === L.at(-1)?.result; i--) streak++;
  v.current_streak_direction = L.length ? L.at(-1).result : (missing.push('current_streak_direction'), null);
  v.current_streak_length = L.length ? streak : (missing.push('current_streak_length'), null);
  // Pool: post-settlement provenance only — research flag, never live.
  for (const k of ['up_pool','down_pool','total_pool','pool_imbalance','pool_delta_1s','pool_delta_3s','pool_delta_5s','pool_delta_10s','imbalance_velocity','up_flow_velocity','down_flow_velocity','late_pool_shift','pool_flip_count']) { v[k] = null; missing.push(k+':POOL_LIVE_AVAILABILITY_UNPROVEN'); }
  // Trades: no historical bars exist.
  for (const k of ['trade_count','up_stake_flow','down_stake_flow','net_flow','flow_acceleration']) { v[k] = null; missing.push(k+':NO_HISTORICAL_TRADE_BARS'); }
  // Quality + time.
  v.price_age_ms = null; missing.push('price_age_ms:HISTORICAL_GRID_NO_RECEIVE_TS');
  v.tick_count_5s = null; missing.push('tick_count_5s:HISTORICAL_GRID_NO_TICKS');
  v.tick_count_15s = null; missing.push('tick_count_15s:HISTORICAL_GRID_NO_TICKS');
  v.tick_count_60s = win.length; v.gap_before_ms = null; v.max_gap_60s = null; v.pool_age_ms = null; v.data_completeness = null;
  const d = new Date(round.startMs);
  v.minute_of_hour = d.getUTCMinutes(); v.hour_utc = d.getUTCHours(); v.day_of_week = d.getUTCDay();
  return {eligible: true, missing: [...new Set(missing)], vec: v};
}
export const FEATURE_SETS = {
  CORE_PRICE: ['ret_60','ret_120','ret_180','ret_300','ret_600'],
  PRICE_SHAPE: ['ret_60','ret_120','ret_300','vol_180','vol_300','vol_600','range_60','range_300','direction_flips_60s','direction_flips_300s','monotonicity_60s','compression'],
  PRICE_MULTI_SCALE: ['ret_60','ret_120','ret_180','ret_300','ret_600','vol_60','vol_300','range_60','range_300','position_in_range_300','distance_from_high_300','distance_from_low_300','acceleration_long','vol_expansion_180v300','range_expansion_180v300'],
  PRICE_PLUS_SEQUENCE: ['ret_60','ret_300','vol_300','previous_round_direction','previous_3_direction_sequence','previous_5_direction_sequence','previous_5_up_rate','previous_10_up_rate','current_streak_length','previous_5_mean_abs_move'],
  FULL_CLEAN: ['ret_60','ret_120','ret_180','ret_300','ret_600','vol_180','vol_300','vol_600','range_60','range_300','position_in_range_300','direction_flips_60s','direction_flips_300s','monotonicity_60s','compression','momentum_change_15_60','vol_expansion_180v300','range_expansion_180v300','prev_dir_up','previous_5_up_rate','previous_10_up_rate','current_streak_length','breakout_up','breakout_down'],
};
export function redundancyAudit(rows, cols) {
  // Pearson |r| on TRAIN rows; flags pairs >0.95 and constant columns. No outcome used.
  const vals = c => rows.map(r => r.vec[c]).filter(v => typeof v === 'number' && Number.isFinite(v));
  const stats = {};
  for (const c of cols) {
    const v = vals(c);
    stats[c] = {n: v.length, constant: v.length ? v.every(x => x === v[0]) : true,
      mean: v.length ? v.reduce((a,b)=>a+b,0)/v.length : null};
  }
  const pairs = [];
  for (let i = 0; i < cols.length; i++) for (let j = i+1; j < cols.length; j++) {
    const a = cols[i], b = cols[j];
    const xs = [], ys = [];
    for (const r of rows) { const x = r.vec[a], y = r.vec[b]; if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); } }
    if (xs.length < 10) continue;
    const mx = xs.reduce((x,y)=>x+y,0)/xs.length, my = ys.reduce((x,y)=>x+y,0)/ys.length;
    let num = 0, dx = 0, dy = 0;
    for (let k = 0; k < xs.length; k++) { num += (xs[k]-mx)*(ys[k]-my); dx += (xs[k]-mx)**2; dy += (ys[k]-my)**2; }
    const r = (dx && dy) ? num/Math.sqrt(dx*dy) : 0;
    if (Math.abs(r) > 0.95) pairs.push({a, b, r: +r.toFixed(4)});
  }
  return {stats, nearDuplicates: pairs};
}
export function plHash(o) { return createHash('sha256').update(JSON.stringify(o)).digest('hex'); }
