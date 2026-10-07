# PL01 eligibility policy — written BEFORE any predictive result (2026-10-07)

## PRIMARY (trains, validates, tests)

- BTC only; class VENUE_RECORDED with result UP/DOWN.
- Micro price direction agrees with venue outcome (mismatch → excluded + counted).
- ≥6 consecutive 60s price observations before open (feature coverage gate).
- No unresolved severe gap: max source gap in [open-300s, open] ≤ 180s, else row flagged
  `GAP_EXCLUDED` (kept in matrix with eligibility=false, never silently dropped).

## SECONDARY sensitivity only

- `VENUE_RECORDED_VOID` rounds: VOID-rate accounting, never binary labels.
- GAP_EXCLUDED rows: reported separately.

## EXCLUDED

- `ROUND_EXISTENCE_INFERRED` (none synthesized — no such rows exist).
- Any row failing coverage; any non-BTC row.

## Forbidden exclusions

Difficulty, move size, regime membership, model error. Exclusions are technical only,
logged with counts before/after.
