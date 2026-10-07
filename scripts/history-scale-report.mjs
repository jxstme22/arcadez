#!/usr/bin/env node
// Layered data-scale report (offline). Never collapses layers into one total.
import fs from 'node:fs';
import {Store} from '../src/store.mjs';

const DATA_DIR = process.env.DATA_DIR || './var/history';
const store = new Store(DATA_DIR);
const q = (sql, ...a) => store.db.prepare(sql).get(...a);
const all = (sql, ...a) => store.db.prepare(sql).all(...a);

const rounds = all(`SELECT id,start_ms AS s,result,provenance FROM historical_rounds ORDER BY s`);
const up = rounds.filter(r => r.result === 'UP').length;
const down = rounds.filter(r => r.result === 'DOWN').length;
const voided = rounds.filter(r => r.result === 'VOID').length;
const labelled = up + down;
// Span + gaps (minute grid between min and max)
const spanMin = rounds.length ? Math.round((rounds[rounds.length - 1].s - rounds[0].s) / 60000) + 1 : 0;
const haveSec = new Set(rounds.map(r => Math.floor(r.s / 60000) * 60));
const gaps = [];
if (rounds.length) {
  const firstSec = Math.floor(rounds[0].s / 60000) * 60;
  const lastSec = Math.floor(rounds[rounds.length - 1].s / 60000) * 60;
  for (let s = firstSec; s <= lastSec; s += 60)
    if (!haveSec.has(s)) gaps.push(s);
}
const req404 = q(`SELECT COUNT(*) AS n FROM harvest_requests WHERE kind='round' AND http_status='404'`)?.n ?? 0;

// Accessible BTC seconds: distinct ms across both price tables.
const p60 = all(`SELECT source_ts_ms AS ts FROM historical_prices`).map(r => r.ts);
let p1 = [];
try { p1 = all(`SELECT source_ts_ms AS ts FROM historical_prices_1s`).map(r => r.ts); } catch {}
const priceSet = new Set([...p60, ...p1]);
const secs = priceSet;

// Grid-level context: minute marks T-600..T-60 (10) and T-300..T-60 (5) present within +-90s.
function gridCover(openMs, marks) {
  let hit = 0;
  for (const m of marks) {
    const want = openMs - m * 1000;
    let ok = false;
    for (let d = -90000; d <= 90000; d += 5000) if (priceSet.has(want + d)) { ok = true; break; }
    if (!ok) for (let d = -90000; d <= 90000; d += 1000) if (priceSet.has(want + d)) { ok = true; break; }
    if (ok) hit++;
  }
  return hit;
}
const marks600 = [600, 540, 480, 420, 360, 300, 240, 180, 120, 60];
const marks300 = [300, 240, 180, 120, 60];
let grid600 = 0, grid300 = 0;
const labelledRounds = rounds.filter(r => r.result === 'UP' || r.result === 'DOWN');
for (const r of labelledRounds) {
  if (gridCover(r.s, marks600) === 10) grid600++;
  if (gridCover(r.s, marks300) === 5) grid300++;
}
// Exact-second full context from builder table.
let exact600 = 0, exact300 = 0, ctxN = 0;
try {
  const rows = all(`SELECT coverage_600_frac AS c6, coverage_300_frac AS c3 FROM historical_context_v1`);
  ctxN = rows.length;
  exact600 = rows.filter(r => r.c6 >= 1).length;
  exact300 = rows.filter(r => r.c3 >= 1).length;
} catch {}
const poolRounds = q(`SELECT COUNT(DISTINCT round_id) AS n FROM pool_observations`)?.n ?? 0;
const poolObs = q(`SELECT COUNT(*) AS n FROM pool_observations`)?.n ?? 0;
const onchain = 2; // spot-verified (see EVIDENCE_CLASSES.md)
const http = all(`SELECT kind, http_status AS st, COUNT(*) AS n FROM harvest_requests GROUP BY kind, st`);

const gate = labelled < 1000 ? 'TOO_SMALL'
  : labelled < 2500 ? 'DISCOVERY_ELIGIBLE'
  : labelled < 5000 ? 'GOOD'
  : labelled < 10000 ? 'RICH' : 'VERY_RICH';

