#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo ".env is missing. Copy .env.example and replace every placeholder." >&2
  exit 1
fi

required=(PUBLIC_HOST OPEN_NOTEBOOK_ENCRYPTION_KEY OPEN_NOTEBOOK_PASSWORD SURREAL_PASSWORD LINE_CHANNEL_SECRET LINE_CHANNEL_ACCESS_TOKEN)
for name in "${required[@]}"; do
  value="$(sed -n "s/^${name}=//p" .env | tail -n 1)"
  if [[ -z "$value" || "$value" == replace-* || "$value" == notebook.example.com ]]; then
    echo "Invalid or missing ${name} in .env" >&2
    exit 1
  fi
done

compose=(docker compose -f docker-compose.yml -f docker-compose.production.yml)
"${compose[@]}" config --quiet
"${compose[@]}" pull
"${compose[@]}" build --pull bridge
"${compose[@]}" up -d --remove-orphans
"${compose[@]}" ps

echo "Waiting for public health endpoint..."
for _ in {1..60}; do
  if curl --fail --silent --show-error "https://$(sed -n 's/^PUBLIC_HOST=//p' .env | tail -n 1)/bridge-health" >/dev/null; then
    echo "Deployment healthy."
    exit 0
  fi
  sleep 5
done

echo "Health check timed out." >&2
"${compose[@]}" logs --tail=100
exit 1
