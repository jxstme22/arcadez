#!/usr/bin/env bash
# Executes ONE non-interactive OpenCode session. It cannot guarantee that agent models, auth, or network are available.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v opencode >/dev/null || { echo 'BLOCKED: opencode is not installed. See ops/OVERNIGHT_GSD.md'; exit 2; }
mkdir -p var/agent-logs ops
stamp="$(date +%Y%m%d_%H%M%S)"
log="var/agent-logs/overnight_${stamp}.log"
cat <<'INFO'
Running bounded local coding-agent task. Safety: no keys, no paid inference, no financial transactions.
Logs are local under var/agent-logs/. To prevent Mac sleep, run: caffeinate -i bash ops/run-overnight.sh
INFO
prompt="$(cat ops/OVERNIGHT_PROMPT.md)"
# Explicitly no global --dangerously-skip-permissions; configured local tool permissions apply.
set +e
opencode run "$prompt" 2>&1 | tee "$log"
status="${PIPESTATUS[0]}"
set -e
printf 'Agent exit code: %s\nLog: %s\n' "$status" "$log"
exit "$status"
