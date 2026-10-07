# Historical provenance — 2026-10-07

Classes (never mixed silently):

- `VENUE_RECORDED`: single-round GET `/play/rounds/BTC/{openTs}` returned a settled round
  with venue `openPrice/closePrice` micro + `outcome`. Label = venue outcome cross-checked
  against exact micro price direction (56/56 + 120/120 match; mismatch would be rejected).
  Stored in `historical_rounds`. This is the ONLY label-bearing class.
- `HISTORICAL_BACKFILL`: timestamp price GET `/price/crypto/btcusdt?timestamp={sec}`.
  Stored in `historical_prices`. NEVER enters live features; round labels are never
  derived from this table.
- `ROUND_EXISTENCE_INFERRED`: reserved for minutes where no venue record was retrieved.
  NO rows are synthesized — gaps stay gaps (this harvest: 0 missing of 120).
- `LIVE_CAPTURED` / `SOURCE_REPRODUCED` / `UNVERIFIED`: defined, unused in this dataset.

Dataset v1 (`research/history/manifest.json`): 2026-10-07T02:48Z..04:48Z, 120/120 venue
rounds (62 UP / 58 DOWN), 120/120 prices, isolated in `var/history` (live `rounds` table
holds 0 rows there). A BTC price timestamp is NOT round existence — only venue records
create labels. Chronological splits must be by `start_ms`; pattern thresholds fit on
TRAIN only.
