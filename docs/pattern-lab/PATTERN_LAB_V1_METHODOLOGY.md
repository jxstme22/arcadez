# Pattern Lab V1 methodology — frozen 2026-10-07 (Session C)

## Data

Checkpoint `var/pattern-lab/v1/source/history-checkpoint.db` (VACUUM INTO, SHA-pinned,
immutable). Eligibility (pre-registered): VENUE_RECORDED UP/DOWN + micro-agreement +
≥10 prior 60s prices + complete FULL_CLEAN vector → **1677 rows** (626 pre-price era,
2 incomplete, 4 VOID accounting). Grid reality: ~60s price sampling → sub-minute
features UNRESOLVABLE by construction (listed in missing[], never imputed).

## Features

`src/plfeatures.mjs` (`pl-features-v1`): past-only minute-grid vectors; 5 predeclared
sets; redundancy audit on TRAIN dropped `momentum_change_15_60` (|r|>0.95). Pool/trade/
sub-minute fields permanently null with reasons. Primary horizon T-60 (T-120/T-300
supported, untested dimension).

## Splits / fitting discipline

Chronological 60/20/20 (1006/335/336), disjoint, frozen manifests. Scalers, quantile
thresholds, centroids, tree partitions fit on TRAIN only. One TEST look.

## Methods

quantile-18 grid, k-means {8,16,24,32} (seed 726), depth-2 tree leaves, kNN-25,
seeded scenario sampling (100–1000), Wilson CIs, min-support gate n≥50 (train).

## Known limitation (for V2)

TEST-freeze selection used validation *majority-vote* accuracy while TEST evaluation
used the frozen .57/.43 *threshold* policy — a metric mismatch. It did not affect
honesty (TEST executed once, results vacuous: 0 acted) but V2 should select and
evaluate under one identical decision rule. K=48/64 skipped by support gate (logged).

## Verdict logic (PL24)

NO_SIGNAL unless a method beats baselines on TEST with support, stability, and
calibration jointly credible. Result: NO_SIGNAL (see V1 report).
