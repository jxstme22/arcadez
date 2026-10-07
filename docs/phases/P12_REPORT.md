# P12 report — 100 prospective BTC rounds, 2026-10-07 (P12v1, frozen)

Gate: **P12_100_ROUNDS=PASS** (100 unique valid future rounds; hostile audits PASS; freeze intact).

## Run

- Approved caps 330/110; runner attempted 345 (115/arm) with zero DISABLED rows — open
  spend-side anomaly (see freeze-integrity audit; impact ≤15 extra calls, no data bias).
  Persistent DB-ledger guard added for future runs. Actual: 345 attempts, all prospective.
- 100 counted rounds (55 UP / 45 DOWN), consecutive grid minus one 120s gap (missed round, documented).
- Evidence (frozen, not rewritten post-hoc): `data/reports/p12-100-rounds.json`,
  `p12-provider-comparison.csv`, `p12-calibration.csv`, `p12-disagreements.csv`,
  `p12-baselines.csv`; live DB `var/p12-live`.

## Per-provider (eligible 100; 0 late)

| Arm | Valid | Acted (UP/DOWN) | W/L | Acc | BalAcc | Brier | LogLoss | pUp mean | lat p50/p90/p99 |
|---|---|---|---|---|---|---|---|---|---|
| OpenAI | 19 | 0 (0/0) | — | — | — | 0.2500 | 0.6932 | 0.499 | 561/897/1635 ms |
| Jev | 100 | 0 (0/0) | — | — | — | 0.2515 | 0.6961 | 0.488 | 535/810/1357 ms |
| GLiDE | 100 | 85 (74/11) | 42/43 | 0.4941 | 0.4544 | 0.2965 | 0.8016 | 0.662 | 2624/3168/4371 ms |

- OpenAI: 81× HTTP 429 (provider throttling; isolated to OpenAI, zero-retry policy held) + 19 OK, all p≈0.5 → 100 SKIP.
- Jev: 100 OK, p ∈ [0.46,0.52] → 100 SKIP. OpenAI==Jev agreement 100/100 (all abstain).
- GLiDE: sole actor (85/100; 15 all-abstain rounds). Bullish bias (UP 87% of actions vs 55% base rate). 0.70+ bucket: 59 rounds at 0.508 realized — overconfident, no calibration signal. DOWN-side 3/11.
- Baselines: alwaysUP 55, alwaysDOWN 45, prevCont 46/99, prevRev 53/99, mom5 48/99, mom15 48/99, mom60 43/97, p50/SKIP 0 acted. Best: alwaysUP 0.55. Nothing actionable; n=100, preliminary only.

## Classification

**NO_DETECTABLE_SIGNAL** — no arm beats alwaysUP; GLiDE Brier/logloss worse than constant-0.5; both other arms abstain entirely. Not evidence of inability, only of no measured edge in this sample under frozen policy.

## Spend

345 attempts (≈330 planned + 15 anomaly). Tokens: OpenAI ~15.6k in (~$0.0016); Jev ~85.9k in/2.9k out; GLiDE ~140.5k in/28k out (USD unknown). PnL NULL.
