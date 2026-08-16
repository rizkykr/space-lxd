#!/usr/bin/env bash
# ==============================================================================
# Space LXD Dashboard - Clean Uninstall & Data Purge Script
# Opsi: Uninstall lokal saja, atau uninstall ke seluruh node cluster
# ==============================================================================

COLOR_RESET="\033[0m"
COLOR_RED="\033[1;31m"
COLOR_YELLOW="\033[1;33m"
COLOR_GREEN="\033[1;32m"
COLOR_BOLD="\033[1m"
COLOR_CYAN="\033[1;36m"
COLOR_DIM="\033[2m"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null && pwd)"
MASTER_URL="http://localhost:${PORT:-9090}"

# ── Auto-elevate to root (sudo) ───────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    exec sudo bash "$0" "$@"
  else
    echo -e "${COLOR_RED}[ERROR] Script uninstall harus dijalankan sebagai root (sudo bash $0)${COLOR_RESET}"
    exit 1
  fi
fi

info()    { echo -e "${COLOR_CYAN}[INFO]${COLOR_RESET} $1"; }
warn()    { echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET} $1"; }
success() { echo -e "${COLOR_GREEN}[OK]${COLOR_RESET}   $1"; }
danger()  { echo -e "${COLOR_RED}[!!!]${COLOR_RESET} $1"; }

# ── Ambil daftar node dari API (jika master masih running) ─────────────────────
get_all_nodes() {
  # Parse custom_ip_domain first, otherwise fallback to ip from API JSON
  curl -s --max-time 5 "${MASTER_URL}/api/nodes" 2>/dev/null | grep -o '{[^{}]*}' | while read -r line; do
    custom_dom=$(echo "$line" | grep -o '"custom_ip_domain":"[^"]*' | cut -d'"' -f4)
    raw_ip=$(echo "$line" | grep -o '"ip":"[^"]*' | cut -d'"' -f4)
    if [ -n "$custom_dom" ]; then
      echo "$custom_dom"
    elif [ -n "$raw_ip" ]; then
      echo "$raw_ip"
    fi
  done
}

# ── Uninstall agent di node worker via SSH ─────────────────────────────────────
remote_uninstall_node() {
  local NODE_IP="$1"
  local REQ_KEY="$2"

  info "Menghapus agent di node ${NODE_IP}..."

  SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=yes"

  POSSIBLE_KEYS=(
    "$REQ_KEY"
    "/home/space-lxd/.ssh/id_ed25519"
    "/var/lib/space-lxd/.ssh/id_ed25519"
    "${HOME}/.ssh/id_ed25519"
    "${HOME}/.ssh/id_rsa"
    "/root/.ssh/id_ed25519"
    "/root/.ssh/id_rsa"
  )

  for SSH_KEY in "${POSSIBLE_KEYS[@]}"; do
    [ -z "$SSH_KEY" ] && continue
    [ ! -f "$SSH_KEY" ] && continue

    for SSH_USER in space-lxd root; do
      if ssh $SSH_OPTS -i "${SSH_KEY}" "${SSH_USER}@${NODE_IP}" "echo connected" &>/dev/null 2>&1; then

      ssh $SSH_OPTS -i "${SSH_KEY}" "${SSH_USER}@${NODE_IP}" bash <<'REMOTE_SCRIPT'
set -e
echo "  → Stopping agent service..."
systemctl stop lxd-manager-agent 2>/dev/null || true
systemctl disable lxd-manager-agent 2>/dev/null || true
rm -f /etc/systemd/system/lxd-manager-agent.service
systemctl daemon-reload

echo "  → Removing agent binary..."
rm -f /usr/local/bin/lxd-manager-agent

echo "  → Removing agent config..."
rm -rf /etc/lxd-manager

echo "  → Removing service user space-lxd..."
userdel -r space-lxd 2>/dev/null || true

echo "  ✅ Node agent uninstall selesai."
REMOTE_SCRIPT
      success "Node ${NODE_IP} berhasil diuninstall."
      return 0
    fi
  done
  done

  # Fallback try standard SSH agent / default identities
  for SSH_USER in space-lxd root; do
    if ssh $SSH_OPTS "${SSH_USER}@${NODE_IP}" "echo connected" &>/dev/null 2>&1; then
      ssh $SSH_OPTS "${SSH_USER}@${NODE_IP}" bash <<'REMOTE_SCRIPT'
set -e
echo "  → Stopping agent service..."
systemctl stop lxd-manager-agent 2>/dev/null || true
systemctl disable lxd-manager-agent 2>/dev/null || true
rm -f /etc/systemd/system/lxd-manager-agent.service
systemctl daemon-reload

echo "  → Removing agent binary..."
rm -f /usr/local/bin/lxd-manager-agent

echo "  → Removing agent config..."
rm -rf /etc/lxd-manager

echo "  → Removing service user space-lxd..."
userdel -r space-lxd 2>/dev/null || true

echo "  ✅ Node agent uninstall selesai."
REMOTE_SCRIPT
      success "Node ${NODE_IP} berhasil diuninstall."
      return 0
    fi
  done

  warn "Tidak bisa SSH ke ${NODE_IP}. Lewati node ini (uninstall manual diperlukan)."
  return 1
}

