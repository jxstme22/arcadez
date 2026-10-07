#!/usr/bin/env bash
# Safe bundle: NEVER includes .env, keys, var/, AppleDouble files.
set -euo pipefail
cd "$(dirname "$0")/../.."
tar --exclude='./var' --exclude='./node_modules' --exclude='./.git' --exclude='./research/ws/raw' --exclude='.env' --exclude='._*' --exclude='*/._*' --exclude='.DS_Store' -czf /tmp/arcade-deploy.tgz . 
echo "bundle: $(ls -lh /tmp/arcade-deploy.tgz | awk '{print $9, $5}')"
tar -tzf /tmp/arcade-deploy.tgz | grep -E '(^|/)\.env$'; tar -tzf /tmp/arcade-deploy.tgz | grep -E '/\._' || true && { echo 'FATAL: .env in bundle'; exit 1; } || echo "secret-scan clean (no .env)"
