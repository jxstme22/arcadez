# Data scale report — 2026-10-07T13:59:40.753Z (UTC)

> Harvest still running (background rounds/prices60/prices1 + parallel backfill
> agent). Numbers grow; store is source of truth. Layers never collapsed.

| Layer | n |
|---|---|
| Accessible BTC seconds (distinct price timestamps, 60s + 1s) | 3786 |
| — of which 60s grid | 3137 |
| — of which 1s densified | 661 |
| Historical BTC rounds discovered (venue 200) | 2395 |
| Rounds with existence evidence (venue-recorded) | 2395 |
| — of which on-chain spot-verified | 2 |
| Rounds with usable settlement labels (UP/DOWN) | 2390 (UP 1156 / DOWN 1234 / VOID 5) |
| Gap minutes (venue 404, excluded from labels) | 1356 |
| Rounds with complete T-300 context (grid minute-marks) | 1903 |
| Rounds with complete T-600 context (grid minute-marks) | 1902 |
| Rounds with complete T-300 context (exact-second) | 7 |
| Rounds with complete T-600 context (exact-second) | 2 |
| Context rows built (13 snapshots + 5/10/15/30m) | 2390 |
| Rounds with pool history (research-only, post-settlement) | 1809 (1809 obs) |
| Span | 2026-10-04T22:43:00.000Z .. 2026-10-07T13:13:00.000Z (3751 min) |

HTTP mix (all harvest requests): price60/200=2100, round/200=2114, round/404=1357.
Zero 429/403 observed to date.

Dataset class (size only, not quality): **DISCOVERY_ELIGIBLE**

FINAL-BLOCK-BEGIN
HISTORICAL_SECONDS=3786
ROUNDS_DISCOVERED=2395
ROUNDS_EXISTENCE_VERIFIED=2395
LABELLED_ROUNDS=2390
FULL_CONTEXT_300S=1903
FULL_CONTEXT_600S=1902
DATASET_CLASS=DISCOVERY_ELIGIBLE
FINAL-BLOCK-END
