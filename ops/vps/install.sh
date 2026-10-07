#!/usr/bin/env bash
# VPS install: layout + units + shadow start. Run as root on the VPS. No secrets in repo.
set -euo pipefail
mkdir -p /data/arcade/{live,live-nodes,history,pattern/nodes,pattern/library,pattern/checkpoints,pattern/reports,backups,logs,runtime} /data/arcade/app
cp -r /root/arcade-deploy/* /data/arcade/app/
cp /data/arcade/app/ops/vps/units/*.service /data/arcade/app/ops/vps/units/*.timer /etc/systemd/system/ 2>/dev/null || cp /data/arcade/app/ops/vps/units/* /etc/systemd/system/
chmod +x /data/arcade/app/ops/vps/*.sh
systemctl daemon-reload
systemctl enable --now arcade-live arcade-pattern arcade-history arcade-dashboard
systemctl enable --now arcade-watchdog.timer
systemctl status arcade-live arcade-pattern --no-pager | head -n 12
echo "INSTALL_DONE $(date -u +%FT%TZ)"
