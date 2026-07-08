#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-status}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_NAME="com.kh-erp.nas-mount.plist"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME"
LOG_DIR="$HOME/.kh-erp"
LOG_FILE="$LOG_DIR/nas-mount.log"
ERR_FILE="$LOG_DIR/nas-mount.err.log"

install_agent() {
  mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.kh-erp.nas-mount</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PROJECT_ROOT/scripts/nas-macos.sh</string>
    <string>mount</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>StandardOutPath</key>
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$ERR_FILE</string>
  <key>WorkingDirectory</key>
  <string>$PROJECT_ROOT</string>
</dict>
</plist>
EOF

  chmod 644 "$PLIST_PATH"
  launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
  launchctl load "$PLIST_PATH"
  echo "Installed and loaded LaunchAgent: $PLIST_PATH"
  echo "Logs: $LOG_FILE"
}

uninstall_agent() {
  if [[ -f "$PLIST_PATH" ]]; then
    launchctl unload "$PLIST_PATH" >/dev/null 2>&1 || true
    rm -f "$PLIST_PATH"
    echo "Removed LaunchAgent: $PLIST_PATH"
  else
    echo "LaunchAgent is not installed: $PLIST_PATH"
  fi
}

status_agent() {
  if [[ -f "$PLIST_PATH" ]]; then
    echo "LaunchAgent file exists: $PLIST_PATH"
  else
    echo "LaunchAgent file does not exist: $PLIST_PATH"
  fi
  launchctl list | grep 'com.kh-erp.nas-mount' || true
  if [[ -f "$LOG_FILE" ]]; then
    echo
    echo "Recent output:"
    tail -n 20 "$LOG_FILE"
  fi
  if [[ -f "$ERR_FILE" && -s "$ERR_FILE" ]]; then
    echo
    echo "Recent errors:"
    tail -n 20 "$ERR_FILE"
  fi
}

case "$ACTION" in
  install)
    install_agent
    ;;
  uninstall)
    uninstall_agent
    ;;
  status)
    status_agent
    ;;
  *)
    echo "Usage: $0 {install|uninstall|status}" >&2
    exit 1
    ;;
esac
