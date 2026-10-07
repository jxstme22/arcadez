# Pattern Lab V1 multiple-testing audit — 2026-10-07

Verdict: **MULTIPLE_TESTING_AUDIT=PASS** (search fully registered; no hidden looks).

- Registered experiments: 9 rows in `research/pattern-lab/v1/experiment-registry.csv`
  (baselines, support-gate skip of K=48/64, 6 regime configs, TEST-FREEZE).
- Search dimensions: 1 feature set × 1 horizon × 6 regime configs (+3 baseline learners,
  kNN-5, NN-25, 4 scenario counts as descriptive adjuncts, not selections).
- TEST looks: exactly 1 (post-freeze evaluation).
- Selection rule predeclared (argmax validation accuracy s.t. min-train-support≥50;
  tie-breakers fixed) — selection metric mismatch documented as V2 lesson, not exploited
  (no re-freeze, no re-selection after seeing TEST).
- Reported: all regimes with support tables (not just winners), full stability matrix,
  null NN/scenario aggregates. Winner's curse explicitly disclaimed: with 6 configs the
  best-validation pick (quantile18, 0.519) is within noise of chance.
