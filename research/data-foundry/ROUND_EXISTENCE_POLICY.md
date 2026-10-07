# Round existence policy — 2026-10-07 (binding for all dataset builds)

A BTC price timestamp is NEVER proof an Arcade round existed. Training labels are
admitted ONLY under the policy below. Gaps stay gaps; nothing is synthesized.

| Class | Meaning | Admitted as label? | Current use |
|---|---|---|---|
| `ROUND_DIRECTLY_OBSERVED` | seen live via `/rounds/current` or WS-era capture with receipt timestamps | YES | live collector path (`rounds` table) |
| `ROUND_API_RECORDED` | single-round GET returned settled round + outcome cross-checked vs micro prices | YES | `historical_rounds` (`VENUE_RECORDED` provenance) |
| `ROUND_ONCHAIN_EVIDENCED` | round account/settlement inspected read-only on-chain | YES (when implemented) | unused — future work, read-only only |
| `ROUND_PROGRAM_CONTINUITY_INFERRED` | minute grid slot between two API-recorded rounds, no direct record | NO (tracked as gap) | missing-list in harvest manifest |
| `ROUND_EXISTENCE_UNPROVEN` | any other minute | NO | excluded |

## Label provenance (stored per row, never merged)

- `VENUE_RECORDED`: venue outcome + micro prices agree (120/120 + 56/56 observed).
- `VENUE_RECORDED_ONCHAIN_VERIFIED`: reserved; requires claim/settlement inspection.
- `SOURCE_REPRODUCED` / `SETTLEMENT_SOURCE_DERIVED` / `UNVERIFIED`: defined, unused;
  any future derived label must carry one of these, never VENUE_*.

## Enforcement

- `normalizeRound` returns null on outcome/price mismatch (fail closed).
- `saveHistoricalRound` writes only venue-shaped rows; harvest records misses, never fills.
- Live `rounds` and `historical_rounds` are separate tables; `featuresAsOf` accepts only
  `LIVE_RECEIVED_WS` ticks; `buildVectors` accepts only `historical_*` tables.
