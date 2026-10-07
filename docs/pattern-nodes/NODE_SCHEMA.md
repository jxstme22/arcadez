# Node schema (`src/nodes.mjs`, NODE_SCHEMA_VERSION nodes-v1-20261007)

observation_nodes(node_id PK, round_id UNIQUE, open_ts, close_ts, features JSON(24 FULL_CLEAN numerics),
outcome, move_bps, quality JSON, provenance, schema_version, created_ms, sha).
pattern_nodes(pattern_id PK, version, kind, definition JSON, centroid JSON, support_total, up_total,
status, created_ms, sha). Statuses: ACTIVE_CANDIDATE/ACTIVE/WATCH/DEGRADED/RETIRED (status only; history never deleted).
node_pattern_membership(obs_node_id, pattern_id, distance) PK both. novelty_buffer(node_id PK, added_ms, reason):
OOD nodes accumulate, NO auto-promotion (124 buffered in replay). pattern_predictions(round_id, arm,
snapshot_id, pattern_id, p_up, action, watermark_ms, frozen_ms, provenance) UNIQUE(round_id, arm) —
crash-resume safe, exactly-once. prediction_results(round_id, arm, correct, venue_result, scored_ms).
runtime_watermarks(key, ms, note) with invariant node_created <= scored. library_versions for releases.
