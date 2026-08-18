#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -f "$ROOT/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3780}"
exec node "$ROOT/server/src/index.js"
