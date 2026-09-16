#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
mode="${DEPLOYMENT_MODE:-tunnel}"
compose=(docker compose -f docker-compose.yml)
[[ "$mode" == "tunnel" ]] && compose+=(-f docker-compose.oci.yml) || compose+=(-f docker-compose.production.yml)

echo "Deployment mode: $mode"
docker version --format 'Docker server: {{.Server.Version}}' 2>/dev/null || echo "FAIL Docker engine unavailable"
"${compose[@]}" ps 2>/dev/null || true

for service in surrealdb open-notebook bridge; do
  id="$("${compose[@]}" ps -q "$service" 2>/dev/null)"
  if [[ -z "$id" ]]; then
    echo "FAIL missing container: $service"
    continue
  fi
  state="$(docker inspect --format '{{.State.Status}}' "$id" 2>/dev/null)"
  health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2>/dev/null)"
  restarts="$(docker inspect --format '{{.RestartCount}}' "$id" 2>/dev/null)"
  echo "STATE $service status=$state health=$health restarts=$restarts"
done

if [[ "$mode" == "tunnel" ]]; then
  for service in edge-router cloudflared; do
    id="$("${compose[@]}" ps -q "$service" 2>/dev/null)"
    [[ -n "$id" ]] && echo "STATE $service status=$(docker inspect --format '{{.State.Status}}' "$id") restarts=$(docker inspect --format '{{.RestartCount}}' "$id")" || echo "FAIL missing container: $service"
  done
fi

"${compose[@]}" exec -T bridge node -e "fetch('http://127.0.0.1:3001/health').then(async r=>console.log('CHECK bridge='+r.status)).catch(()=>{console.log('CHECK bridge=unreachable');process.exitCode=1})" 2>/dev/null || true
"${compose[@]}" exec -T open-notebook python -c "import urllib.request; print('CHECK open-notebook='+str(urllib.request.urlopen('http://127.0.0.1:5055/health', timeout=3).status))" 2>/dev/null || echo "CHECK open-notebook=unreachable"
echo "No logs or secret values were printed. Use docker compose logs for a service only when access is restricted."
