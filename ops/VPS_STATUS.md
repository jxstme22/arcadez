# VPS status — 2026-10-07 (Session: VPS live shadow + paper)

## Deployment

- Host: Ubuntu 24.04, 1 CPU / 2.2 GB / 40 GB (29G free), UTC/NTP OK, Node v22, systemd path (no Docker).
- Bundle via `ops/vps/bundle.sh` (secret-scan gate); installed 15:56Z. Services: arcade-live, arcade-pattern (LIVE_EXTERNAL=1), arcade-history, arcade-dashboard (loopback), watchdog timer.
- Security note: first bundle accidentally included `.env` (scrubbed local + VPS; safe bundler + AppleDouble purge added; operator may rotate provider keys at convenience — keys unused by paper arms).

## Overlap validation (VP10 PASS)

35-min window VPS vs local shadow: **31 common settled rounds, 0 outcome mismatches, 0 pool mismatches**; tick cadence same order (44 vs 58/min); trade bars flowing both sides. Shadow-only rounds (4 older) and VPS-subset consistent — no divergence.

## Promotion

`VPS_CANONICAL=YES` (2026-10-07T16:35Z, marker `/data/arcade/pattern/canonical.json`).
Paper benchmark runs on VPS from deploy-time BENCHMARK_START; first VPS-settled round
`btc-1791388260`. Local shadow continues briefly as backup comparison.

## Paper status (VPS, live)

T-7 predictions persisting (A0–A4 acting, pattern/micro arms correctly SKIP with empty
memory); settlement scoring + MICRO node insertion verified in local shadow
(frozen ~6.8s pre-open, watermark == open). VPS node accumulation in progress.

## Routine ops

- View dashboard: `ssh -L 8789:localhost:8789 root@202.10.37.226` then http://127.0.0.1:8789
- Logs: `/data/arcade/logs/*.log`; status: `NODES_DIR=/data/arcade/pattern/nodes node scripts/pattern-status.mjs`
- Watchdog: every 5 min (safe restarts only); backups: `ops/vps/backup.sh` (VACUUM INTO, retention 11)
- Credentials live only in operator hands + process env; never in repo/logs (audited).

```text
VPS_DEPLOYED=YES
VPS_CANONICAL=YES
LIVE_COLLECTOR=PASS
HISTORY_HARVESTER=PASS
PATTERN_RUNTIME=PASS
WATCHDOG=PASS
BACKUPS=PASS
GRID_SCHEMA=PASS
MICRO_SCHEMA=PASS
PRIMARY_HORIZON=T-7
GRID_OBSERVATION_NODES=2066
MICRO_OBSERVATION_NODES=growing
PATTERN_NODES=2
ACTIVE_PATTERNS=2
NOVELTY_BUFFER=growing
FRESHNESS_ENGINE=PASS
DRIFT_ENGINE=PASS
OOD_ENGINE=PASS
PAPER_BENCHMARK=RUNNING
PAPER_VERSION=PATTERN_NODES_PAPER_V1
PAPER_VALID_ROUNDS=growing
CAUSALITY_AUDIT=PASS
RESTART_SAFETY=PASS
PAID_MODEL_CALLS=0
REAL_TRADES=0
```
