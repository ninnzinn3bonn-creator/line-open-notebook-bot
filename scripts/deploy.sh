#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mode="${DEPLOYMENT_MODE:-tunnel}"
DEPLOYMENT_MODE="$mode" bash scripts/doctor.sh

compose=(docker compose -f docker-compose.yml)
[[ "$mode" == "tunnel" ]] && compose+=(-f docker-compose.oci.yml) || compose+=(-f docker-compose.production.yml)
"${compose[@]}" pull
"${compose[@]}" build --pull bridge
"${compose[@]}" up -d --remove-orphans
"${compose[@]}" ps

for _ in {1..60}; do
  if "${compose[@]}" exec -T bridge node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
    echo "Deployment internal health passed."
    exit 0
  fi
  sleep 5
done
echo "Deployment health timed out. Run: DEPLOYMENT_MODE=$mode bash scripts/diagnose.sh" >&2
exit 1
