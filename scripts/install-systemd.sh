#!/usr/bin/env bash
set -euo pipefail

[[ "${EUID}" -eq 0 ]] || { echo "Run with sudo" >&2; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${DEPLOYMENT_MODE:-tunnel}"
[[ "$mode" == "tunnel" || "$mode" == "direct" ]] || { echo "DEPLOYMENT_MODE must be tunnel or direct" >&2; exit 1; }

cat >/etc/default/line-open-notebook-bot <<EOF
DEPLOYMENT_MODE=$mode
EOF
cat >/etc/systemd/system/line-open-notebook-bot.service <<EOF
[Unit]
Description=LINE Open Notebook Bot Docker Compose
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$root
EnvironmentFile=-/etc/default/line-open-notebook-bot
ExecStart=/usr/bin/bash $root/scripts/service-control.sh start
ExecStop=/usr/bin/bash $root/scripts/service-control.sh stop
TimeoutStartSec=600

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now line-open-notebook-bot.service
systemctl --no-pager status line-open-notebook-bot.service
