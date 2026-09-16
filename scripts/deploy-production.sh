#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DEPLOYMENT_MODE=direct exec bash scripts/deploy.sh