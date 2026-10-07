# Pattern Nodes V1 build report — 2026-10-07 (offline replay; NOT live shadow)

## What was built

- Node store (`src/nodes.mjs`, separate `var/pattern-nodes/nodes.db`): 2066 immutable
  observation nodes seeded from the frozen V2 checkpoint (498 pre-price rows excluded
  by coverage gate, none invented); quantile + k-means pattern families; membership,
  novelty buffer (124 OOD nodes, no auto-promotion), predictions (UNIQUE round,arm),
  results, watermarks, library versions.
- Frozen policy module (`src/nodepolicy.mjs`, Runtime v1.0): gates, freshness/drift/OOD,
  lifecycle retire/reactivate, .55/.45 decisions.
- Online replay (`scripts/replay-nodes.mjs`): 1566 streamed rounds with hard watermark
  (memory = nodes with open_ts < target only), freeze→settle→score→insert order.
- Results: A alwaysUP 760/1566 (0.485); B pattern 36/86 (0.419, 124 OOD + 1356 abstain
  skips); H hybrid 337/638 (0.529); NN-25 410/760 (0.5395, 95% CI [0.504,0.575]).
- Determinism: independent re-run byte-identical prediction SHA; resume adds zero rows
  (UNIQUE constraint + regression test). Two self-found bugs fixed openly (pid slice
  off-by-one; missing UNIQUE index).
- Verdict: PIPELINE VALIDATED; performance hypothesis-generating only (single replay,
  methods predeclared; NN/H observed post-hoc). Consistent with V1/V2 nulls.
  No edge claimed. No live shadow started (that needs an explicit go + live funding
  of attention, not money — $0 inference regardless).

## Live readiness gaps (honest)

- Live loop (collector → snapshot → predict → settle → insert) not yet wired end-to-end;
  replay proves the algorithm, not the plumbing. VPS undeployed (plan only).
- Slow loop (+250 batches) and novelty promotion never triggered (buffer 124 < 100? No:
  124 ≥ 100 candidate bar — promotion requires ≥50 mutually-similar + validation;
  deferred to slow-loop build, documented).
- 1s live features (returns_1s etc.) have no historical counterpart — Nodes V1 uses
  minute-grid features; live vector work remains.

## Files

`src/{nodes,nodepolicy}.mjs`, `scripts/{seed-nodes,replay-nodes,pattern-status}.mjs`,
`tests/nodes.test.mjs` (9 tests), `docs/pattern-nodes/` (8 docs), `npm run pattern:status`,
dashboard Pattern Nodes card.

```text
PATTERN_NODES_VERSION=V1
HISTORICAL_OBSERVATION_NODES=2066
PATTERN_NODES=2
ACTIVE_PATTERN_NODES=2
NOVELTY_BUFFER=124
RECENT_50=PASS
RECENT_100=PASS
RECENT_250=PASS
RECENT_500=PASS
RECENT_1000=PASS
FRESHNESS_ENGINE=PASS
DRIFT_ENGINE=PASS
OOD_ENGINE=PASS
NEIGHBOR_ENGINE=PASS
SCENARIO_ENGINE=PASS
ONLINE_REPLAY=PASS
CAUSALITY_AUDIT=PASS
EXACTLY_ONCE_NODE_INSERTION=PASS
PAPER_RUNNER=PASS
VPS_READY=NO
PAID_MODEL_CALLS=0
REAL_TRADES=0
PATTERN_NODES_LIVE_SHADOW_READY=NO
```
