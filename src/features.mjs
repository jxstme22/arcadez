// Canonical tape + causal snapshots + rich feature engine (H10/H11/H12/H13).
// Jupiter-only inputs. receive_ts <= cutoff enforced everywhere. No forward fill.
// Pool features are NOT computed (venue pools retrieved post-settlement; live
// availability UNPROVEN) — listed in missing[] with reasons.
export const TAPE_VERSION = 'tape-v1-20261007';
export const FEATURE_VERSION = 'features-v1-20261007';
export const SNAPSHOT_HORIZONS_S = [60,55,45,30,20,15,10,7,5,4,3,2,1];
const bps = (p, old) => (old ? +(10000*(p/old-1)).toFixed(4) : null);
// H10: one canonical row per second over [first,last] tick coverage; MISSING where empty.
export function buildTape(ticks, stepMs = 1000) {
  const good = ticks.filter(t => Number.isFinite(t.sourceMs) && Number.isFinite(t.price))
    .sort((a,b) => a.sourceMs - b.sourceMs);
  if (!good.length) return {version: TAPE_VERSION, rows: []};
  const rows = [];
  const start = Math.floor(good[0].sourceMs/stepMs)*stepMs;
  const end = Math.floor(good.at(-1).sourceMs/stepMs)*stepMs;
  let prevSec = null;
  for (let sec = start; sec <= end; sec += stepMs) {
    const inSec = good.filter(t => Math.floor(t.sourceMs/stepMs)*stepMs === sec);
    if (!inSec.length) {
      rows.push({secondTs: sec, price: null, tickCount: 0, first: null, last: null, min: null, max: null,
        priceChange: null, gapBefore: prevSec == null ? null : sec - prevSec - stepMs, quality: 'MISSING', provenance: 'TAPE_GAP'});
    } else {
      const ps = inSec.map(t => t.price);
      rows.push({secondTs: sec, price: ps.at(-1), tickCount: inSec.length, first: ps[0], last: ps.at(-1),
        min: Math.min(...ps), max: Math.max(...ps), priceChange: ps.at(-1) - ps[0],
        gapBefore: prevSec == null ? null : sec - prevSec - stepMs, quality: 'OK', provenance: 'JUPITER_WS_TAPE',
        receiveTs: inSec.at(-1).receivedMs ?? null});
    }
    prevSec = sec;
  }
  return {version: TAPE_VERSION, rows};
}
// Causal tick subset for a cutoff (shared by snapshots + features).
export function causalTicks(ticks, cutoffMs) {
  return ticks.filter(t => t.provenance === 'LIVE_RECEIVED_WS' && t.sourceMs <= t.receivedMs + 200 &&
    t.sourceMs <= cutoffMs && t.receivedMs <= cutoffMs).sort((a,b) => a.receivedMs - b.receivedMs);
}
// Last price with receivedMs <= refMs and within maxAge of refMs.
function priceBefore(sorted, refMs, maxAge) {
  const c = sorted.filter(t => t.receivedMs <= refMs).at(-1);
  return c && refMs - c.receivedMs <= maxAge ? c.price : null;
}
// H12+H13: rich deterministic features. prevLabels: oldest->newest settled past labels.
export function featuresRich(ticks, asOf, {prevLabels = [], maxAge = 2500, lockMs = null, windowMs = 300000} = {}) {
  const missing = [], flags = [];
  const sorted = causalTicks(ticks, asOf).filter(t => t.receivedMs >= asOf - windowMs);
  const last = sorted.at(-1);
  if (!last || asOf - last.receivedMs > maxAge) { missing.push('ALL_STALE_OR_EMPTY'); flags.push('STALE_FEED'); return null; }
  if (sorted.filter(t => t.receivedMs >= asOf - 60000).length < 8) { missing.push('LOW_COVERAGE_60S'); flags.push('LOW_COVERAGE'); }
  const v = {}, R = [1,2,3,5,7,10,15,20,30,45,60,120,300];
  for (const d of R) { const p = priceBefore(sorted, asOf - d*1000, maxAge); v[`return_${d}s_bps`] = p == null ? (missing.push(`return_${d}s`), null) : bps(last.price, p); v[`return_${d}s_usd`] = p == null ? null : +(last.price - p).toFixed(4); }
  const vel = (a,b) => v[`return_${a}s_bps`] != null && v[`return_${b}s_bps`] != null ? +(v[`return_${a}s_bps`] - v[`return_${b}s_bps`]).toFixed(4) : (missing.push(`velocity_${a}_${b}`), null);
  v.velocity_1_3 = vel(1,3); v.velocity_3_5 = vel(3,5); v.velocity_5_10 = vel(5,10); v.velocity_10_30 = vel(10,30);
  v.acceleration_short = v.velocity_1_3 != null && v.velocity_3_5 != null ? +(v.velocity_1_3 - v.velocity_3_5).toFixed(4) : (missing.push('acceleration_short'), null);
  v.acceleration_medium = v.velocity_5_10 != null && v.velocity_10_30 != null ? +(v.velocity_5_10 - v.velocity_10_30).toFixed(4) : (missing.push('acceleration_medium'), null);
  const retsFor = w => { const wTicks = sorted.filter(t => t.receivedMs >= asOf - w*1000); const rs = wTicks.slice(1).map((t,i) => bps(t.price, wTicks[i].price)); return {wTicks, rs}; };
  for (const w of [5,10,15,30,60,120,300]) {
    const {wTicks, rs} = retsFor(w);
    if (rs.length < 2) { v[`realized_vol_${w}s_bps`] = null; missing.push(`realized_vol_${w}s`); continue; }
    const m = rs.reduce((a,b)=>a+b,0)/rs.length;
    v[`realized_vol_${w}s_bps`] = +Math.sqrt(rs.reduce((a,b)=>a+(b-m)**2,0)/rs.length).toFixed(4);
    const ps = wTicks.map(t => t.price);
    const hi = Math.max(...ps), lo = Math.min(...ps);
    v[`range_${w}s_bps`] = bps(hi, lo);
    if (w === 15 || w === 60) {
      v[`distance_from_high_${w}s_bps`] = bps(last.price, hi);
      v[`distance_from_low_${w}s_bps`] = bps(last.price, lo);
      v[`position_in_range_${w}s`] = hi > lo ? +((last.price - lo)/(hi - lo)).toFixed(4) : (missing.push(`position_in_range_${w}s`), null);
    }
  }
  v.vol_expansion_5v30 = v.realized_vol_5s_bps != null && v.realized_vol_30s_bps ? +(v.realized_vol_5s_bps / Math.max(1e-9, v.realized_vol_30s_bps)).toFixed(4) : (missing.push('vol_expansion_5v30'), null);
  v.vol_expansion_15v60 = v.realized_vol_15s_bps != null && v.realized_vol_60s_bps ? +(v.realized_vol_15s_bps / Math.max(1e-9, v.realized_vol_60s_bps)).toFixed(4) : (missing.push('vol_expansion_15v60'), null);
  v.range_expansion_5v30 = v.range_5s_bps != null && v.range_30s_bps ? +(v.range_5s_bps / Math.max(1e-9, v.range_30s_bps)).toFixed(4) : (missing.push('range_expansion_5v30'), null);
  v.range_expansion_15v60 = v.range_15s_bps != null && v.range_60s_bps ? +(v.range_15s_bps / Math.max(1e-9, v.range_60s_bps)).toFixed(4) : (missing.push('range_expansion_15v60'), null);
  // Path shape over 60s tick returns.
  const m60 = sorted.filter(t => t.receivedMs >= asOf - 60000);
  const seq = m60.slice(1).map((t,i) => Math.sign(t.price - m60[i].price));
  const nz = seq.filter(d => d !== 0);
  v.direction_flips_60s = 0; { let p = 0; for (const d of nz) { if (p && d !== p) v.direction_flips_60s++; if (d) p = d; } }
  v.mono_60s = nz.length ? (nz.every(d => d >= 0) || nz.every(d => d <= 0) ? 1 : 0) : null;
  if (v.mono_60s == null) missing.push('mono_60s');
  let sinceFlip = null;
  for (let i = nz.length - 1; i > 0; i--) { if (nz[i] !== nz[i-1]) { sinceFlip = m60.length - 1 - i; break; } }
  v.seconds_since_flip_60s = sinceFlip;
  if (sinceFlip == null) missing.push('seconds_since_flip_60s');
  const moves = m60.slice(1).map((t,i) => t.price - m60[i].price);
  v.largest_move_60s_usd = moves.length ? +Math.max(...moves.map(Math.abs)).toFixed(4) : (missing.push('largest_move_60s_usd'), null);
  // Transition momentum changes.
  const mc = (a,b) => v[`return_${a}s_bps`] != null && v[`return_${b}s_bps`] != null ? +(v[`return_${a}s_bps`] - v[`return_${b}s_bps`]).toFixed(4) : (missing.push(`momentum_change_${a}_${b}`), null);
  v.momentum_change_1_5 = mc(1,5); v.momentum_change_5_15 = mc(5,15); v.momentum_change_15_60 = mc(15,60);
  // Round sequences (settled past only; caller-supplied, oldest->newest).
  const L = prevLabels.filter(x => x === 'UP' || x === 'DOWN');
  v.previous_round_direction = L.length ? L.at(-1) : (missing.push('previous_round_direction'), null);
  const s = n => L.length >= n ? L.slice(-n).join('') : (missing.push(`previous_${n}_sequence`), null);
  v.previous_2_sequence = s(2); v.previous_3_sequence = s(3); v.previous_5_sequence = s(5);
  const rate = n => L.length >= n ? +(L.slice(-n).filter(x=>x==='UP').length/n).toFixed(4) : (missing.push(`previous_${n}_up_rate`), null);
  v.previous_5_up_rate = rate(5); v.previous_10_up_rate = rate(10);
  v.previous_round_magnitude_bps = null; missing.push('previous_round_magnitude_bps:NEEDS_VENUE_MICROS');
  // Current-round partial state: NOT knowable for the predicted NEXT round (open unknown).
  for (const k of ['distance_from_current_open_bps','current_round_partial_direction','current_round_max_excursion_up_usd','current_round_max_excursion_down_usd','current_round_flip_count']) { v[k] = null; missing.push(k + ':NEXT_ROUND_OPEN_UNKNOWN'); }
  // Pool features: unavailable (post-settlement provenance only).
  for (const k of ['up_pool','down_pool','total_pool','pool_imbalance','pool_change_1s','up_flow_velocity','imbalance_velocity','late_pool_shift']) { v[k] = null; missing.push(k + ':POOL_LIVE_AVAILABILITY_UNPROVEN'); }
  flags.push('POOL_UNAVAILABLE_POST_SETTLEMENT');
  // Time (research-only).
  const d = new Date(asOf);
  v.utc_minute = d.getUTCMinutes(); v.utc_hour = d.getUTCHours(); v.day_of_week = d.getUTCDay();
  v.seconds_to_lock = lockMs != null ? Math.max(0, Math.round((lockMs - asOf)/1000)) : (missing.push('seconds_to_lock'), null);
  const ticksIn = w => sorted.filter(t => t.receivedMs >= asOf - w*1000).length;
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i].receivedMs - sorted[i-1].receivedMs);
  const quality = {ws_state: null, price_age_ms: asOf - last.receivedMs, ticks_5s: ticksIn(5000), ticks_15s: ticksIn(15000),
    ticks_60s: ticksIn(60000), gap_before_ms: gaps.length ? gaps.at(-1) : null,
    max_gap_60s: Math.max(0, ...gaps.filter((_,i) => sorted[i+1].receivedMs >= asOf - 60000), 0),
    missing_fields: [...new Set(missing)], quality_flags: [...new Set(flags)], provenance: ['JUPITER_WS_TAPE']};
  return {version: FEATURE_VERSION, asOfMs: asOf, lastPrice: last.price, values: v, quality};
}
// H11: immutable multi-horizon snapshots sharing one implementation with live path.
export function snapshotsForRound(round, ticks, {horizons = SNAPSHOT_HORIZONS_S, prevLabels = [], maxAge = 2500} = {}) {
  return horizons.map(h => {
    const cutoff = round.startMs - h*1000;
    const f = featuresRich(ticks, cutoff, {prevLabels, maxAge, lockMs: round.startMs - 6000});
    return {roundId: round.id, horizonS: h, cutoffMs: cutoff, features: f, hash: null};
  });
}
