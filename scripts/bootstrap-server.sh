#!/usr/bin/env bash
set -euo pipefail

[[ "${EUID}" -eq 0 ]] || { echo "Run as root: sudo bash scripts/bootstrap-server.sh" >&2; exit 1; }
mode="${DEPLOYMENT_MODE:-tunnel}"
[[ "$mode" == "tunnel" || "$mode" == "direct" ]] || { echo "DEPLOYMENT_MODE must be tunnel or direct" >&2; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git jq openssl unzip ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# shellcheck source=/dev/null
. /etc/os-release
cat >/etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker

if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
if [[ "$mode" == "direct" ]]; then ufw allow 80/tcp; ufw allow 443/tcp; fi
ufw --force enable
install -d -m 0750 /opt/line-open-notebook-bot
echo "Bootstrap complete: mode=$mode. HTTP ports are closed in tunnel mode."
