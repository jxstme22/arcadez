# Pattern Lab handoff — prepared 2026-10-07 (main session; discovery NOT run here)

## Benchmark summaries

- P11 (20 prospective rounds, 11 UP/9 DOWN): OpenAI 20 SKIP (p≈0.5, Brier 0.251),
  Jev 20 SKIP (p≈0.5, Brier 0.257), GLiDE 16 acted 8/8 acc 0.50 Brier 0.317 bullish
  (UP 94% vs base 55%). alwaysUP 11/20 best. No edge. `data/reports/p11-20-rounds.json`.
- P12 (100 prospective rounds, 55 UP/45 DOWN, P12v1 frozen+validated): OpenAI 19 valid
  (81 throttled) all SKIP; Jev 100 valid all SKIP; GLiDE 85 acted 42/43 acc 0.494,
  Brier 0.297, logloss 0.802, bullish. Baselines: alwaysUP 55 best; momentum ~coin-flip.
  Verdict NO_DETECTABLE_SIGNAL. `data/reports/p12-*.json/csv`, `docs/phases/P12_REPORT.md`,
  hostile audits `docs/audits/P12_*.md` (all PASS).
- Provider behaviors: two systematic abstainers + one bullish actor; disagreement
  structure recorded (OpenAI==Jev 20/20; GLiDE differs 16).
- Baselines: alwaysUP/DOWN, prevCont/prevRev, fifty, momentum (harness `src/bench.mjs`).

## Datasets (DO NOT MERGE without builder step → DATASET-JUPITER-V2)

- Live (Session A): `var/live/` (this session's harvest, growing; `LIVE_CAPTURED`
  provenance) + `var/p11-live/` (P11 decisions/snapshots) + future `var/p12-live/`.
- Historical (Session B, externally owned): `var/history/` + `research/history/manifest*.json`.
  Checkpoint seen by A: 120 VENUE_RECORDED + growing backfill passes. READ ONLY from A.
- Every record keeps provenance (`LIVE_CAPTURED`, `VENUE_RECORDED`, `HISTORICAL_BACKFILL`, …).

## Gates for discovery

- Minimum: ≥1000 legitimate labeled rounds (prefer ≥2500, ideal ≥5000).
- Support gate n≥10 stands; wider regime sweeps only at n≥1000 with multiple-testing log.
- Pattern packet interface: `buildEvidencePacket` (SHADOW_ONLY) in `src/patterns.mjs`.
- PnL NULL until payout verified — directional research only.

## Recommended next dataset-build step

After Session B checkpoints ≥1000 rounds AND P12 completes: dedicated builder session
creates DATASET-JUPITER-V2 (frozen, hashed, provenance-separated), then Pattern Lab
activation experiment with pre-registered regimes. Do not tune on small-n data.
