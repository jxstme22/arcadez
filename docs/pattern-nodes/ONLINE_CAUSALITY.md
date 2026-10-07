# Online causality — non-negotiable order, tested

BUILD (memory = nodes with open_ts < target) → MATCH → PREDICT → FREEZE
(pattern_predictions row with watermark_ms + frozen_ms) → SETTLE (read venue outcome
only now) → SCORE → INSERT observation (or reuse; idempotent) → UPDATE stats.
Invariants (regression-tested): prediction_node_watermark < target_round;
node_created <= scored; exactly-once (UNIQUE round,arm); target unavailable during
prediction (watermark filter); no post-cutoff pool/trade data in features (pools absent
by schema; trades unused historically).
