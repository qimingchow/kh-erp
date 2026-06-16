#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_USER="${DEPLOY_USER:-root}"
REMOTE_HOST="${DEPLOY_HOST:-118.145.87.70}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/kh-erp}"
REMOTE_PORT="${DEPLOY_PORT:-4173}"
REMOTE_BIND="${DEPLOY_BIND:-0.0.0.0}"
REMOTE_LOG="${DEPLOY_LOG:-kh-erp.log}"
REMOTE="${REMOTE_USER}@${REMOTE_HOST}"

for cmd in git rsync ssh; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
done

if [[ -n "$(git -C "$ROOT_DIR" status --short)" ]]; then
  echo "Working tree is not clean. Commit or stash changes first." >&2
  exit 1
fi

echo "1. Backing up remote data..."
ssh "$REMOTE" "set -e; mkdir -p '$REMOTE_DIR/backups'; if [ -f '$REMOTE_DIR/data/kh-erp-db.json' ]; then cp '$REMOTE_DIR/data/kh-erp-db.json' '$REMOTE_DIR/backups/kh-erp-db-\$(date +%Y%m%d-%H%M%S).json'; fi"

echo "2. Syncing code to server..."
rsync -az --delete \
  --exclude '.git/' \
  --exclude 'data/' \
  --exclude 'backups/' \
  --exclude 'node_modules/' \
  --exclude '*.log' \
  --exclude '.DS_Store' \
  "$ROOT_DIR"/ \
  "$REMOTE:$REMOTE_DIR/"

echo "3. Restarting remote service..."
ssh "$REMOTE" "set -e; cd '$REMOTE_DIR'; pkill -f 'server/server.js' || true; nohup env HOST='$REMOTE_BIND' PORT='$REMOTE_PORT' npm run start > '$REMOTE_LOG' 2>&1 &"

echo "4. Verifying health..."
ssh "$REMOTE" "curl -fsS http://127.0.0.1:$REMOTE_PORT/api/health"

echo "Deploy complete."
