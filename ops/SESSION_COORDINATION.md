# Session coordination — 2026-10-07 (main session A)

## Session A — main / live benchmark (THIS session)

- Owner: main benchmark session.
- Writes: `var/live/`, `var/p11-live/`, `data/reports/p11*`, `data/benchmark/`, P11/P12 reports, live-harvest logs `var/agent-logs/sessionA-live-harvest.log`.
- Processes: `scripts/live-harvest.mjs` (own collector + trades stream).
- MUST NOT modify: `var/history/`, `research/history/manifest*.json`, session-B logs/captures.
- Shared-code rule: backward-compatible only; if session B runs an old copy, do not restart it — record the needed restart instead.

## Session B — historical Data Foundry (separate session, do not disturb)

- Expected writes: `var/history/`, `research/history/manifest*.json`, historical reports.
- Expected processes: `capture 360` (→ `./var`), `harvest-history` chain (→ `./var/history`).
- Session A MUST NOT: kill/restart/reconfigure its processes, migrate its DB, delete/overwrite its files or manifests, rewrite history mid-harvest.

## Shared read-only sources (no ownership)

- `research/ws/*`, `research/data-foundry/contracts/*`, Jupiter public APIs (2.1s spacing each; stop if 429).

## Merge policy

Live (`var/live`, `LIVE_CAPTURED`) and historical (`var/history`, `VENUE_RECORDED`) datasets merge ONLY via a future explicit dataset-builder step (DATASET-JUPITER-V2). No direct table appends across stores while collectors run.

## Session C — Pattern Lab V1 (complete, offline)
- Read `var/history` via readOnly opens only; one VACUUM INTO checkpoint at PL00.
- Never wrote var/history, never touched Session A/B processes or DBs. 0 paid calls.
- Verdict PATTERN_LAB_V1_NO_SIGNAL; V2 awaits Session-B >=2500 labels.

## Session V2 — Pattern Lab replication (complete, offline)
- Read var/history via readOnly opens only; one VACUUM INTO checkpoint; never wrote var/history or touched harvesters. 0 paid calls.
- Verdict PATTERN_LAB_V2_REPLICATION_NULL. V3 awaits >=5000 labels.

## Session Nodes V1 build (complete, offline)
- Seeded 2066 nodes from V2 checkpoint copy (readOnly); replayed chronologically with watermark. Never wrote var/history or touched harvesters. 0 paid calls.
- Own DB var/pattern-nodes (10MB). No interference with Sessions A/B storage.

## VPS canonical runtime (2026-10-07T16:35Z)
- VPS_CANONICAL=YES (marker /data/arcade/pattern/canonical.json). Overlap 31/31 clean.
- Session-B local capture may retire to backup once operator confirms; do not kill blindly.
