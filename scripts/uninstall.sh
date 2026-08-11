#!/usr/bin/env bash
# ==============================================================================
# Space LXD Dashboard - Total Clean Uninstall & Data Purge Script
# ==============================================================================
set -e

COLOR_RESET="\033[0m"
COLOR_RED="\033[1;31m"
COLOR_YELLOW="\033[1;33m"
COLOR_GREEN="\033[1;32m"
COLOR_BOLD="\033[1m"
COLOR_CYAN="\033[1;36m"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." 2>/dev/null || pwd)"

echo -e "${COLOR_RED}${COLOR_BOLD}"
echo "⚠️  PERINGATAN: TOTAL UNINSTALL & PURGE DATA SPACE LXD DASHBOARD ⚠️"
echo "======================================================================"
echo -e "${COLOR_RESET}"
echo "Proses ini akan menghapus:"
echo "  1. Systemd Service 'lxd-manager-master.service'"
echo "  2. Biner terpasang dan executable '/usr/local/bin/space-lxd'"
echo "  3. Database SQLite (lxd-manager.db, *.db-wal, *.db-shm)"
echo "  4. Biner terkompilasi (bin/lxd-manager-master, bin/lxd-manager-agent)"
echo ""

read -p "Apakah Anda ingin MENGHAPUS JUGA seluruh LXD Container yang dibuat oleh dashboard ini? (y/N): " purge_lxds
read -p "Ketik 'UNINSTALL' (huruf besar) untuk melanjutkan penghapusan total: " confirm

if [ "$confirm" != "UNINSTALL" ]; then
  echo -e "${COLOR_YELLOW}Pembatalan uninstallation. Tidak ada data yang dihapus.${COLOR_RESET}"
  exit 0
fi

echo -e "\n${COLOR_YELLOW}🛑 [1/5] Menghentikan proses dan Systemd Service...${COLOR_RESET}"
sudo systemctl stop lxd-manager-master 2>/dev/null || true
sudo systemctl disable lxd-manager-master 2>/dev/null || true

if [ -f /etc/systemd/system/lxd-manager-master.service ]; then
  sudo rm -f /etc/systemd/system/lxd-manager-master.service
  sudo systemctl daemon-reload
  echo "✅ Systemd service file dihapus."
fi

pkill -9 -f lxd-manager-master 2>/dev/null || true
pkill -9 -f lxd-manager-agent 2>/dev/null || true

echo -e "${COLOR_YELLOW}🧹 [2/5] Menghapus executable CLI /usr/local/bin/space-lxd...${COLOR_RESET}"
sudo rm -f /usr/local/bin/space-lxd 2>/dev/null || true

echo -e "${COLOR_YELLOW}🗄️ [3/5] Menghapus Database SQLite dan Cache...${COLOR_RESET}"
cd "$ROOT_DIR"
rm -f lxd-manager.db* 2>/dev/null || true
rm -rf bin/ 2>/dev/null || true
rm -f lxd-manager-agent 2>/dev/null || true

if [[ "$purge_lxds" == "y" || "$purge_lxds" == "Y" ]]; then
  echo -e "${COLOR_YELLOW}🔥 [4/5] Menghapus seluruh LXD Containers pada host...${COLOR_RESET}"
  if command -v lxc >/dev/null 2>&1; then
    containers=$(lxc list -c n --format csv 2>/dev/null || true)
    for c in $containers; do
      if [ -n "$c" ]; then
        echo "Deleting LXD Container '$c'..."
        lxc delete "$c" --force 2>/dev/null || true
      fi
    done
    echo "✅ Seluruh LXD Container berhasil dihapus."
  fi
else
  echo "ℹ️ [4/5] Menjaga LXD Container tetap ada di host."
fi

echo -e "${COLOR_GREEN}${COLOR_BOLD}"
echo "======================================================================"
echo "✅ TOTAL UNINSTALL SELESAI! SELURUH APLIKASI DAN DATA BERHASIL DIHAPUS."
echo "======================================================================"
echo -e "${COLOR_RESET}"
