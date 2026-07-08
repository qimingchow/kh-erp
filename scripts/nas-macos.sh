#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${KH_ERP_NAS_ENV:-$HOME/.kh-erp/nas.local.env}"
ACTION="${1:-status}"

show_config_help() {
  cat <<EOF
Missing local NAS config: $CONFIG_FILE

Create it with:

  mkdir -p "$HOME/.kh-erp"
  cat > "$CONFIG_FILE" <<'NASCONF'
NAS_SMB_HOST=192.168.1.10
NAS_SMB_USER=your-user
NAS_SMB_PASSWORD='your-password'
NAS_TESTER_SMB_SHARE=团队文件-测试机
NAS_SORTER_SMB_SHARE=团队文件-分选机
NAS_MOUNT_ROOT=$HOME/kh-erp-nas
NAS_TESTER_DIR=测试机
NAS_SORTER_DIR=分选机
NASCONF
  chmod 600 "$CONFIG_FILE"

Then run:

  ./scripts/nas-macos.sh shares
  ./scripts/nas-macos.sh mount
  ./scripts/nas-macos.sh status
EOF
}

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This helper is for macOS local SMB mounting. Use /etc/fstab on Linux servers." >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  show_config_help
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

NAS_SMB_HOST="${NAS_SMB_HOST:-}"
NAS_SMB_SHARE="${NAS_SMB_SHARE:-}"
NAS_SMB_USER="${NAS_SMB_USER:-}"
NAS_SMB_PASSWORD="${NAS_SMB_PASSWORD:-}"
NAS_SMB_URL="${NAS_SMB_URL:-}"
NAS_MOUNT_POINT="${NAS_MOUNT_POINT:-$HOME/kh-erp-nas}"
NAS_SUB_PATH="${NAS_SUB_PATH:-}"
NAS_TESTER_SMB_URL="${NAS_TESTER_SMB_URL:-}"
NAS_SORTER_SMB_URL="${NAS_SORTER_SMB_URL:-}"
NAS_TESTER_SMB_SHARE="${NAS_TESTER_SMB_SHARE:-}"
NAS_SORTER_SMB_SHARE="${NAS_SORTER_SMB_SHARE:-}"
NAS_MOUNT_ROOT="${NAS_MOUNT_ROOT:-$HOME/kh-erp-nas}"
NAS_TESTER_DIR="${NAS_TESTER_DIR:-测试机}"
NAS_SORTER_DIR="${NAS_SORTER_DIR:-分选机}"
NAS_TESTER_MOUNT_POINT="${NAS_TESTER_MOUNT_POINT:-$NAS_MOUNT_ROOT/$NAS_TESTER_DIR}"
NAS_SORTER_MOUNT_POINT="${NAS_SORTER_MOUNT_POINT:-$NAS_MOUNT_ROOT/$NAS_SORTER_DIR}"

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Missing required config: $name" >&2
    exit 1
  fi
}

use_dual_share_mode() {
  [[ -n "$NAS_TESTER_SMB_URL" || -n "$NAS_SORTER_SMB_URL" || -n "$NAS_TESTER_SMB_SHARE" || -n "$NAS_SORTER_SMB_SHARE" ]]
}

is_path_mounted() {
  local mount_point="$1"
  mount | grep -F " on $mount_point " >/dev/null 2>&1
}

is_mounted() {
  is_path_mounted "$NAS_MOUNT_POINT"
}

erp_path() {
  if use_dual_share_mode; then
    printf "%s\n" "$NAS_MOUNT_ROOT"
    return
  fi
  if [[ -n "$NAS_SUB_PATH" ]]; then
    printf "%s/%s\n" "$NAS_MOUNT_POINT" "$NAS_SUB_PATH"
  else
    printf "%s\n" "$NAS_MOUNT_POINT"
  fi
}

smb_url_has_share() {
  local url="$1"
  local without_prefix="${url#//}"
  local after_host="${without_prefix#*/}"
  [[ "$after_host" != "$without_prefix" && -n "${after_host%/}" ]]
}

