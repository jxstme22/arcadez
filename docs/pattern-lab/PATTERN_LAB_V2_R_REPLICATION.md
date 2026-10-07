# Pattern Lab V2-R strict replication — 2026-10-07

One change vs V1: MORE DATA (2066 eligible vs 1677). Methodology identical
(same engine, sets, K grid, seeds, support gates, selection mismatch preserved).

- Splits: 1239/413/414 chronological, disjoint (`var/pattern-lab/v2/r/splits/`).
- Redundancy: same single drop (`momentum_change_15_60`); 19 kept cols.
- Selection (V1 rule): quantile18 the only config passing min-train-support (k-means
  filtered again — the rule working as designed, not a failure to report).
- TEST: 0/414 acted, Brier 0.2487, base 0.4662. Replay deterministic.
- NN-25 TEST: 201 acted, acc 0.4577, Brier 0.2728.
- Scenarios: mean up-frequency ≈ base (≈0.495 at 1000).
- Extension (spec R06): n=0 — V2 round range adds no rows strictly after V1 max
  (growth came from historical depth). Documented, not worked around.
- Supplement (labeled R06-SUPPLEMENT, unseen-by-V1 n=389): regime 0 acted;
  kNN scored 154 (235 too old for any past index row — correct embargo), acted 89,
  acc 0.4831, Brier 0.2772.

Verdict: **V2_R_NULL_REPLICATED**.
