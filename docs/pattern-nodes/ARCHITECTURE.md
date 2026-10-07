# Pattern Nodes V1 architecture — 2026-10-07

Two node types in `var/pattern-nodes/nodes.db` (SQLite, WAL): immutable
`observation_nodes` (one per settled round, INSERT OR IGNORE on round_id) and
evolving `pattern_nodes` (quantile grid + k-means-16 seed families, v1.0).
Memory (node rows) updates every round; algorithm (`src/nodepolicy.mjs` v1.0)
changes only via version bump. Replay (`scripts/replay-nodes.mjs`) walks
chronologically with a hard watermark (nodes with open_ts < target only):
BUILD → MATCH → PREDICT → FREEZE → SETTLE → SCORE → INSERT → UPDATE.
Paper arms: A=alwaysUP (control), B=pattern+gates, H=hybrid(pattern+NN),
NN=nearest-25. No paid models. Replay result: A 760/1566 (0.485), B 86→36/86
(0.419), H 337/638 (0.528), NN 410/760 (0.5395, 95% CI [0.504,0.575] —
hypothesis-generating only, NOT a signal claim).
