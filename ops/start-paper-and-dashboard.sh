#!/usr/bin/env bash
# Local only. Starts a 127.0.0.1 dashboard and foreground PAPER runner.
# No real-money route exists in this repository.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p var
npm run dashboard >var/dashboard.log 2>&1 &
dash_pid=$!
cleanup(){ kill "$dash_pid" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
printf 'Local read-only dashboard: http://127.0.0.1:8789\nLaunching Jupiter BTC PAPER mode (no real trades)...\n'
npm run paper
