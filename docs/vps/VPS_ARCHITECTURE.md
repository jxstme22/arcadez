# VPS architecture — 2026-10-07 (systemd path; target has no Docker)

Host: Ubuntu 24.04, 1 CPU / 2.2 GB RAM / 40 GB disk, UTC + NTP synced, Node v22.
systemd chosen over Compose (no Docker on host; lighter footprint; matches OS).

## Services (`ops/vps/units/`, root-owned system units)

- `arcade-live` — `scripts/collector-daemon.mjs` (WS ticks, rounds, pools, trades → `/data/arcade/live`).
- `arcade-pattern` — `scripts/pattern-live.mjs` with `LIVE_EXTERNAL=1` (reads live DB, T-7 paper, settle→score→nodes → `/data/arcade/pattern/nodes`).
- `arcade-history` — `ops/vps/history-loop.sh` (rotating backfill windows → `/data/arcade/history`).
- `arcade-dashboard` — loopback-only `:8789` (no public exposure; SSH tunnel for viewing).
- `arcade-watchdog.{timer,service}` — 5-min checks + safe restarts (`--fix`).

## Layout

`/data/arcade/{live,live-nodes→pattern, history, pattern/{nodes,library,checkpoints,reports}, backups, logs, runtime, app}`.
Ownership: live.db → arcade-live; history.db → arcade-history; nodes.db → arcade-pattern.
Pattern runtime NEVER writes collector DBs (reads only + own snapshots dir).

## Deployment record

Bundle via `ops/vps/bundle.sh` (excludes .env/keys/var/raw; secret-scan gate),
scp, `ops/vps/install.sh`. Installed 2026-10-07T15:56Z; all 4 services active.
Security note: first bundle accidentally included `.env` (fixed: scrubbed everywhere,
safe bundler created, no evidence of exfiltration; keys remain valid but treat as
touched — operator may rotate at convenience).
