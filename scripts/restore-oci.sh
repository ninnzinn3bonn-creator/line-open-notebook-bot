#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

encrypted="${1:?Usage: scripts/restore-oci.sh BACKUP.tar.gz.enc}"
password_file="${BACKUP_PASSWORD_FILE:-./secrets/backup-password}"
compose=(docker compose -f docker-compose.yml -f docker-compose.oci.yml)

[[ -f "$encrypted" && -f "$encrypted.sha256" ]] || { echo "Backup or checksum file is missing" >&2; exit 1; }
[[ -f "$password_file" ]] || { echo "Backup password file is missing: $password_file" >&2; exit 1; }
[[ "$(stat -c '%a' "$password_file")" == "600" ]] || { echo "Backup password file must have mode 600" >&2; exit 1; }
encrypted="$(realpath "$encrypted")"
(cd "$(dirname "$encrypted")" && sha256sum --check "$(basename "$encrypted").sha256")

repo_root="$(realpath .)"
for target in notebook_data surreal_data; do
  resolved="$(realpath -m "$target")"
  [[ "$resolved" == "$repo_root/"* ]] || { echo "Unsafe restore target: $resolved" >&2; exit 1; }
done

stage="$(mktemp -d)"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$encrypted" -out "$stage/backup.tar.gz" -pass "file:$password_file"
entries="$(tar -tzf "$stage/backup.tar.gz")"
grep -Eq '^\./(bridge_data|notebook_data|surreal_data)/' <<<"$entries" || { echo "Backup layout is invalid" >&2; exit 1; }
if grep -Evq '^(\./)?$|^\./manifest\.txt$|^\./(bridge_data|notebook_data|surreal_data)(/.*)?$' <<<"$entries"; then
  echo "Backup contains an unsafe path" >&2
  exit 1
fi
tar -C "$stage" -xzf "$stage/backup.tar.gz"

"${compose[@]}" stop bridge open-notebook surrealdb >/dev/null
for target in notebook_data surreal_data; do
  mkdir -p "$target"
  find "$target" -mindepth 1 -delete
  cp -a "$stage/$target/." "$target/"
done

bridge_id="$("${compose[@]}" ps -q bridge)"
[[ -n "$bridge_id" ]] || { echo "Bridge container does not exist; deploy before restore" >&2; exit 1; }
"${compose[@]}" run --rm --no-deps --entrypoint sh bridge -c 'find /app/data -mindepth 1 -delete'
docker cp "$stage/bridge_data/." "$bridge_id:/app/data"
"${compose[@]}" up -d
echo "Restore complete. Verify health, Knowledge, pending queues, and a regression query."
