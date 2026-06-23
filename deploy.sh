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
SSH_OPTIONS=(
  -o PubkeyAuthentication=no
  -o PreferredAuthentications=password
  -o NumberOfPasswordPrompts=3
)

for cmd in git ssh tar; do
  command -v "$cmd" >/dev/null 2>&1 || {
    echo "Missing required command: $cmd" >&2
    exit 1
  }
done

if [[ -n "$(git -C "$ROOT_DIR" status --short)" ]]; then
  echo "Warning: working tree has uncommitted changes; deploying current local files." >&2
fi

REMOTE_DEPLOY_SCRIPT=$(cat <<'REMOTE_SCRIPT'
set -euo pipefail

echo "1. Backing up remote data..."
mkdir -p "$REMOTE_DIR/backups"
if [ -f "$REMOTE_DIR/data/kh-erp-db.json" ]; then
  cp "$REMOTE_DIR/data/kh-erp-db.json" "$REMOTE_DIR/backups/kh-erp-db-$(date +%Y%m%d-%H%M%S).json"
fi

echo "2. Uploading code to server..."
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

tar -xzf - -C "$tmp_dir"
mkdir -p "$REMOTE_DIR"
find "$REMOTE_DIR" -mindepth 1 -maxdepth 1 ! -name data ! -name backups -exec rm -rf {} +
cp -a "$tmp_dir"/. "$REMOTE_DIR"/

echo "3. Restarting remote service..."
cd "$REMOTE_DIR"
node_pids="$(ps -eo pid=,comm=,args= | awk '$2 ~ /^(node|nodejs)$/ && $0 ~ /server\/server\.js/ {print $1}' || true)"
if [[ -n "$node_pids" ]]; then
  kill $node_pids || true
  sleep 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm command not found on remote server." >&2
  exit 1
fi

nohup env HOST="$REMOTE_BIND" PORT="$REMOTE_PORT" npm run start > "$REMOTE_LOG" 2>&1 &

echo "4. Verifying health..."
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${REMOTE_PORT}/api/health"; then
    echo
    echo "Deploy complete."
    exit 0
  fi
  sleep 0.5
done

echo "Health check failed. Recent service log:" >&2
tail -n 80 "$REMOTE_LOG" >&2 || true
exit 1
REMOTE_SCRIPT
)

REMOTE_COMMAND=$(printf "REMOTE_DIR=%q REMOTE_BIND=%q REMOTE_PORT=%q REMOTE_LOG=%q bash -c %q" \
  "$REMOTE_DIR" \
  "$REMOTE_BIND" \
  "$REMOTE_PORT" \
  "$REMOTE_LOG" \
  "$REMOTE_DEPLOY_SCRIPT")

echo "Uploading and deploying through one password SSH session..."
tar -C "$ROOT_DIR" \
  --exclude './.git' \
  --exclude './data' \
  --exclude './backups' \
  --exclude './node_modules' \
  --exclude './*.log' \
  --exclude './.DS_Store' \
  -czf - . | ssh "${SSH_OPTIONS[@]}" "$REMOTE" "$REMOTE_COMMAND"
