#!/usr/bin/env bash
# SQLite-safe backup: VACUUM INTO (never naive cp of live DBs). Retention: newest 11.
set -euo pipefail
BACKUP_DIR="/data/arcade/backups"
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%d_%H%M%S)"
for db in /data/arcade/live/arcade.sqlite /data/arcade/pattern/nodes/nodes.db /data/arcade/history/arcade.sqlite; do
  [ -f "$db" ] || continue
  parent="$(basename "$(dirname "$db")")"
  if [ "$parent" = "nodes" ]; then parent="pattern-nodes"; fi
  dest="$BACKUP_DIR/${parent}_${stamp}.db"
  node /data/arcade/app/ops/vps/vacuum-into.mjs "$db" "$dest"
  gzip -f "$dest"
  echo "backed up $db -> ${dest}.gz"
done
ls -t "$BACKUP_DIR"/*.gz 2>/dev/null | tail -n +12 | xargs -r rm -f
echo "backup done $(date -u +%FT%TZ)"
