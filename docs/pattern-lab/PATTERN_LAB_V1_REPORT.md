# Pattern Lab V1 report — 2026-10-07 (Session C, $0 inference, no P12 tuning)

## Data

Frozen checkpoint: 2309 rounds (2298 VENUE_RECORDED labels + 4 VOID), 2716 prices.
Eligible after pre-registered gates: **1677** (626 pre-price era, 2 incomplete).
Splits: train 1006 / validation 335 / test 336, chronological, disjoint, frozen.
Test base UP rate: 0.4792 (quarter blocks 0.52/0.43/0.45/0.51 — drifting base).

## Baselines (TEST)

alwaysUP 0.4792 / alwaysDOWN 0.5208 / prevCont 0.5089 / prevRev 0.4911 /
sign(ret_60) 0.5208 / sign(ret_300) 0.50 / sign(ret_600) 0.5298 /
logistic 0.5078 (Brier 0.2563) / tree 0.5217 (0.2578) / kNN-5 0.4940 (0.3102).
Instructive overfit collapse: kNN-5 TRAIN 0.7038 → TEST 0.4940; tree 0.6408 → 0.5217 —
exactly why chronological discipline is non-negotiable. Full:
`data/reports/pattern-lab-v1-baselines.csv`.

## Regimes

6 configs (quantile-18, k-means 8/16/24/32 seeded, tree leaves); K=48/64 skipped by
support gate (logged). Selection (predeclared): quantile18 (val 0.519).
Support: max train 346; stability 5 STABLE / 13 WEAKLY_STABLE / 34 UNSTABLE /
35 INSUFFICIENT — and every STABLE regime merely tracks the base rate (0.38–0.52).

## Untouched TEST (frozen .57/.43 policy)

- Regime vote: **0 acted / 336** (rates never cross thresholds), Brier 0.2489.
- NN-25: 196 acted, acc **0.4949**, Brier 0.2749.
- Scenarios 100/250/500/1000: mean up-frequency ≈ 0.47 ≈ base; ESS = unique sources
  (reported per row in `p12-scenarios.csv` analogue `pattern-lab-v1-scenarios.csv`).
- Replay deterministic: true (identical re-run).

## Verdict

**PATTERN_LAB_V1_NO_SIGNAL** — no method beats simple baselines on TEST; regime
probabilities never reach actionable confidence; NN/scenarios reproduce the base rate.
This is a successful null result on n=1677 with a frozen, audited pipeline. The only
scaling path is more data (Session B → V2), not looser gates.

## Artifacts

Methodology, leakage + multiple-testing + stability audits, AB spec, library
(`research/pattern-lab/library/v1/`, hashes.txt), 7 data reports, replay-verified code.
No P12 outcomes used anywhere in V1 (P12 never read by this session).
