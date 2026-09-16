#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
action="${1:?Usage: service-control.sh start|stop}"
mode="${DEPLOYMENT_MODE:-tunnel}"
compose=(docker compose -f docker-compose.yml)
[[ "$mode" == "tunnel" ]] && compose+=(-f docker-compose.oci.yml) || compose+=(-f docker-compose.production.yml)
case "$action" in
  start) "${compose[@]}" up -d --remove-orphans ;;
  stop) "${compose[@]}" stop ;;
  *) echo "Unsupported action: $action" >&2; exit 2 ;;
esac
