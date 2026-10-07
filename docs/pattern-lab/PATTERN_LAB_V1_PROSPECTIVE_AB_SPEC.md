# Pattern Lab prospective A/B specification — SPEC ONLY, no execution (2026-10-07)

## Gates before any live A/B call

- `BUDGET_GUARD_AUDIT=PASS` (persistent DB reservation before every attempt; the
  345>330 anomaly root-caused and proven fixed).
- V2 dataset (≥2500 labels) + V2-majority methodology re-validation.
- Explicit human spend approval with per-arm/total caps.

## Arms (9 max: 3 evidence modes × 3 providers)

- A CONTROL: Jupiter live snapshot → provider (== P12 procedure, frozen).
- B PATTERN: snapshot + frozen `evidence-packet` (regime + neighbors, V2-selected config).
- C PATTERN+SCENARIOS: B + 1000 seeded empirical paths (summary stats only, never raw paths beyond size limits).

Providers: OpenAI Decisions, Jev, GLiDE — same thresholds (.57/.43), same deadlines,
same snapshot hashes across all 9 arms. No ensemble; no threshold tuning on A/B data.

## Readout

Paired accuracy/Brier lift of B−A and C−A per provider on pre-registered N (≥100 valid
rounds each); abstention-aware (coverage reported); VOID excluded; PnL NULL unless
payout verified by then. Stop rules: budget hit, WS outage, provider outage —
documented, never outcome-driven.
