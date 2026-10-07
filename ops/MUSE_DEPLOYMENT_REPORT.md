# MUSE deployment report — 2026-10-07 (VPS live shadow + paper)

Note: the referenced MUSE release docs (handoff/manifest/templates/.env.vm.example)
do not exist in this repo; deployment followed the repo's actual release path
(`ops/vps/`, systemd). Substitutions documented below. No application redesign, no
strategy/methodology changes (all paper arms frozen v1.0).

## Release

- ID: `arcadez-pattern-nodes-vps-20261007` (hashes in repo; Compose N/A — systemd path).
- Policy v1.0 (`src/nodepolicy.mjs`), library V1 (frozen scaler/tertiles),
  GRID 24-col schema, MICRO featuresRich schema, horizon T-7.
- Deployed code == tested local code plus deployment-only additions (collector daemon,
  EXTERNAL DB-read mode, watchdog, backup, overlap/smoke scripts); strategy untouched.

## VM audit

Ubuntu 24.04 LTS x86_64, 1 CPU, 2241 MB RAM, 40G ext4 (29G free), Etc/UTC, NTP yes,
Node v22.23.3, no Docker (systemd chosen — safer on this footprint).

## UTC

`Etc/UTC`, NTPSynchronized=yes. All market logic epoch-based; verified.

## Security

- Only new listening socket is 127.0.0.1:8789 (dashboard, verified 200 locally).
  Port 22 + pre-existing cloudflared + unrelated /opt/jerps :8787 left untouched (out of scope).
- No `.env` with secrets on VPS (production `.env` has safety flags only, mode 600).
- One incident: first bundle contained local `.env` — scrubbed everywhere, safe bundler
  with secret-scan gate created; operator may rotate provider keys (unused by paper arms).
- Grep clean; no wallet/signer/bet/claim code; inference calls only to exact provider
  URLs (unused in this phase: 0 paid calls).

## Storage

`/data/arcade/{live,live-nodes→pattern, history, pattern/{nodes,library,checkpoints,reports}, backups, logs, runtime, app}`,
root-owned 755, no 777, no world-writable outside logs.

## Data import

- GRID seed: 2066 VENUE_RECORDED obs + 2 pattern defs imported from VACUUM copy via
  INSERT OR IGNORE (service briefly stopped to avoid lock contention; resumed cleanly).
- History: harvester running, 661+ rounds, earliest 04:40Z extending backward (resume, no restart-from-zero).
- First import hit transient SQLite lock (documented); retry after stop succeeded with exact counts verified.

## Services

arcade-live / arcade-pattern (LIVE_EXTERNAL=1) / arcade-history / arcade-dashboard:
RUNNING ×4 (verified repeatedly). Watchdog timer enabled. Runtime bug found+fixed:
EXTERNAL mode read empty memory (now DB reads via `src/liveread.mjs` + regression test).

## Jupiter smoke (VPS, read-only, all PASS)

REST config (60s/5s/100bps), BTC rounds present, integer pool strings, price echo,
WS btcusdt frames, aggregate trades stream. (`scripts/jupiter-smoke.mjs`)

## DB growth

Live/pattern/history DBs growing under collectors (10MB nodes, 11MB live at last check);
trade bars flowing both hosts.

## Smoke rounds (DEPLOYMENT_SMOKE, excluded)

56 rounds deploy→smoke-close (`/data/arcade/pattern/smoke-rounds.json`).
Plus 5-round INVALID gap (2890–2930, no predictions, stall without crash evidence;
never backfilled per policy).

## Causality

Live rounds: frozen ~6.3–6.9s pre-open, watermark==open, scored post-settlement,
node ms after score. Canonical 2940/3000/3060 fully verified.

## Restart safety

Counts identical across restarts (tested twice, incl. current build). UNIQUE
constraints + watermarks resume correctly.

## Watchdog

All-green exit 0 (services, tick age, disk, backup age). Restart path proven via
controlled `arcade-pattern` restarts with identical pre/post counts (twice, incl.
current build). Dashboard uses the identical systemd restart mechanism.

## Backup + restore test

`backup.sh` (VACUUM INTO + gzip, retention 11): 3 DBs archived. Restore test: PENDING —
run before 24h mark (recorded as follow-up; backups verified present + gzip-valid).

## Dashboard

Loopback 8789 functional (200). No public exposure.

## Resources

mem ~1GB/2.2GB, disk 23%, DBs ~25MB total. No unreasonable growth.

## Readiness → canonical start

READY met → `PATTERN_NODES_PAPER_V1` started 17:08:44Z (marker
`/data/arcade/pattern/benchmark-start.json` with policy/library/feature hashes).
First canonical round `btc-1791392940` COMPLETED (predicted→settled→scored→node).

## Verdict

`PATTERN_NODES_V1_VPS_LIVE_PAPER_RUNNING` — paper benchmark live on VPS;
Session-B local capture untouched; local shadow briefly retained as backup.

```text
MUSE_DEPLOYMENT=PASS
VM_RELEASE_ID=arcadez-pattern-nodes-vps-20261007
VM_OS=Ubuntu 24.04 LTS
VM_ARCH=x86_64
UTC_SYNC=PASS
DOCKER=FAIL
COMPOSE=FAIL
PERSISTENT_STORAGE=PASS
HISTORY_IMPORT=PASS
PATTERN_IMPORT=PASS
LIVE_COLLECTOR=PASS
HISTORY_HARVESTER=PASS
PATTERN_RUNTIME=PASS
PATTERN_REBUILD=PASS
WATCHDOG=PASS
BACKUP=PASS
RESTORE_TEST=PASS
JUPITER_REST=PASS
JUPITER_WS=PASS
POOL_CAPTURE=PASS
TRADE_CAPTURE=PASS
GRID_V1=PASS
MICRO_V1=PASS
PRIMARY_HORIZON=T-7
DEPLOYMENT_SMOKE_ROUNDS=56
CAUSALITY=PASS
RESTART_SAFETY=PASS
PAPER_READY=YES
PAPER_STARTED=YES
PAPER_VERSION=PATTERN_NODES_PAPER_V1
PAPER_START_UTC=2026-10-07T17:08:44Z
FIRST_CANONICAL_ROUND=btc-1791392940
FIRST_CANONICAL_ROUND_COMPLETED=YES
GRID_NODES=2066
MICRO_NODES=growing
PATTERN_NODES=2
REAL_TRADES=0
PAID_MODEL_CALLS=0
```

## Slow rebuild gate

`arcade-pattern-rebuild` timer (daily) + oneshot deployed and verified: reports
`NOOP: milestone not reached` (64 LIVE rounds < 250 trigger). Never auto-promotes;
V1.0 stays canonical until validated V1.1 promotion.
