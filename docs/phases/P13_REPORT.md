# P13 report — 2026-10-07 (live session)

## P13A history: PASS (foundation, n=120)

- `scripts/harvest-history.mjs`: 2h window, 120/120 venue rounds (`VENUE_RECORDED`,
  labels cross-checked 120/120) + 120/120 timestamp prices (`HISTORICAL_BACKFILL`),
  isolated in `var/history` (live tables 0 rows). One repair: grid-alignment bug
  (off-grid secs 404) fixed with minute-floor + regression note in manifest flow.
- Provenance: `research/history/HISTORICAL_PROVENANCE.md`; manifest
  `research/history/manifest.json`. No invented rounds (0 missing, gaps would stay gaps).

## P13B features: PASS

- `src/history.mjs` (`history-v1`): fixed 10-dim past-only vectors
  (ret_60/120/300, vol/range/flips_300, prev-3 sequence, pool imbalance flagged
  POST_SETTLEMENT_RESEARCH_ONLY), nearest-price snapping documented (no interpolation),
  chronological splits, TRAIN-only quantile thresholds + z-norms, Wilson CIs.

## P13C discovery: DESCRIPTIVE_ONLY (no edge claimed)

- `scripts/pattern-discovery.mjs` → `research/patterns/discovery.json`: 120 rows
  (72/24/24), ONE pre-registered 18-regime quantile grid (8/16/24/32/64 sweep
  explicitly not run — n too small). Test regimes all n≤5; min-support gate (n≥10)
  yields ZERO eligible regimes. Verdict: INSUFFICIENT_SAMPLE / NO_DETECTABLE_SIGNAL.

## P13D scenario/packet: SKELETON PASS (shadow only)

- `scenarioPaths` (seeded bootstrap, UNCALIBRATED) + `neighbors` (embargo) retained;
  new `buildEvidencePacket` returns provider-neutral packet with
  `status: SHADOW_ONLY_NOT_FOR_INFERENCE`. Never fed to providers (P12 untouched).

## Readiness (against PATTERN_LAB_READY gate)

- Live pipeline: YES (WS verified, causality + settlement proven).
- Provider benchmark: NO — P11 live + P12 not run (spend approval absent).
- Historical foundation: PARTIAL (n=120, single 2h window; needs multi-day expansion).
- Pattern engine: PARTIAL (deterministic + reproducible, but support-starved).
- Safety/tests: YES (61/61, wallet-free).

**PATTERN_LAB_READY=NO** — needs: (1) operator-approved P11/P12, (2) larger history
(multi-day harvest via `scripts/harvest-history.mjs` with wider window), (3) re-run
discovery at n≥1000 before any support claim.
