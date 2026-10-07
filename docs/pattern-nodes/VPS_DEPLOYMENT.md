# VPS deployment plan (NOT yet deployed — local shadow first)

Services (Compose or systemd): arcade-live (collector), arcade-history (backfill, Session B),
arcade-pattern-runtime (replay loop on live DB), arcade-pattern-slow-rebuild (+250 batches),
arcade-watchdog (ticks/rounds/settlement freshness, disk, heartbeats, watermarks),
optional arcade-dashboard (127.0.0.1 + reverse proxy, GET-only).
Zero-gap migration: build stack → shadow collectors → compare VPS vs local → overlap window
→ promote → local backup → retire. Backups: SQLite VACUUM INTO hourly/daily, 7d + 4w retention.
Current state: code paths are VPS-compatible (separate DB dirs via env); deployment itself pending.
