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
ssh "$REMOTE" bash -s -- "$REMOTE_DIR" "$REMOTE_BIND" "$REMOTE_PORT" "$REMOTE_LOG" <<'REMOTE_SCRIPT'
set -euo pipefail

remote_dir="$1"
bind="$2"
port="$3"
log_file="$4"

cd "$remote_dir"

node_pids="$(ps -eo pid=,comm=,args= | awk '$2 ~ /^(node|nodejs)$/ && $0 ~ /server\/server\.js/ {print $1}' || true)"
if [[ -n "$node_pids" ]]; then
  kill $node_pids || true
  sleep 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm command not found on remote server." >&2
  exit 1
fi

nohup env HOST="$bind" PORT="$port" npm run start > "$log_file" 2>&1 &
REMOTE_SCRIPT

echo "4. Verifying health..."
ssh "$REMOTE" bash -s -- "$REMOTE_PORT" "$REMOTE_DIR/$REMOTE_LOG" <<'REMOTE_SCRIPT'
set -euo pipefail

port="$1"
log_file="$2"

for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${port}/api/health"; then
    echo
    exit 0
  fi
  sleep 0.5
done

echo "Health check failed. Recent service log:" >&2
tail -n 80 "$log_file" >&2 || true
exit 1
REMOTE_SCRIPT

echo "Deploy complete."
