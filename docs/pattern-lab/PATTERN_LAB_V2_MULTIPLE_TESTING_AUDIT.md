# Pattern Lab V2 multiple-testing audit — 2026-10-07

Verdict: **MULTIPLE_TESTING_AUDIT=PASS** (search fully registered).

- V2-R registry: `research/pattern-lab/v2/experiment-registry.csv` (baselines, gate skip, 6 configs, freeze). TEST looks: 1.
- V2-M registry: ranking table in `research/pattern-lab/v2/m/TEST_FREEZE.md` (6 scored, 0 eligible). TEST looks: 0 (no selection → no evaluation).
- V2-M search size: 1 set × 1 horizon × 6 configs × fixed seeds; no K expansion, no metric shopping (order predeclared).
- Unseen-transfer + survival + growth analyses are descriptive diagnostics on frozen configs, not selection events (logged as such; they cannot promote a configuration).
- Best-validation numbers (quantile18 0.519 V1 / V2-R equivalent) within noise of chance given 6+ looks — stated, not hidden.
