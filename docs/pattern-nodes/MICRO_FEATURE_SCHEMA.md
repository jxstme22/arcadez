# Micro feature schema — NODE_MICRO_V1 (2026-10-07)

True 1-second live representation computed by `featuresRich(ticks, cutoff)` in
`src/features.mjs` (already verified, 1s-capable). Every field: causal
(`receive_ts <= cutoff`), null with documented reason when unavailable.

## Families (units / lookback / missing behavior)

- returns `return_{1,2,3,5,7,10,15,20,30,45,60,120,300}s_bps` (+ `_usd` twins):
  bps vs USD diff; null if no tick within maxAge (2500ms) of reference.
- velocity `velocity_{1_3,3_5,5_10,10_30}` (bps diffs), acceleration short/medium.
- volatility `realized_vol_{5,10,15,30,60,120,300}s_bps` (needs ≥3 ticks else null).
- range `range_{5,15,30,60,300}s_bps`, `distance_from_high/low_{15,60}s_bps`,
  `position_in_range_{15,60}s` (null on flat window).
- path: `direction_flips_60s`, `seconds_since_flip_60s`, `mono_60s`,
  `largest_move_60s_usd`; 5s/15s analogues where tick density allows.
- transitions: `momentum_change_{1_5,5_15,15_60}`, `vol_expansion_{5v30,15v60}`,
  `range_expansion_{5v30,15v60}`.
- pool: all NULL (`POOL_LIVE_AVAILABILITY_UNPROVEN` — venue pools observed
  post-settlement only; never live features).
- sequence (settled past only): prev direction/sequences/rates/streaks.
- quality block: price_age_ms, ticks_5/15/60s, gaps, missing_fields[], flags[].

## GRID vs MICRO separation

- NODE_GRID_V1: 24 FULL_CLEAN numerics on ~60s grids (historical; frozen).
- NODE_MICRO_V1: featuresRich values+quality at T-7 (live only).
- Stored in the same `observation_nodes` table distinguished by `schema_version`
  (`grid-v1` vs `micro-v1`) — never compared across schemas for similarity.
- Primary horizon: T-7 (cutoff = open−7000ms; venue lock = open−6000ms worst case).
  Research snapshots also taken at T-60/30/15/10/5/3 but excluded from the primary
  benchmark universe.
