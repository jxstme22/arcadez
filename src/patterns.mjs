// Pattern Lab V1 research skeleton — OFFLINE, FIXTURE_ONLY, never live features.
// 16-32 pre-registered regimes from lagged price-only features. No edge claimed.
import {createHash} from 'node:crypto';
export const PATTERN_VERSION = 'pattern-lab-v1-20261007';
export const REGIMES = (() => {
  const vols = ['low','med','high'];
  const moms = ['down','flat','up'];
  const revs = ['smooth','choppy'];
  const list = [];
  for (const v of vols) for (const m of moms) for (const r of revs) {
    // 3*3*2=18 regimes; add expansion split for high-vol to reach 21. Keep 16-32 bound.
    list.push({id:`R-${m}-${v}-${r}`, momentum:m, vol:v, reversal:r});
    if (v==='high' && r==='choppy') list.push({id:`R-${m}-${v}-${r}-exp`, momentum:m, vol:v, reversal:r, expansion:true});
  }
  return list.slice(0, 24);
})();
export function regimeHash() {
  return createHash('sha256').update(JSON.stringify({version:PATTERN_VERSION, regimes:REGIMES})).digest('hex');
}
export function classifyRegime(feature) {
  // Train-only thresholds must be supplied by caller; defaults are structural placeholders, not fitted.
  if (!feature || typeof feature.last_price_usd !== 'number') return null;
  const r60 = feature.observed_returns_bps?.['return_60s_bps'];
  const vol = feature.realized_volatility_sample_bps ?? 0;
  const flips = feature.direction_flips_60s ?? 0;
  const mom = r60 == null ? 'flat' : r60 > 8 ? 'up' : r60 < -8 ? 'down' : 'flat';
  const v = vol < 5 ? 'low' : vol < 15 ? 'med' : 'high';
  const r = flips <= 3 ? 'smooth' : 'choppy';
  const match = REGIMES.find(x=>x.momentum===mom && x.vol===v && x.reversal===r && !x.expansion);
  return match ? match.id : null;
}
// Seeded RNG (mulberry32) for reproducible scenario bootstrap.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Block bootstrap of past-only 60s return paths. Returns simulated_up_fraction as UNCALIBRATED.
export function scenarioPaths({pastReturnsBps, seed=726, paths=100, horizonSecs=60}) {
  if (!Array.isArray(pastReturnsBps) || pastReturnsBps.length < 10) throw new Error('INSUFFICIENT_PAST_RETURNS');
  if (paths < 1 || paths > 1000) throw new Error('PATHS_MUST_BE_1_TO_1000');
  const rand = mulberry32(seed);
  let up = 0;
  const bands = [];
  for (let i=0;i<paths;i++) {
    // Sample one past 60s block return as the path outcome (research placeholder, not a price model).
    const pick = pastReturnsBps[Math.floor(rand()*pastReturnsBps.length)];
    bands.push(pick);
    if (pick > 0) up++;
  }
  bands.sort((a,b)=>a-b);
  const q = p => bands[Math.min(bands.length-1, Math.max(0, Math.floor(p*bands.length)))];
  return {simulated_up_fraction: up/paths, paths, seed, p5_bps:q(0.05), p50_bps:q(0.5), p95_bps:q(0.95),
    note:'UNCALIBRATED_SCENARIO_FREQUENCY_NOT_PROBABILITY_FIXTURE_ONLY', version:PATTERN_VERSION, hash:regimeHash()};
}
// Provider-neutral Pattern Lab evidence packet — SHADOW ONLY. Never fed to providers
// until a future frozen experiment explicitly activates it.
export function buildEvidencePacket({feature, regime, neighborResult, scenarioResult, wsHealth}) {
  return {
    packet_version: PATTERN_VERSION,
    status: 'SHADOW_ONLY_NOT_FOR_INFERENCE',
    current_market_state: feature ? {last_price_usd: feature.last_price_usd, price_age_ms: feature.price_age_ms} : null,
    matched_regime: regime ? {id: regime.regime ?? regime.id ?? null, support_n: regime.n ?? null, historical_up_rate: regime.upRate ?? null} : null,
    nearest_neighbors: neighborResult ? {n: neighborResult.k ?? 0, up_rate: neighborResult.upFraction ?? null} : {n: 0, up_rate: null},
    scenario_simulation: scenarioResult ? {n: scenarioResult.paths ?? 0, up_rate: scenarioResult.simulated_up_fraction ?? null} : {n: 0, up_rate: null},
    quality: {data_fresh: wsHealth ? (wsHealth.lastTickAgeMs ?? null) : null, pattern_support: 'UNKNOWN_UNTIL_PROSPECTIVE', regime_stability: 'UNMEASURED'},
  };
}
// Chronological neighbor retrieval with time embargo (no future neighbors).
export function neighbors({trainVectors, query, k=5, embargoMs=3600000}) {
  if (!Array.isArray(trainVectors) || trainVectors.length === 0) return {k:0, members:[], upFraction:null};
  const eligible = trainVectors.filter(v => v.asOfMs <= query.asOfMs - embargoMs);
  if (!eligible.length) return {k:0, members:[], upFraction:null, reason:'EMBARGO_EXCLUDES_ALL'};
  const dist = v => Math.sqrt(v.vec.reduce((s,x,i)=>s+(x-(query.vec[i]||0))**2,0));
  const ranked = eligible.map(v=>({...v, d:dist(v)})).sort((a,b)=>a.d-b.d).slice(0, Math.min(k, eligible.length));
  const ups = ranked.filter(r=>r.label==='UP').length;
  return {k:ranked.length, members:ranked.map(r=>({id:r.id, d:+r.d.toFixed(4), label:r.label})), upFraction: ups/ranked.length, embargoMs};
}
