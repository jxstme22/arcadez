// Rich historical context — Jupiter-only, past-only, deterministic.
// Labels come ONLY from venue records (UP/DOWN). Prices (HISTORICAL_BACKFILL*)
// are context, never labels. Every builder uses timestamps <= cutoff; the
// future close is the label only and never enters features.
export const RICH_VERSION = 'history-rich-v1-20261007';
// Historical snapshot offsets (seconds before round open).
export const SNAPSHOT_OFFSETS_SEC = [60, 55, 45, 30, 20, 15, 10, 7, 5, 4, 3, 2, 1];

function bps(a, b) { return (a == null || b == null || !b) ? null : +(10000 * (a / b - 1)).toFixed(4); }

// Labeled rows: venue UP/DOWN only. VOID and missing stay out of the pattern set.
export function loadLabeledRounds(store) {
  return store.db.prepare(
    `SELECT id,start_ms AS startMs,end_ms AS endMs,open_micro AS openMicro,
            close_micro AS closeMicro,result,raw,provenance
     FROM historical_rounds
     WHERE result IN ('UP','DOWN') AND provenance LIKE 'VENUE_RECORDED%'
     ORDER BY start_ms`).all();
}

// Merged second->price map. 1s densified rows win; 60s grid fills the rest.
// Both tables are HISTORICAL_BACKFILL* (never live ticks).
export function loadPriceSeries(store) {
  const m = new Map();
  try {
    for (const r of store.db.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices ORDER BY ts').all())
      if (!m.has(r.ts)) m.set(r.ts, r.price);
  } catch {}
  try {
    for (const r of store.db.prepare('SELECT source_ts_ms AS ts, price_usd AS price FROM historical_prices_1s ORDER BY ts').all())
      m.set(r.ts, r.price); // 1s preferred
  } catch {}
  return m;
}

// Raw second-level path for one round: openSec-back .. openSec+fwd inclusive.
// No interpolation: absent seconds are null (gaps stay gaps).
export function contextPath(openSec, prices, back = 600, fwd = 60) {
  const path = [];
  let present = 0;
  for (let s = openSec - back; s <= openSec + fwd; s++) {
    const p = prices.get(s * 1000) ?? null;
    if (p != null) present++;
    path.push(p);
  }
  const n = path.length;
  const cov = (a, b) => {
    let hit = 0, tot = 0;
    for (let s = a; s <= b; s++) { tot++; if (prices.get(s * 1000) != null) hit++; }
    return {hit, tot, frac: +(hit / Math.max(1, tot)).toFixed(4)};
  };
  return {
    path, // index 0 == openSec-back; index `back` == openSec
    coverage: {
      back600: cov(openSec - 600, openSec - 1),
      back300: cov(openSec - 300, openSec - 1),
      fwd60: cov(openSec, openSec + 60),
    },
    present, total: n,
  };
}

// Features visible at asOfSec (all source_ts <= asOfSec). Null-tolerant.
export function snapshotFeatures(prices, asOfSec) {
  const at = s => prices.get(s * 1000) ?? null;
  const last = at(asOfSec);
  const seq = [];
  for (let s = asOfSec - 60; s <= asOfSec; s++) seq.push(at(s));
  const present60 = seq.filter(v => v != null);
  const rets = [];
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] != null && seq[i - 1] != null && seq[i - 1]) rets.push(10000 * (seq[i] / seq[i - 1] - 1));
  }
  const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : null;
  const vol = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) : null;
  let flips = 0, prior = 0;
  for (const x of rets) { const d = Math.sign(x); if (d && prior && d !== prior) flips++; if (d) prior = d; }
  return {
    last,
    ret_5: bps(last, at(asOfSec - 5)),
    ret_15: bps(last, at(asOfSec - 15)),
    ret_30: bps(last, at(asOfSec - 30)),
    ret_60: bps(last, at(asOfSec - 60)),
    vol_60: vol == null ? null : +vol.toFixed(4),
    flips_60: rets.length ? flips : null,
    count_60: present60.length,
  };
}

// All 13 causal snapshots for one round open. Key: `T-<offset>s`.
export function buildSnapshots(openSec, prices, offsets = SNAPSHOT_OFFSETS_SEC) {
  const out = {};
  for (const k of offsets) out[`T-${k}s`] = snapshotFeatures(prices, openSec - k);
  return out;
}

// Most recent price at or before `sec` (scan back up to `lookback` seconds).
// Never reads forward: strictly past-only (open-boundary price excluded).
function lastAtOrBefore(prices, sec, lookback = 120) {
  for (let s = sec; s >= sec - lookback; s--) {
    const p = prices.get(s * 1000);
    if (p != null) return p;
  }
  return null;
}

// Longer market context, strictly past-only. priorDirs: array of 'UP'/'DOWN'
// for rounds strictly before this one (chronological).
export function longerContext(openSec, prices, priorDirs) {
  const at = s => prices.get(s * 1000) ?? null;
  const last = lastAtOrBefore(prices, openSec - 1);
  const win = minutes => {
    const seq = [];
    for (let s = openSec - minutes * 60; s <= openSec - 1; s++) seq.push(at(s));
    const vals = seq.filter(v => v != null);
    if (vals.length < 2) return {trend_bps: null, vol_bps: null, range_pos: null, n: vals.length};
    const hi = Math.max(...vals), lo = Math.min(...vals);
    const r = [];
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] != null && seq[i - 1] != null && seq[i - 1]) r.push(10000 * (seq[i] / seq[i - 1] - 1));
    }
    const mean = r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0;
    const vol = r.length > 1 ? Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length) : 0;
    const rp = (hi > lo && last != null) ? +((last - lo) / (hi - lo)).toFixed(4) : null;
    return {trend_bps: bps(last, vals[0]), vol_bps: +vol.toFixed(4), range_pos: rp, n: vals.length};
  };
  // Previous five one-minute paths: 60s return ending at each of T-1..T-5 min.
  const prevMinPaths = [];
  for (let m = 1; m <= 5; m++) prevMinPaths.push(bps(at(openSec - m * 60), at(openSec - (m + 1) * 60)));
  const last10 = priorDirs.slice(-10);
  let streak = 0;
  for (let i = priorDirs.length - 1; i >= 0; i--) {
    if (priorDirs.length && priorDirs[i] === priorDirs[priorDirs.length - 1]) streak++;
    else break;
  }
  let reversals = 0;
  for (let i = 1; i < last10.length; i++) if (last10[i] !== last10[i - 1]) reversals++;
  return {
    m5: win(5), m10: win(10), m15: win(15), m30: win(30),
    prev_5_minute_returns_bps: prevMinPaths,
    prev_10_dirs: last10,
    up_frac_10: last10.length ? +((last10.filter(d => d === 'UP').length / last10.length).toFixed(4)) : null,
    streak_before: streak,
    reversals_10: last10.length ? reversals : null,
  };
}