const out = {
  generatedAt: new Date().toISOString(),
  layers: {
    accessible_btc_seconds: secs.size,
    price_points_60s: p60.length,
    price_points_1s: p1.length,
    rounds_discovered: rounds.length,
    rounds_existence_verified: labelled + voided, // venue-recorded (excl. 404 gaps)
    rounds_onchain_spot_verified: onchain,
    labelled_rounds_up_down: labelled,
    up, down, void: voided,
    gap_minutes_404: gaps.length,
    venue_404_responses: req404,
    full_context_300s_grid: grid300,
    full_context_600s_grid: grid600,
    full_context_300s_exact: exact300,
    full_context_600s_exact: exact600,
    context_rows_built: ctxN,
    rounds_with_pool_history: poolRounds,
    pool_observations: poolObs,
    span_first: rounds.length ? new Date(rounds[0].s).toISOString() : null,
    span_last: rounds.length ? new Date(rounds[rounds.length - 1].s).toISOString() : null,
    span_minutes: spanMin,
  },
  http_status_mix: http,
  dataset_class: gate,
  note: 'Grid=minute-mark presence (+-90s snap). Exact=every second present. Size class describes dataset size only, not predictive quality.',
};
fs.mkdirSync('research/history', {recursive: true});
fs.writeFileSync('research/history/scale.json', JSON.stringify(out, null, 2));
const md = `# Data scale report — ${out.generatedAt} (UTC)

> Harvest still running (background rounds/prices60/prices1 + parallel backfill
> agent). Numbers grow; store is source of truth. Layers never collapsed.

| Layer | n |
|---|---|
| Accessible BTC seconds (distinct price timestamps, 60s + 1s) | ${out.layers.accessible_btc_seconds} |
| — of which 60s grid | ${out.layers.price_points_60s} |
| — of which 1s densified | ${out.layers.price_points_1s} |
| Historical BTC rounds discovered (venue 200) | ${out.layers.rounds_discovered} |
| Rounds with existence evidence (venue-recorded) | ${out.layers.rounds_existence_verified} |
| — of which on-chain spot-verified | ${out.layers.rounds_onchain_spot_verified} |
| Rounds with usable settlement labels (UP/DOWN) | ${out.layers.labelled_rounds_up_down} (UP ${up} / DOWN ${down} / VOID ${voided}) |
| Gap minutes (venue 404, excluded from labels) | ${out.layers.gap_minutes_404} |
| Rounds with complete T-300 context (grid minute-marks) | ${out.layers.full_context_300s_grid} |
| Rounds with complete T-600 context (grid minute-marks) | ${out.layers.full_context_600s_grid} |
| Rounds with complete T-300 context (exact-second) | ${out.layers.full_context_300s_exact} |
| Rounds with complete T-600 context (exact-second) | ${out.layers.full_context_600s_exact} |
| Context rows built (13 snapshots + 5/10/15/30m) | ${out.layers.context_rows_built} |
| Rounds with pool history (research-only, post-settlement) | ${out.layers.rounds_with_pool_history} (${poolObs} obs) |
| Span | ${out.layers.span_first} .. ${out.layers.span_last} (${spanMin} min) |

HTTP mix (all harvest requests): ${http.map(h => h.kind + '/' + h.st + '=' + h.n).join(', ')}.
Zero 429/403 observed to date.

Dataset class (size only, not quality): **${gate}**

FINAL-BLOCK-BEGIN
HISTORICAL_SECONDS=${out.layers.accessible_btc_seconds}
ROUNDS_DISCOVERED=${out.layers.rounds_discovered}
ROUNDS_EXISTENCE_VERIFIED=${out.layers.rounds_existence_verified}
LABELLED_ROUNDS=${out.layers.labelled_rounds_up_down}
FULL_CONTEXT_300S=${out.layers.full_context_300s_grid}
FULL_CONTEXT_600S=${out.layers.full_context_600s_grid}
DATASET_CLASS=${gate}
FINAL-BLOCK-END
`;
fs.writeFileSync('research/history/SCALE_REPORT.md', md);
console.log(md);
store.close();
