# V2-M preregistration — written BEFORE any V2-M validation selection (2026-10-07)

## Scope

Correct ONLY the V1 selection/evaluation mismatch. Nothing else changes.

## Allowed

- Feature engine: `plfeatures` FULL_CLEAN + redundancy-dropped set (same as V2-R).
- Eligibility, splits (V2-R frozen 1239/413/414), horizons: T-60 only.
- Candidates: quantile18, kmeans{8,16,24,32} (seed 726), treeLeaves. No K=48/64 (gate).
- Support gates: min TRAIN regime n≥50 (same as V1 rule). Stability: informational only.

## Probability construction (pre-existing, no invention)

- Regime methods: p = TRAIN regime UP rate (majority class rate, as V1).
- kNN/scenarios: NOT candidates for selection (no V1 probability construction for
  thresholded comparison beyond NN-25 research track; keep them out of ranking).

## Decision thresholds (frozen project policy, unoptimized)

- p ≥ 0.57 → UP; p ≤ 0.43 → DOWN; else ABSTAIN.

## Validation selection metric (fixed order)

1. Lowest VALIDATION Brier across all eligible validation rows.
2. Higher VALIDATION balanced accuracy under frozen thresholds.
3. Higher VALIDATION acted coverage.
4. Lower complexity (fewer regimes).
5. Lexical experiment ID tie-break.

## Candidate eligibility for ranking

- Min TRAIN support ≥50 per counted regime (same rule).
- ≥20 acted VALIDATION predictions, else INSUFFICIENT_VALIDATION_COVERAGE (unranked).

## Final TEST metrics

Coverage, acted, accuracy, balanced accuracy, Brier, calibration note, base lift, CIs.

## Hash

Recorded at freeze time in `research/pattern-lab/v2/m/TEST_FREEZE.md` (this file's own
SHA pinned there). This file MUST NOT change after selection begins.

```text
PREREG_VERSION=v2m-20261007
```
