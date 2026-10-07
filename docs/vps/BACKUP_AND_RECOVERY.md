# Backup & recovery — SQLite-safe only

`ops/vps/backup.sh`: VACUUM INTO timestamped copies + gzip; retention newest 11 archives
(~7 daily + 4 weekly equivalent). Never naive-cp live DBs. Recovery: stop service,
VACUUM INTO from newest good archive, restart (watermarks resume idempotently).
Pattern library manifests + benchmark DBs included via same script (nodes/live/history).
