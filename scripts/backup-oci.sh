#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

destination="${1:-/var/backups/line-open-notebook-bot}"
password_file="${BACKUP_PASSWORD_FILE:-./secrets/backup-password}"
compose=(docker compose -f docker-compose.yml -f docker-compose.oci.yml)

for command in docker openssl tar sha256sum; do
  command -v "$command" >/dev/null || { echo "Required command is missing: $command" >&2; exit 1; }
done
[[ -f .env ]] || { echo ".env is required" >&2; exit 1; }
[[ -f "$password_file" ]] || { echo "Backup password file is missing: $password_file" >&2; exit 1; }
[[ "$(stat -c '%a' "$password_file")" == "600" ]] || { echo "Backup password file must have mode 600" >&2; exit 1; }

mkdir -p "$destination"
destination="$(realpath "$destination")"
stage="$(mktemp -d)"
resume_needed=0
cleanup() {
  if [[ "$resume_needed" -eq 1 ]]; then
    "${compose[@]}" up -d >/dev/null || true
  fi
  rm -rf -- "$stage"
}
trap cleanup EXIT

was_running="$("${compose[@]}" ps --status running -q | wc -l)"
"${compose[@]}" stop bridge open-notebook surrealdb >/dev/null
[[ "$was_running" -gt 0 ]] && resume_needed=1

bridge_id="$("${compose[@]}" ps -q bridge)"
[[ -n "$bridge_id" ]] || { echo "Bridge container does not exist; deploy before backup" >&2; exit 1; }
mkdir -p "$stage/data/bridge_data"
docker cp "$bridge_id:/app/data/." "$stage/data/bridge_data"
for directory in notebook_data surreal_data; do
  [[ -d "$directory" ]] || { echo "Required data directory is missing: $directory" >&2; exit 1; }
  cp -a "$directory" "$stage/data/$directory"
done

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
plain="$stage/line-open-notebook-bot-$timestamp.tar.gz"
encrypted="$destination/line-open-notebook-bot-$timestamp.tar.gz.enc"
cat >"$stage/data/manifest.txt" <<EOF
created_at_utc=$timestamp
git_revision=$(git rev-parse HEAD 2>/dev/null || echo unknown)
open_notebook_image=$("${compose[@]}" config --images | grep 'lfnovo/open_notebook' | head -n 1)
surrealdb_image=$("${compose[@]}" config --images | grep 'surrealdb/surrealdb' | head -n 1)
EOF
tar -C "$stage/data" -czf "$plain" .
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -in "$plain" -out "$encrypted" -pass "file:$password_file"
(cd "$destination" && sha256sum "$(basename "$encrypted")") >"$encrypted.sha256"
chmod 600 "$encrypted" "$encrypted.sha256"

if [[ "$was_running" -gt 0 ]]; then
  "${compose[@]}" up -d >/dev/null
  resume_needed=0
fi
echo "Backup created: $encrypted"
