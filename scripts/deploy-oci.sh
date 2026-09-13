#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo ".env is missing. Copy .env.example and set deployment values." >&2
  exit 1
fi

required=(PUBLIC_HOST OPEN_NOTEBOOK_ADMIN_HOST CLOUDFLARE_PROJECT_SLUG CLOUDFLARE_TUNNEL_NAME OPEN_NOTEBOOK_ENCRYPTION_KEY OPEN_NOTEBOOK_PASSWORD SURREAL_PASSWORD LINE_CHANNEL_SECRET LINE_CHANNEL_ACCESS_TOKEN INTERNAL_ADMIN_TOKEN OPEN_NOTEBOOK_STRATEGY_MODEL_ID OPEN_NOTEBOOK_ANSWER_MODEL_ID OPEN_NOTEBOOK_FINAL_MODEL_ID CLOUDFLARE_TUNNEL_TOKEN_FILE)
for name in "${required[@]}"; do
  value="$(sed -n "s/^${name}=//p" .env | tail -n 1)"
  if [[ -z "$value" || "$value" == replace-* || "$value" == *example.com ]]; then
    echo "Invalid or missing ${name} in .env" >&2
    exit 1
  fi
done

token_file="$(sed -n 's/^CLOUDFLARE_TUNNEL_TOKEN_FILE=//p' .env | tail -n 1)"
if [[ ! -f "$token_file" ]]; then
  echo "Cloudflare tunnel token file does not exist: $token_file" >&2
  exit 1
fi
if [[ "$(stat -c '%a' "$token_file")" != "600" ]]; then
  echo "Cloudflare tunnel token file must have mode 600: $token_file" >&2
  exit 1
fi

compose=(docker compose -f docker-compose.yml -f docker-compose.oci.yml)
"${compose[@]}" config --quiet
"${compose[@]}" pull
"${compose[@]}" build --pull bridge
"${compose[@]}" up -d --remove-orphans
"${compose[@]}" ps

for _ in {1..60}; do
  if "${compose[@]}" exec -T edge-router wget -qO- http://127.0.0.1:8080/health >/dev/null; then
    echo "Internal health passed. Verify the Cloudflare public hostname before changing the LINE Webhook URL."
    exit 0
  fi
  sleep 5
done

echo "Internal health check timed out." >&2
"${compose[@]}" logs --tail=100
exit 1
