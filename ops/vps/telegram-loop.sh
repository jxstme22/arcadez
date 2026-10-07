#!/usr/bin/env bash
# Event-driven settlement reporter: sends on newly settled rounds + 30-min heartbeat.
cd /data/arcade/app
last=0; beat=0
while true; do
  sleep 30
  n=$(LIVE_DIR=/data/arcade/app/var/p12ab-live node --input-type=module -e "
import {Store} from './src/store.mjs';
const s=new Store(process.env.LIVE_DIR);
console.log(s.db.prepare(\"SELECT COUNT(DISTINCT d.round_id) n FROM decisions d JOIN rounds r ON r.id=d.round_id WHERE r.result IN ('UP','DOWN')\").get().n);
s.close();" 2>/dev/null | tail -n 1)
  now=$(date +%s)
  if [ -n "$n" ] && [ "$n" -gt "$last" ]; then
    last=$n
    LIVE_DIR=/data/arcade/app/var/p12ab-live node scripts/report-telegram.mjs >> /data/arcade/logs/telegram.log 2>&1 || true
  elif [ $((now - beat)) -ge 1800 ]; then
    beat=$now
    LIVE_DIR=/data/arcade/app/var/p12ab-live node scripts/report-telegram.mjs >> /data/arcade/logs/telegram.log 2>&1 || true
  fi
done
