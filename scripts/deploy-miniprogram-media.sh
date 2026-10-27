#!/usr/bin/env bash
# Publish only mini-program images; no app restart, dependency install or data writes.
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_HOST="${DEPLOY_HOST:-140.143.171.77}"
TASK_USER="${DEPLOY_USER:-ubuntu}"
TASK_DIR="${DEPLOY_DIR:-/var/www/beiyexing}"
TASK_KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
TASK_SOURCE="$TASK_ROOT/server/public/static/miniprogram"
if [ "$TASK_HOST" = "192.144.167.212" ]; then
  echo "Refusing retired host 192.144.167.212" >&2
  exit 1
fi
test -d "$TASK_SOURCE"
ssh -i "$TASK_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10 \
  "$TASK_USER@$TASK_HOST" "mkdir -p '$TASK_DIR/server/public/static/miniprogram'"
# No --delete: assets used by already released clients must remain available.
rsync -az --checksum --timeout=120 \
  -e "ssh -i $TASK_KEY -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=10" \
  "$TASK_SOURCE/" "$TASK_USER@$TASK_HOST:$TASK_DIR/server/public/static/miniprogram/"
echo "Static images synced to ${PUBLIC_URL:-https://togetherbetter.cn}/static/miniprogram/"
