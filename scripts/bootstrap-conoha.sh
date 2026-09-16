#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DEPLOYMENT_MODE=tunnel exec bash scripts/bootstrap-server.sh