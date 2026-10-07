# Watchdog — monitor + safe restarts only

`ops/vps/watchdog.mjs` every 5 min (timer): service states, tick age <120s, round age
<10min, disk >2GB free, backup age <48h. `--fix` runs `try-restart` on failed units.
NEVER deletes data, fabricates observations, or backfills predictions. Unsafe disk
pressure => alert in output (exit 1), human decides.
