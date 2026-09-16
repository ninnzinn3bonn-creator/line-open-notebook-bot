#!/usr/bin/env bash
set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
mode="${DEPLOYMENT_MODE:-tunnel}"
failures=0
warnings=0

pass() { echo "PASS $*"; }
warn() { echo "WARN $*"; warnings=$((warnings + 1)); }
fail() { echo "FAIL $*" >&2; failures=$((failures + 1)); }
env_value() { sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1; }

if [[ "$(uname -s)" == "Linux" ]]; then pass "Linux host"; else fail "Linux host is required for delivery"; fi
arch="$(uname -m)"
if [[ "$arch" == "x86_64" || "$arch" == "aarch64" ]]; then pass "supported architecture: $arch"; else fail "unsupported architecture: $arch"; fi

memory_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
if [[ "$memory_kb" -ge 3500000 ]]; then pass "memory >= 3.5 GB"; else fail "at least 4 GB RAM is required"; fi
disk_kb="$(df -Pk . 2>/dev/null | awk 'NR==2 {print $4}')"
if [[ "${disk_kb:-0}" -ge 20000000 ]]; then pass "free disk >= 20 GB"; else warn "less than 20 GB free disk"; fi

if command -v docker >/dev/null; then pass "docker command"; else fail "docker is missing"; fi
if docker info >/dev/null 2>&1; then pass "docker engine"; else fail "docker engine is not running"; fi
if docker compose version >/dev/null 2>&1; then pass "docker compose plugin"; else fail "docker compose plugin is missing"; fi

if [[ ! -f .env ]]; then
  fail ".env is missing"
else
  mode_required=(OPEN_NOTEBOOK_ENCRYPTION_KEY OPEN_NOTEBOOK_PASSWORD SURREAL_PASSWORD LINE_CHANNEL_SECRET LINE_CHANNEL_ACCESS_TOKEN INTERNAL_ADMIN_TOKEN OPEN_NOTEBOOK_STRATEGY_MODEL_ID OPEN_NOTEBOOK_ANSWER_MODEL_ID OPEN_NOTEBOOK_FINAL_MODEL_ID)
  if [[ "$mode" == "tunnel" ]]; then
    mode_required+=(PUBLIC_HOST OPEN_NOTEBOOK_ADMIN_HOST CLOUDFLARE_PROJECT_SLUG CLOUDFLARE_TUNNEL_NAME CLOUDFLARE_TUNNEL_TOKEN_FILE)
  elif [[ "$mode" == "direct" ]]; then
    mode_required+=(PUBLIC_HOST)
  else
    fail "DEPLOYMENT_MODE must be tunnel or direct"
  fi
  for name in "${mode_required[@]}"; do
    value="$(env_value "$name")"
    if [[ -z "$value" || "$value" == replace-* || "$value" == *example.com ]]; then fail "$name is missing or a placeholder"; else pass "$name configured"; fi
  done
fi

if [[ "$mode" == "tunnel" && -f .env ]]; then
  token_file="$(env_value CLOUDFLARE_TUNNEL_TOKEN_FILE)"
  if [[ -f "$token_file" ]]; then
    if [[ "$(stat -c '%a' "$token_file")" == "600" ]]; then pass "Tunnel token mode 600"; else fail "Tunnel token file must have mode 600"; fi
  else
    fail "Tunnel token file does not exist"
  fi
fi

compose_files=(-f docker-compose.yml)
[[ "$mode" == "tunnel" ]] && compose_files+=(-f docker-compose.oci.yml) || compose_files+=(-f docker-compose.production.yml)
if [[ "$failures" -eq 0 ]]; then
  if docker compose "${compose_files[@]}" config --quiet; then pass "Compose configuration"; else fail "Compose configuration"; fi
fi

echo "Doctor result: failures=$failures warnings=$warnings mode=$mode"
[[ "$failures" -eq 0 ]]