# ── Hapus semua LXD container di node worker via SSH ──────────────────────────
remote_purge_lxds() {
  local NODE_IP="$1"
  local REQ_KEY="$2"

  SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=yes"
  POSSIBLE_KEYS=(
    "$REQ_KEY"
    "/home/space-lxd/.ssh/id_ed25519"
    "/var/lib/space-lxd/.ssh/id_ed25519"
    "${HOME}/.ssh/id_ed25519"
    "${HOME}/.ssh/id_rsa"
    "/root/.ssh/id_ed25519"
    "/root/.ssh/id_rsa"
  )

  for SSH_KEY in "${POSSIBLE_KEYS[@]}"; do
    [ -z "$SSH_KEY" ] && continue
    [ ! -f "$SSH_KEY" ] && continue

    for SSH_USER in space-lxd root; do
      if ssh $SSH_OPTS -i "${SSH_KEY}" "${SSH_USER}@${NODE_IP}" "echo connected" &>/dev/null 2>&1; then
        ssh $SSH_OPTS -i "${SSH_KEY}" "${SSH_USER}@${NODE_IP}" bash <<'REMOTE_SCRIPT'
if command -v lxc &>/dev/null; then
  for c in $(lxc list -c n --format csv 2>/dev/null); do
    [ -n "$c" ] && lxc delete "$c" --force 2>/dev/null && echo "  → Deleted LXD: $c" || true
  done
fi
REMOTE_SCRIPT
        return 0
      fi
    done
  done

  # Fallback try standard SSH agent / default identities
  for SSH_USER in space-lxd root; do
    if ssh $SSH_OPTS "${SSH_USER}@${NODE_IP}" "echo connected" &>/dev/null 2>&1; then
      ssh $SSH_OPTS "${SSH_USER}@${NODE_IP}" bash <<'REMOTE_SCRIPT'
if command -v lxc &>/dev/null; then
  for c in $(lxc list -c n --format csv 2>/dev/null); do
    [ -n "$c" ] && lxc delete "$c" --force 2>/dev/null && echo "  → Deleted LXD: $c" || true
  done
fi
REMOTE_SCRIPT
      return 0
    fi
  done

  warn "Tidak bisa SSH ke ${NODE_IP} untuk hapus LXDs."
}