url_encode_component() {
  local input="$1"
  local output=""
  local i char encoded byte
  local LC_ALL=C
  for ((i = 0; i < ${#input}; i += 1)); do
    char="${input:i:1}"
    case "$char" in
      [a-zA-Z0-9.~_-])
        output+="$char"
        ;;
      *)
        printf -v byte '%d' "'$char"
        printf -v encoded '%%%02X' "$((byte & 255))"
        output+="$encoded"
        ;;
    esac
  done
  printf "%s\n" "$output"
}

build_smb_url() {
  local host="$1"
  local user="$2"
  local password="$3"
  local share="$4"
  printf "//%s:%s@%s/%s\n" \
    "$(url_encode_component "$user")" \
    "$(url_encode_component "$password")" \
    "$host" \
    "$(url_encode_component "$share")"
}

normalize_smb_url() {
  local url="${1/#smb:\/\//\/\/}"
  if [[ "$url" =~ ^//([^/:@]+):([^@]*)@([^/]+)/(.+)$ ]]; then
    printf "//%s:%s@%s/%s\n" \
      "$(url_encode_component "${BASH_REMATCH[1]}")" \
      "$(url_encode_component "${BASH_REMATCH[2]}")" \
      "${BASH_REMATCH[3]}" \
      "$(url_encode_component "${BASH_REMATCH[4]}")"
    return
  fi
  if [[ "$url" =~ ^//([^/@]+)@([^/]+)/(.+)$ ]]; then
    printf "//%s@%s/%s\n" \
      "$(url_encode_component "${BASH_REMATCH[1]}")" \
      "${BASH_REMATCH[2]}" \
      "$(url_encode_component "${BASH_REMATCH[3]}")"
    return
  fi
  if [[ "$url" =~ ^//([^/]+)/(.+)$ ]]; then
    printf "//%s/%s\n" "${BASH_REMATCH[1]}" "$(url_encode_component "${BASH_REMATCH[2]}")"
    return
  fi
  printf "%s\n" "$url"
}

smb_share_url() {
  local label="$1"
  local raw_url="$2"
  local share="$3"
  if [[ -n "$share" ]]; then
    require_value "NAS_SMB_HOST" "$NAS_SMB_HOST"
    require_value "NAS_SMB_USER" "$NAS_SMB_USER"
    require_value "NAS_SMB_PASSWORD" "$NAS_SMB_PASSWORD"
    build_smb_url "$NAS_SMB_HOST" "$NAS_SMB_USER" "$NAS_SMB_PASSWORD" "$share"
    return
  fi
  if [[ -n "$raw_url" ]]; then
    normalize_smb_url "$raw_url"
    return
  fi
  require_value "NAS_SMB_HOST" "$NAS_SMB_HOST"
  require_value "NAS_SMB_USER" "$NAS_SMB_USER"
  require_value "NAS_SMB_PASSWORD" "$NAS_SMB_PASSWORD"
  require_value "$label share" "$share"
}

smb_server_url_from_url() {
  local url="$1"
  local without_prefix="${url#//}"
  local host_part="${without_prefix%%/*}"
  if [[ "$host_part" == "$without_prefix" ]]; then
    printf "%s\n" "$url"
  else
    printf "//%s\n" "$host_part"
  fi
}

view_url() {
  if [[ -n "${NAS_SMB_VIEW_URL:-}" ]]; then
    printf "%s\n" "$NAS_SMB_VIEW_URL"
    return
  fi
  if [[ -n "$NAS_TESTER_SMB_URL" ]]; then
    smb_server_url_from_url "$NAS_TESTER_SMB_URL"
    return
  fi
  if [[ -n "$NAS_SORTER_SMB_URL" ]]; then
    smb_server_url_from_url "$NAS_SORTER_SMB_URL"
    return
  fi
  if [[ -n "$NAS_SMB_URL" ]]; then
    smb_server_url_from_url "$NAS_SMB_URL"
    return
  fi
  if [[ -n "$NAS_SMB_HOST" && -n "$NAS_SMB_USER" && -n "$NAS_SMB_PASSWORD" ]]; then
    printf "//%s:%s@%s\n" "$(url_encode_component "$NAS_SMB_USER")" "$(url_encode_component "$NAS_SMB_PASSWORD")" "$NAS_SMB_HOST"
    return
  fi
  printf "%s\n" "$NAS_SMB_URL"
}

print_status() {
  if use_dual_share_mode; then
    echo "Dual-share NAS mode:"
    if is_path_mounted "$NAS_TESTER_MOUNT_POINT"; then
      echo "Tester share mounted:"
      mount | grep -F " on $NAS_TESTER_MOUNT_POINT "
    else
      echo "Tester share is not mounted at: $NAS_TESTER_MOUNT_POINT"
    fi
    if is_path_mounted "$NAS_SORTER_MOUNT_POINT"; then
      echo "Sorter share mounted:"
      mount | grep -F " on $NAS_SORTER_MOUNT_POINT "
    else
      echo "Sorter share is not mounted at: $NAS_SORTER_MOUNT_POINT"
    fi
  else
    if is_mounted; then
      echo "NAS is mounted:"
      mount | grep -F " on $NAS_MOUNT_POINT "
    else
      echo "NAS is not mounted at: $NAS_MOUNT_POINT"
    fi
  fi
  echo "ERP NAS path:"
  erp_path
  if [[ -d "$(erp_path)" ]]; then
    echo "Path exists. First entries:"
    ls -la "$(erp_path)" | sed -n '1,12p'
  else
    echo "Path does not exist yet. Check NAS_SUB_PATH or mount status."
  fi
}

list_shares() {
  local url
  url="$(view_url)"
  if [[ -z "$url" ]]; then
    echo "Missing NAS_SMB_URL, or NAS_SMB_HOST/NAS_SMB_USER/NAS_SMB_PASSWORD." >&2
    exit 1
  fi
  echo "Listing SMB shares from NAS..."
  smbutil view "$url"
}

print_finder_urls() {
  if [[ -z "$NAS_SMB_HOST" ]]; then
    return
  fi
  echo "Finder test URLs:"
  if [[ -n "$NAS_TESTER_SMB_SHARE" ]]; then
    echo "  smb://$NAS_SMB_HOST/$NAS_TESTER_SMB_SHARE"
  fi
  if [[ -n "$NAS_SORTER_SMB_SHARE" ]]; then
    echo "  smb://$NAS_SMB_HOST/$NAS_SORTER_SMB_SHARE"
  fi
}

doctor() {
  echo "NAS config:"
  echo "  host: ${NAS_SMB_HOST:-not set}"
  echo "  user: ${NAS_SMB_USER:-not set}"
  echo "  tester share: ${NAS_TESTER_SMB_SHARE:-${NAS_TESTER_SMB_URL:-not set}}"
  echo "  sorter share: ${NAS_SORTER_SMB_SHARE:-${NAS_SORTER_SMB_URL:-not set}}"
  echo "  ERP path: $(erp_path)"
  echo
  print_status
  echo
  print_finder_urls
  echo

  if [[ -n "$NAS_SMB_HOST" ]]; then
    echo "Checking SMB TCP port 445..."
    if nc -G 5 -vz "$NAS_SMB_HOST" 445; then
      echo "Port 445 is reachable."
    else
      echo "Port 445 is not reachable. Check LAN/VPN, NAS SMB service, firewall, or NAS IP."
    fi
    echo
  fi

  echo "Listing SMB shares..."
  if list_shares; then
    echo "Share listing succeeded."
  else
    echo "Share listing failed. If browser zconnect works but this fails, the SMB service is not reachable from this Mac."
  fi
}

validate_smb_share_url() {
  local url="$1"
  local label="$2"
  if ! smb_url_has_share "$url"; then
    cat <<EOF >&2
$label SMB URL is missing the SMB share name.

SMB mount needs a share, for example:

  NAS_SMB_HOST=192.168.0.233
  NAS_SMB_USER=user
  NAS_SMB_PASSWORD='password'
  NAS_TESTER_SMB_SHARE=团队文件-测试机
  NAS_SORTER_SMB_SHARE=团队文件-分选机

Run this to list available SMB shares:

  ./scripts/nas-macos.sh shares
EOF
    exit 1
  fi
}

mount_share() {
  local label="$1"
  local url="$2"
  local mount_point="$3"
  require_value "$label URL" "$url"
  validate_smb_share_url "$url" "$label"
  mkdir -p "$mount_point"
  if is_path_mounted "$mount_point"; then
    echo "$label already mounted at: $mount_point"
    return
  fi
  echo "Mounting $label to: $mount_point"
  mount_smbfs "$url" "$mount_point"
}

mount_nas() {
  if use_dual_share_mode; then
    mkdir -p "$NAS_MOUNT_ROOT"
    local tester_url
    local sorter_url
    local failed=0
    tester_url="$(smb_share_url "Tester share" "$NAS_TESTER_SMB_URL" "$NAS_TESTER_SMB_SHARE")"
    sorter_url="$(smb_share_url "Sorter share" "$NAS_SORTER_SMB_URL" "$NAS_SORTER_SMB_SHARE")"
    mount_share "Tester share" "$tester_url" "$NAS_TESTER_MOUNT_POINT" || failed=1
    mount_share "Sorter share" "$sorter_url" "$NAS_SORTER_MOUNT_POINT" || failed=1
    print_status
    if [[ "$failed" -ne 0 ]]; then
      exit 1
    fi
    return
  fi

  if [[ -z "$NAS_SMB_URL" ]]; then
    require_value "NAS_SMB_HOST" "$NAS_SMB_HOST"
    require_value "NAS_SMB_SHARE" "$NAS_SMB_SHARE"
    require_value "NAS_SMB_USER" "$NAS_SMB_USER"
    require_value "NAS_SMB_PASSWORD" "$NAS_SMB_PASSWORD"
    NAS_SMB_URL="$(build_smb_url "$NAS_SMB_HOST" "$NAS_SMB_USER" "$NAS_SMB_PASSWORD" "$NAS_SMB_SHARE")"
  else
    NAS_SMB_URL="$(normalize_smb_url "$NAS_SMB_URL")"
  fi

  if ! smb_url_has_share "$NAS_SMB_URL"; then
    cat <<EOF >&2
NAS_SMB_URL is missing the SMB share name.

Current URL only points to the NAS host. SMB mount needs a share, for example:

  NAS_SMB_URL="//user:password@192.168.0.233/团队空间"
  NAS_SUB_PATH=""

Or if the share opens above 团队空间:

  NAS_SMB_URL="//user:password@192.168.0.233/share-name"
  NAS_SUB_PATH="团队空间"

Run this to list available SMB shares:

  ./scripts/nas-macos.sh shares
EOF
    exit 1
  fi

  mkdir -p "$NAS_MOUNT_POINT"
  if is_mounted; then
    echo "NAS already mounted at: $NAS_MOUNT_POINT"
    print_status
    exit 0
  fi

  mount_smbfs "$NAS_SMB_URL" "$NAS_MOUNT_POINT"
  print_status
}

unmount_nas() {
  if use_dual_share_mode; then
    if is_path_mounted "$NAS_SORTER_MOUNT_POINT"; then
      umount "$NAS_SORTER_MOUNT_POINT"
      echo "Unmounted: $NAS_SORTER_MOUNT_POINT"
    else
      echo "Sorter share is not mounted at: $NAS_SORTER_MOUNT_POINT"
    fi
    if is_path_mounted "$NAS_TESTER_MOUNT_POINT"; then
      umount "$NAS_TESTER_MOUNT_POINT"
      echo "Unmounted: $NAS_TESTER_MOUNT_POINT"
    else
      echo "Tester share is not mounted at: $NAS_TESTER_MOUNT_POINT"
    fi
    return
  fi

  if is_mounted; then
    umount "$NAS_MOUNT_POINT"
    echo "Unmounted: $NAS_MOUNT_POINT"
  else
    echo "NAS is not mounted at: $NAS_MOUNT_POINT"
  fi
}

case "$ACTION" in
  shares)
    list_shares
    ;;
  mount)
    mount_nas
    ;;
  status)
    print_status
    ;;
  doctor)
    doctor
    ;;
  unmount)
    unmount_nas
    ;;
  *)
    echo "Usage: $0 {shares|mount|status|doctor|unmount}" >&2
    exit 1
    ;;
esac
