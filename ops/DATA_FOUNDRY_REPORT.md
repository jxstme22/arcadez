# Data Foundry report — DRAFT (collection in progress, 2026-10-07)

## Interim status (updated during run; final numbers at freeze)

- H00 contracts revalidated (openapi byte-identical); candles params unknown; trades WS newly verified (aggregate-only).
- Live capture: background `capture 360` → `var/` (rounds/ticks/rawTicks/sessions/poolObs/stateObs accumulating; see `npm run harvest:status`).
- Backfills: 4 sequential 2h passes (5h→11h back) → `var/history`, manifests `research/history/manifest-{1..4}.json`.
- History baseline: 120 VENUE_RECORDED (62 UP/58 DOWN) + prices; retention observed: rounds (18h,24h], prices (28d,30d].
- Pattern discovery on baseline: INSUFFICIENT_SAMPLE (gated regimes 0).
- Audit script: `scripts/audit-dataset.mjs` (0 findings on baseline; rerun at freeze).
- Replay: snapshot parity (`npm run replay`) + order-independent tape/feature tests.
- PnL NULL; no model calls by foundry work (P11C runs separately in `var/p11-live`).

Final verdict/hashes written only at H17 freeze (requires ≥1000 labeled rounds).
