# Session B maximum-harvest status — 2026-10-07 ~14:05 UTC

Owner: Session B (historical Data Foundry). Areas: `var/history/`,
`research/history/*` (except P13 `manifest.json` v1 window — left intact),
`scripts/history-*.mjs`, `scripts/build-history-context.mjs`,
`scripts/history-scale-report.mjs`, `src/history_rich.mjs`,
`tests/history-rich.test.mjs`.

## Required outputs (all created)

| Req | Artifact |
|---|---|
| A retention | `research/history/PRICE_RETENTION.md` + `price-retention.json` (merged exponential + binary search + determinism) |
| B harvest | `scripts/history-max-harvest.mjs` (rounds/prices60/prices1/forward fills; per-request evidence in `harvest_requests`; `INSERT OR IGNORE` cache; backoff; resume via `research/history/checkpoint-max.json`, section-atomic) |
| C round routes | `research/history/ROUND_API_MATRIX.md` + `round-matrix-raw.json` |
| D frontend | Same matrix §frontend (entry `/prediction/arcade`, chunk SHAs, exact `ROUTES` construction, last-5-PAST rail, per-wallet history, unprobed `api.jup.ag` base) |
| E on-chain | `research/history/onchain/*.json` + classes in `EVIDENCE_CLASSES.md` |
| F label policy | `research/history/EVIDENCE_CLASSES.md` |
| G rich context | `src/history_rich.mjs` `contextPath` (T-600..T+60, no interpolation) + `historical_context_v1` table |
| H snapshots | `buildSnapshots` at T-60..T-1, past-only (poisoning-tested) |
| I longer context | `longerContext` (5/10/15/30m trend/vol/range-pos, 5 prior minute paths, 10 prev dirs, streaks, reversals) |
| J scale | `research/history/SCALE_REPORT.md` + `scale.json` (layered, never collapsed) |
| K max rule | Background harvests running toward floor (below); stops only at floor coverage or 429/403 blocker |
| L gate | Scale report FINAL block (`HISTORICAL_SECONDS/ROUNDS_DISCOVERED/ROUNDS_EXISTENCE_VERIFIED/LABELLED_ROUNDS/FULL_CONTEXT_300S/FULL_CONTEXT_600S/DATASET_CLASS`) |

## Live processes (do not kill — Session B harvest chain)

- `node scripts/history-max-harvest.mjs rounds --max-requests 14000` (2.2s spacing, from Oct-04 frontier backward to Sep-25 floor)
- `node scripts/history-max-harvest.mjs prices60 --max-requests 14000` (same, Sep-07 floor)
- Parallel older chain: `harvest-history.mjs` backfill-3/4 windows (separate manifests)
- Logs: `var/agent-logs/maxharvest-{rounds,prices60,prices1}.log`

## Continue / resume

```bash
cd /Users/welly/arcadez
tail -2 var/agent-logs/maxharvest-rounds.log var/agent-logs/maxharvest-prices60.log
cat research/history/checkpoint-max.json
# If a harvester exited (floor reached or blocker), resume is automatic:
SPACING_MS=2200 DATA_DIR=./var/history node scripts/history-max-harvest.mjs rounds --max-requests 14000
SPACING_MS=2200 DATA_DIR=./var/history node scripts/history-max-harvest.mjs prices60 --max-requests 14000
# Then rebuild offline artifacts (no network):
node scripts/build-history-context.mjs
node scripts/history-scale-report.mjs
npm test  # expect all pass
```

## Known state / next

- 2390 labels at 14:10 UTC re-verification (DISCOVERY_ELIGIBLE; GOOD at 2500). Sparse 404 region 10-04..10-06 (~50% miss) slows rounds; prices60 clean.
- Full-retention 1s densification (~1M secs) infeasible at 0.45 GET/s — needs a sampling strategy (e.g. densify stratified round subset) before Pattern Lab RICH work.
- P13 `manifest.json` (120-round v1) intentionally untouched; `scale.json` is the growing inventory. DATASET-JUPITER-V2 merge still future per SESSION_COORDINATION.
