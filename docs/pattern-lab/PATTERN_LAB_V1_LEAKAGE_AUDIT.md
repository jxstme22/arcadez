# Pattern Lab V1 leakage audit — 2026-10-07 (hostile, Session C)

Verdict: **LEAKAGE_AUDIT=PASS** (no material leakage; limitations stated).

- Split disjointness: PASS (no id in two sets).
- Chronology: PASS (train◁validation◁test by startMs).
- Neighbor index = TRAIN only; embargo `neighbor.ts < query.ts` enforced in code
  (`neighbors()` filter) + test (`future-neighbor rejection` green).
- Feature causality: `plfeatures.mjs` contains zero forward references (grep for
  `openSec+`, `t+60`, `future`, `forward`, `fill`: no matches); all lookups use
  `(openSec−d)` with past-only `priceAt`; venue open/close micros used ONLY for labels
  and magnitude research features of *prior* rounds, never the target.
- Continuation isolation: paths sampled post-hoc from matched labels; never enter vectors
  (build order: vec → splits → scenarios; verified by code path).
- Scaler/thresholds/centroids/tree: TRAIN-only (fit calls take train arrays; no val/test
  argument exists in those signatures).
- Session-B isolation: checkpoint SHA unchanged since creation; `var/history` never
  written by Session C (only readOnly opens + one VACUUM INTO at PL00).
- Known non-leak limitation: pool fields are post-settlement → permanently nulled for
  live use (present as nulls, cannot leak what is absent).
