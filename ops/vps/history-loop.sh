#!/usr/bin/env bash
# Historical harvest resume loop (bounded, idempotent). Windows rotate through retention.
set -euo pipefail
cd /data/arcade/app
# Pass A: recent 6h rounds+prices every run; passes B/C walk older windows on alternate runs.
n=0
while true; do
  if [ $((n % 3)) -eq 0 ]; then
    HIST_TO_MIN=15 HIST_SPAN_MIN=360 HIST_MANIFEST=research/history/manifest-live.json node scripts/harvest-history.mjs || true
  elif [ $((n % 3)) -eq 1 ]; then
    HIST_TO_MIN=375 HIST_SPAN_MIN=360 HIST_MANIFEST=research/history/manifest-older.json node scripts/harvest-history.mjs || true
  else
    HIST_TO_MIN=735 HIST_SPAN_MIN=360 HIST_MANIFEST=research/history/manifest-oldest.json node scripts/harvest-history.mjs || true
  fi
  n=$((n+1))
  sleep 1800
done
