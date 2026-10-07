# VPS deployment report — 2026-10-07

Target: Ubuntu 24.04, 1 CPU/2.2GB/40GB, UTC/NTP OK, Node v22, no Docker -> systemd path.
Bundle 1.5M via ops/vps/bundle.sh (secret-scan gate). Installed 15:56Z; arcade-live,
arcade-pattern, arcade-history, arcade-dashboard active; watchdog timer enabled.
Security incident + fix: first bundle contained .env (scrubbed local/VPS; safe bundler
created; operator may rotate provider keys at convenience).
Dashboard loopback-only (SSH tunnel for viewing). Overlap validation: pending >=30min
window vs local collectors (see ZERO_GAP_MIGRATION.md).