# ── Uninstall lokal (Master/Agent di server ini) ───────────────────────────────
local_uninstall() {
  local PURGE_LXDS="$1"

  info "[1/5] Menghentikan proses & Systemd Service..."
  systemctl stop lxd-manager-master 2>/dev/null || true
  systemctl disable lxd-manager-master 2>/dev/null || true
  systemctl stop lxd-manager-agent 2>/dev/null || true
  systemctl disable lxd-manager-agent 2>/dev/null || true

  rm -f /etc/systemd/system/lxd-manager-master.service
  rm -f /etc/systemd/system/lxd-manager-agent.service
  systemctl daemon-reload
  pkill -9 -f lxd-manager-master 2>/dev/null || true
  pkill -9 -f lxd-manager-agent 2>/dev/null || true
  success "Service dihentikan."

  info "[2/5] Menghapus executable CLI..."
  rm -f /usr/local/bin/space-lxd 2>/dev/null || true
  rm -f /usr/local/bin/lxd-manager-agent 2>/dev/null || true
  success "CLI binary dihapus."

  info "[3/5] Menghapus Database & Konfigurasi..."
  cd "${ROOT_DIR}" 2>/dev/null || true
  rm -f lxd-manager.db* 2>/dev/null || true
  rm -rf bin/ 2>/dev/null || true
  rm -f lxd-manager-agent 2>/dev/null || true
  rm -rf /etc/lxd-manager 2>/dev/null || true
  success "Database & konfigurasi dihapus."

  info "[4/5] Menghapus service user 'space-lxd'..."
  userdel -r space-lxd 2>/dev/null || true
  rm -rf /home/space-lxd 2>/dev/null || true
  rm -rf /var/lib/space-lxd 2>/dev/null || true
  success "Service user 'space-lxd' dihapus."

  if [[ "$PURGE_LXDS" == "y" || "$PURGE_LXDS" == "Y" ]]; then
    info "[5/5] Menghapus seluruh LXD Containers pada host ini..."
    if command -v lxc >/dev/null 2>&1; then
      for c in $(lxc list -c n --format csv 2>/dev/null); do
        [ -n "$c" ] && lxc delete "$c" --force 2>/dev/null && echo "  → Deleted: $c" || true
      done
    fi
    success "Seluruh LXD Container dihapus."
  else
    info "[5/5] LXD Container dibiarkan tetap ada di host."
  fi

  echo ""
  echo -e "${COLOR_GREEN}${COLOR_BOLD}"
  echo "======================================================================"
  echo "✅ UNINSTALL LOKAL SELESAI!"
  echo "======================================================================"
  echo -e "${COLOR_RESET}"
}

