#!/usr/bin/env bash
set -euo pipefail
[[ "$(dpkg --print-architecture)" == "arm64" ]] || { echo "Expected OCI Ampere Arm64" >&2; exit 1; }
cd "$(dirname "$0")/.."
DEPLOYMENT_MODE=tunnel exec bash scripts/bootstrap-server.sh