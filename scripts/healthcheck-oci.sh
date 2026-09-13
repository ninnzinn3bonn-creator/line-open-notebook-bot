#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
compose=(docker compose -f docker-compose.yml -f docker-compose.oci.yml)
failures=0

for service in surrealdb open-notebook bridge edge-router cloudflared; do
  if [[ -z "$("${compose[@]}" ps --status running -q "$service")" ]]; then
    echo "FAIL service is not running: $service" >&2
    failures=$((failures + 1))
  else
    echo "PASS running: $service"
  fi
done

if ! "${compose[@]}" exec -T bridge node -e "fetch('http://127.0.0.1:3001/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"; then
  echo "FAIL Bridge internal health" >&2
  failures=$((failures + 1))
else
  echo "PASS Bridge internal health"
fi

if ! "${compose[@]}" exec -T open-notebook python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5055/health', timeout=3)"; then
  echo "FAIL Open Notebook internal health" >&2
  failures=$((failures + 1))
else
  echo "PASS Open Notebook internal health"
fi

if [[ -n "${PUBLIC_HEALTH_URL:-}" ]]; then
  if ! curl --fail --silent --show-error --max-time 10 "$PUBLIC_HEALTH_URL" >/dev/null; then
    echo "FAIL public health: $PUBLIC_HEALTH_URL" >&2
    failures=$((failures + 1))
  else
    echo "PASS public health"
  fi
fi

if [[ "$failures" -gt 0 ]]; then
  echo "Health check failed: $failures item(s)" >&2
  exit 1
fi
echo "Health check passed"

