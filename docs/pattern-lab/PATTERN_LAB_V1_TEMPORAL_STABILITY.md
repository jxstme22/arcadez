# Pattern Lab V1 temporal stability — 2026-10-07

TEST base UP rate by quarter: 0.524 / 0.429 / 0.452 / 0.512 — the target itself drifts
across the 58h window, so fixed-threshold regime rules face a moving base rate.

- Regime stability matrix: `data/reports/pattern-lab-v1-stability.csv` (TRAIN vs
  VALIDATION direction + support class per regime). No regime reached STABLE with
  HIGH support; most are WEAKLY_STABLE/UNSTABLE/INSUFFICIENT.
- NN-25 TEST: 196 acted, acc 0.4949 — no persistence signal.
- Scenario mean up-frequency ≈ 0.47 ≈ contemporaneous base — conditioning adds nothing.
- Walk-forward: not run as separate selection (single chronological split is the
  frozen design; blocks above show drift directly). V2 with more data should add
  rolling-origin evaluation.
- Sample-size note: max TRAIN regime support 346 (one quantile regime); the 5 STABLE
  regimes all track the base rate (train UP 0.38–0.52, validation same direction,
  no deviation) — stability without edge. V2 needs Session-B 2500–5000+ plus deviation
  magnitude, not just direction preservation, in the stability bar.