# ── Menu Utama Uninstall ───────────────────────────────────────────────────────
main() {
  echo -e "${COLOR_RED}${COLOR_BOLD}"
  echo "⚠️  SPACE LXD DASHBOARD - UNINSTALL MANAGER ⚠️"
  echo "======================================================================"
  echo -e "${COLOR_RESET}"
  echo "Pilih mode uninstall:"
  echo ""
  echo -e "  ${COLOR_BOLD}[1]${COLOR_RESET} 🖥️  Uninstall lokal saja"
  echo -e "         → Hapus service, binary, DB, dan user hanya di server ini"
  echo ""
  echo -e "  ${COLOR_BOLD}[2]${COLOR_RESET} 🌐  Uninstall semua node (Cluster-wide)"
  echo -e "         → Hapus agent di semua worker node via SSH + hapus lokal"
  echo ""
  echo -e "  ${COLOR_BOLD}[0]${COLOR_RESET} 🚪  Batal"
  echo ""
  read -rp "Pilihan [0-2]: " MODE

  case "$MODE" in
    0)
      echo "Dibatalkan."
      exit 0
      ;;

    1)
      # ── Mode: Uninstall Lokal ───────────────────────────────────────────────
      echo ""
      echo -e "${COLOR_YELLOW}${COLOR_BOLD}MODE: UNINSTALL LOKAL${COLOR_RESET}"
      echo "Akan dihapus dari server ini:"
      echo "  • Service lxd-manager-master & lxd-manager-agent"
      echo "  • Binary, database, konfigurasi (/etc/lxd-manager)"
      echo "  • Service user 'space-lxd' & home directory"
      echo "  • CLI /usr/local/bin/space-lxd"
      echo ""
      read -rp "Hapus juga semua LXD Container di host ini? (y/N): " PURGE_LXDS
      read -rp "Ketik 'UNINSTALL' untuk melanjutkan: " CONFIRM

      if [ "$CONFIRM" != "UNINSTALL" ]; then
        echo "Dibatalkan."
        exit 0
      fi

      local_uninstall "$PURGE_LXDS"
      ;;

    2)
      # ── Mode: Cluster-Wide Uninstall ────────────────────────────────────────
      echo ""
      echo -e "${COLOR_RED}${COLOR_BOLD}MODE: UNINSTALL CLUSTER-WIDE${COLOR_RESET}"
      echo ""

      # Ambil daftar node dari API
      info "Mengambil daftar node dari Master API..."
      ALL_NODE_IPS=$(get_all_nodes)
      NODE_COUNT=$(echo "$ALL_NODE_IPS" | grep -c '[0-9]' 2>/dev/null || echo "0")

      if [[ -z "$ALL_NODE_IPS" || "$NODE_COUNT" -eq 0 ]]; then
        warn "Tidak bisa mengambil daftar node (Master mungkin sudah mati)."
        echo ""
        echo "Masukkan IP node worker secara manual (pisahkan spasi, kosongkan jika tidak ada):"
        read -rp "Worker IPs: " MANUAL_IPS
        ALL_NODE_IPS="$MANUAL_IPS"
      fi

      echo ""
      echo "Node yang akan di-uninstall agent-nya:"
      for ip in $ALL_NODE_IPS; do
        echo "  • $ip"
      done
      echo ""

      # Auto-detect SSH Key (smart resolution)
      SSH_KEY=""
      POSSIBLE_KEYS=(
        "/home/space-lxd/.ssh/id_ed25519"
        "/var/lib/space-lxd/.ssh/id_ed25519"
        "${HOME}/.ssh/id_ed25519"
        "${HOME}/.ssh/id_rsa"
        "/root/.ssh/id_ed25519"
        "/root/.ssh/id_rsa"
      )
      for k in "${POSSIBLE_KEYS[@]}"; do
        if [ -f "$k" ]; then
          SSH_KEY="$k"
          break
        fi
      done

      read -rp "Hapus juga semua LXD Container di semua node? (y/N): " PURGE_LXDS
      echo ""
      echo -e "${COLOR_RED}⚠️ PERINGATAN: Ini akan menghapus agent dari SEMUA ${NODE_COUNT} node!${COLOR_RESET}"
      read -rp "Ketik 'UNINSTALL-ALL' untuk melanjutkan: " CONFIRM

      if [ "$CONFIRM" != "UNINSTALL-ALL" ]; then
        echo "Dibatalkan."
        exit 0
      fi

      echo ""
      info "Memulai uninstall di semua worker nodes..."
      echo "======================================================================"

      for NODE_IP in $ALL_NODE_IPS; do
        echo ""
        echo -e "${COLOR_BOLD}── Node: ${NODE_IP} ──${COLOR_RESET}"
        # Skip IP lokal (master sendiri)
        LOCAL_IPS=$(hostname -I 2>/dev/null || echo "")
        if echo "$LOCAL_IPS" | grep -qw "$NODE_IP"; then
          info "Skip ${NODE_IP} (ini adalah server lokal/master)."
          continue
        fi

        if [[ "$PURGE_LXDS" == "y" || "$PURGE_LXDS" == "Y" ]]; then
          remote_purge_lxds "$NODE_IP" "$SSH_KEY"
        fi
        remote_uninstall_node "$NODE_IP" "$SSH_KEY"
      done

      echo ""
      info "Sekarang menghapus Master node (server ini)..."
      echo "======================================================================"
      local_uninstall "$PURGE_LXDS"

      echo -e "${COLOR_GREEN}${COLOR_BOLD}"
      echo "======================================================================"
      echo "✅ CLUSTER-WIDE UNINSTALL SELESAI!"
      echo "   Semua node telah dibersihkan dari Space LXD Agent."
      echo "======================================================================"
      echo -e "${COLOR_RESET}"
      ;;

    *)
      echo "Pilihan tidak valid."
      exit 1
      ;;
  esac
}

main "$@"
