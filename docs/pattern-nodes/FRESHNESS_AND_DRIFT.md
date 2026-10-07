# Freshness + drift — deterministic rules, replay-measured

Freshness compares recent-250 UP rate vs all-history rate for the same pattern:
<=0.04 FRESH, <=0.08 WATCH, <=0.15 DEGRADED, else STALE; <10 recent → INSUFFICIENT.
Drift: centroid distance (standardized) >1.0 or outcome dev >0.15 → HIGH.
Replay outcome: grid patterns all FRESH (dev <=0.04) — stable base-rate trackers;
124 OOD skips fed the novelty buffer (no promotion — below candidate bar).
Freshness-gated performance: B arm never reached DEGRADED-gated rounds (0 fresh-skips);
freshness usefulness itself remains untested (requires degraded episodes).
