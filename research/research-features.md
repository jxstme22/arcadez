# Feature Research: what actually predicts 60s BTC direction?

**Date:** 2026-10-08 · **Researcher:** subagent (ML feature analysis)
**Dataset:** 154 labeled historical rounds, `workspace/arcadez/var/history/arcade.sqlite`
(72 DOWN / 82 UP, base rate **53.2% UP**). All features use only past rounds (causal).
**Protocol:** expanding walk-forward (train on rounds 0..i-1, predict i, min 40 train) unless noted.
95% confidence intervals shown everywhere.

## TL;DR

**Nothing beats the base rate.** No single feature, no feature pair, and no model
(logistic, kNN) produces a statistically defensible edge over blind UP-betting.
The honest ranking of "models" on this data:

| Model | Accuracy | 95% CI | n |
|---|---|---|---|
| always-UP (trivial baseline) | **56.1%** | ±8.9% | 114 |
| logistic, all 21 features (walk-forward) | 50.9% | ±9.2% | 114 |
| kNN-15, all features | 51.9% | ±13.3% | 54 |
| best single feature (lag1×lag2 sign) | 58.8% | ±9.0% | 114 |
| momentum (bet with last round) | 51.8% | ±9.2% | 114 |
| fade (bet against last round) | 48.2% | ±9.2% | 114 |

The 64.8% logistic score on one chronological split did **not** survive walk-forward
(50.9%) — it was split luck + overfit, confirmed by the failure of all feature subsets.

## 1. Single-feature ranking (walk-forward, n=114)

"Sign rule" = predict UP if feature > 0. For always-positive features (base rates,
volatilities) the sign rule trivially reduces to always-UP — those rows are the
base rate wearing a costume, not signal.

| Feature | Meaning | Sign rule | Tuned thresh. |
|---|---|---|---|
| lag1×lag2 | last two rounds same direction? | **58.8% ±9.0%** | 56.1% |
| pos10 | last close position in 10-round range | 57.1% ±9.5% | 53.5% |
| lag3 | return 3 rounds ago | 53.5% ±9.2% | 52.6% |
| lag1 | last round return (momentum) | 51.8% ±9.2% | 46.5% |
| lag10 | return 10 rounds ago | 51.8% ±9.2% | 48.2% |
| lag2 | return 2 rounds ago | 50.9% ±9.2% | 49.1% |
| streak | signed current run length | 51.8% ±9.2% | 45.6% |
| lag5 | return 5 rounds ago | 45.6% ±9.1% | 52.6% |
| rsi5 | 5-round RSI | (→UP) 56.1% | 49.1% |

Every signed feature's CI comfortably includes 50%. Tuned thresholds do **worse**
than the naive sign — textbook overfitting to the training window.
Autocorrelations of outcomes: lag1 +0.07, lag2 −0.02, lag3 +0.02, lag5 −0.11 —
all noise.

## 2. Feature interactions (pairs, logistic, n=54 holdout)

Top pairs hit **63.0%** (vol5+lag1×lag2, streak+base20, …). This looks exciting
until you correct for multiple comparisons: with 210 pairs tested, pure noise is
*expected* to produce a max around 70%. Our 63% is **below** the noise ceiling —
no pair survives the correction. The bottom pairs (38–41%) confirm the spread is
just sampling variance.

## 3. Is it the features or the model?

Both, but mostly the features:

- **kNN-15: 51.9%** — the model class used in doors-v3. Confirms the parent's
  finding: kNN on these features is a coin flip. kNN is the wrong tool here
  (distance in 14-dim noise space ≈ random neighbor selection).
- **Logistic-21: 50.9% walk-forward** — the *best* model class still finds
  nothing under honest evaluation. A better model cannot rescue empty features.
- The single-split 64.8% (permutation p=0.01) was a mirage: it collapses under
  walk-forward and under any feature subset (base20+vol20 → 50.0%,
  base20+vol20+lag1×lag2 → 51.9%).

Verdict: **the features carry no robust signal; the model choice is secondary.**

## 4. What could NOT be tested (data gap — important)

The 500-point price grid covers **Oct 3**, while the 154 labeled rounds are
**Oct 1–2** — zero overlap. The live tick stream covers only ~9 minutes.
Therefore these were untestable on labeled rounds:

- tick direction persistence / 5-tick vote (the competitor's Vo leg)
- realized volatility over 1s/5s windows
- price position within the *trailing hour* (only coarse round-level proxy tested: dead)
- pool imbalance / order flow

Notably, on the 500-bar grid itself (different window, n≈499, proxy only):
momentum 54.2% ±4.4%, and price-near-30-bar-high → 58.9% UP vs near-low → 41.9% UP.
Suggestive of trend persistence, but it does not transfer to the labeled rounds
and cannot be traded without overlapping data.

## 5. Caveats

- **Causality:** round i−1's label is known only at round i's open; a live decision
  ~6s before open cannot use it. Excluding all lag1-derived features, logistic
  still scores 59.3% ±13.1% on one split — within noise, same conclusion.
- Rounds are patchy (median gap 2 min, max 23 min), not consecutive.
- n=154 is small; CIs are wide (±9%). A true 55–57% edge could hide in the noise —
  but nothing in this analysis points at where.

## 6. Recommendation

**There is no simple model here that beats 55%.** Do not ship any of these features
as a strategy. The strongest "model" in the data remains always-UP at 53.2%.

If the goal is a real edge, the path is not more round-level features — it is
**data**: collect 1-second bars for 30–60 minutes before *each* labeled round, then
test the microstructure features (Vo-style tick vote, tick persistence, realized
vol, range position on real prices, pool imbalance). That is the experiment that
can actually answer whether the competitor's 55–65% claim replicates. Until that
data exists, any doors/ML benchmark on round-level fingerprints is measuring noise.

**Scripts:** `extra-benchmarks/feat_research.py` (main suite),
`extra-benchmarks/feat_permtest.py` (permutation test).
