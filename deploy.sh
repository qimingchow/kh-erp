#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/kh-erp}"
APP_PORT="${APP_PORT:-4173}"
APP_HOST="${APP_HOST:-0.0.0.0}"
APP_LOG="${APP_LOG:-kh-erp.log}"
APP_BRANCH="${APP_BRANCH:-main}"
DB_FILE="$APP_DIR/data/kh-erp-db.json"
BACKUP_DIR="$APP_DIR/backups"

cd "$APP_DIR"

echo "1. Checking server tools..."
for cmd in git npm curl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command on server: $cmd" >&2
    exit 1
  }
done

echo "2. Backing up data..."
mkdir -p "$BACKUP_DIR"
if [[ -f "$DB_FILE" ]]; then
  cp "$DB_FILE" "$BACKUP_DIR/kh-erp-db-$(date +%Y%m%d-%H%M%S).json"
fi

echo "3. Updating code from GitHub..."
git fetch origin "$APP_BRANCH"
git checkout "$APP_BRANCH"
git pull --ff-only origin "$APP_BRANCH"

echo "4. Restarting service..."
node_pids="$(ps -eo pid=,comm=,args= | awk '$2 ~ /^(node|nodejs)$/ && $0 ~ /server\/server\.js/ {print $1}' || true)"
if [[ -n "$node_pids" ]]; then
  kill $node_pids || true
  sleep 1
fi

nohup env HOST="$APP_HOST" PORT="$APP_PORT" npm run start > "$APP_LOG" 2>&1 &

echo "5. Verifying health..."
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${APP_PORT}/api/health"; then
    echo
    echo "Deploy complete."
    exit 0
  fi
  sleep 0.5
done

echo "Health check failed. Recent service log:" >&2
tail -n 80 "$APP_LOG" >&2 || true
exit 1
