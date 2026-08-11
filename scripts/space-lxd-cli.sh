#!/usr/bin/env bash
# ==============================================================================
# Space LXD Dashboard - Interactive CLI Menu Utility
# Command: space-lxd
# ==============================================================================

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[1;32m"
COLOR_CYAN="\033[1;36m"
COLOR_YELLOW="\033[1;33m"
COLOR_RED="\033[1;31m"
COLOR_BOLD="\033[1m"
COLOR_MAGENTA="\033[1;35m"

REAL_SOURCE="${BASH_SOURCE[0]}"
while [ -h "$REAL_SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$REAL_SOURCE")" && pwd)"
  REAL_SOURCE="$(readlink "$REAL_SOURCE")"
  [[ $REAL_SOURCE != /* ]] && REAL_SOURCE="$DIR/$REAL_SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$REAL_SOURCE")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)"
PORT="${PORT:-9090}"

banner() {
  clear
  echo -e "${COLOR_CYAN}"
  echo "        🚀 SPACE LXD DASHBOARD INTERACTIVE CLI"
  echo "======================================================"
  echo " Multi-Node LXD Orchestration & Management Control Plane"
  echo -e "======================================================${COLOR_RESET}"
}

show_status() {
  banner
  echo -e "${COLOR_BOLD}📊 STATUS SPACE LXD DASHBOARD:${COLOR_RESET}"
  echo "------------------------------------------------------"
  if pgrep -f "lxd-manager-master" >/dev/null; then
    PIDS=$(pgrep -f "lxd-manager-master" | tr '\n' ' ')
    echo -e "🟢 Master Server: ${COLOR_GREEN}RUNNING${COLOR_RESET} (PIDs: $PIDS)"
  else
    echo -e "🔴 Master Server: ${COLOR_RED}NOT RUNNING${COLOR_RESET}"
  fi

  if pgrep -f "lxd-manager-agent" >/dev/null; then
    PIDS=$(pgrep -f "lxd-manager-agent" | tr '\n' ' ')
    echo -e "🟢 Worker Agent: ${COLOR_GREEN}RUNNING${COLOR_RESET} (PIDs: $PIDS)"
  else
    echo -e "⚪ Worker Agent: ${COLOR_YELLOW}NOT RUNNING${COLOR_RESET}"
  fi

  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  echo "------------------------------------------------------"
  if curl -s "http://localhost:${PORT}/api/auth/status" >/dev/null 2>&1; then
    echo -e "🌐 Dashboard API: ${COLOR_GREEN}RESPONDING${COLOR_RESET} on http://${LOCAL_IP}:${PORT}"
  else
    echo -e "⚠️ Dashboard API: ${COLOR_RED}UNREACHABLE${COLOR_RESET} on port ${PORT}"
  fi
  echo "------------------------------------------------------"
  read -p "Tekan Enter untuk kembali ke menu..."
}

start_service() {
  banner
  echo -e "${COLOR_GREEN}🚀 Memulai Space LXD Dashboard Master...${COLOR_RESET}"
  if systemctl is-active --quiet lxd-manager-master 2>/dev/null; then
    sudo systemctl restart lxd-manager-master
  else
    cd "$ROOT_DIR"
    pkill -9 -f lxd-manager-master 2>/dev/null || true
    sleep 1
    PORT=$PORT ./bin/lxd-manager-master > /tmp/lxd-manager-master.log 2>&1 &
  fi
  echo -e "${COLOR_GREEN}✅ Master Server berhasil dijalankan di port ${PORT}!${COLOR_RESET}"
  sleep 2
}

stop_service() {
  banner
  echo -e "${COLOR_YELLOW}🛑 Menghentikan Layanan Space LXD Dashboard...${COLOR_RESET}"
  sudo systemctl stop lxd-manager-master 2>/dev/null || true
  pkill -9 -f lxd-manager-master 2>/dev/null || true
  pkill -9 -f lxd-manager-agent 2>/dev/null || true
  echo -e "${COLOR_GREEN}✅ Layanan berhasil dihentikan.${COLOR_RESET}"
  sleep 2
}

list_containers() {
  banner
  echo -e "${COLOR_BOLD}📋 DAFTAR LXD CONTAINERS AKTIF PADA HOST:${COLOR_RESET}"
  echo "------------------------------------------------------"
  if command -v lxc >/dev/null 2>&1; then
    lxc list || echo "Tidak ada container aktif."
  else
    echo -e "${COLOR_RED}Perintah 'lxc' tidak ditemukan.${COLOR_RESET}"
  fi
  echo "------------------------------------------------------"
  read -p "Tekan Enter untuk kembali ke menu..."
}

connect_terminal() {
  banner
  echo -e "${COLOR_BOLD}🖥️ INTERACTIVE TERMINAL SHELL CONNECT:${COLOR_RESET}"
  if command -v lxc >/dev/null 2>&1; then
    lxc list --columns n,s,4 -f table
    echo ""
    read -p "Masukkan nama LXD Container yang ingin diajar (misal: web1): " container_name
    if [ -n "$container_name" ]; then
      echo -e "${COLOR_CYAN}Menghubungkan ke shell container '$container_name'...${COLOR_RESET}"
      lxc exec "$container_name" -- /bin/bash || lxc exec "$container_name" -- /bin/sh || echo "Gagal terhubung."
    fi
  else
    echo -e "${COLOR_RED}Perintah 'lxc' tidak ditemukan.${COLOR_RESET}"
  fi
  read -p "Tekan Enter untuk kembali ke menu..."
}

view_logs() {
  banner
  echo -e "${COLOR_BOLD}📄 REAL-TIME SERVICE LOGS:${COLOR_RESET}"
  echo "------------------------------------------------------"
  if systemctl is-active --quiet lxd-manager-master 2>/dev/null; then
    sudo journalctl -u lxd-manager-master -n 50 -f
  elif [ -f /tmp/lxd-manager-master.log ]; then
    tail -n 50 -f /tmp/lxd-manager-master.log
  else
    echo "Log file /tmp/lxd-manager-master.log tidak ditemukan."
    read -p "Tekan Enter untuk kembali..."
  fi
}

rebuild_app() {
  banner
  echo -e "${COLOR_CYAN}🔨 Rebuilding React Frontend & Go Binaries...${COLOR_RESET}"
  cd "$ROOT_DIR"
  ./scripts/build.sh
  echo -e "${COLOR_GREEN}✅ Rebuild selesai! Mengolah ulang service...${COLOR_RESET}"
  start_service
}

quick_create() {
  banner
  echo -e "${COLOR_BOLD}➕ QUICK LXD CREATION (CLI):${COLOR_RESET}"
  read -p "Nama Container (misal: my-app): " name
  read -p "OS Image [default: ubuntu:24.04]: " image
  image=${image:-"ubuntu:24.04"}
  read -p "RAM (GB) [default: 2]: " ram
  ram=${ram:-2}
  read -p "CPU Cores [default: 2]: " cpu
  cpu=${cpu:-2}

  if [ -n "$name" ]; then
    echo -e "${COLOR_CYAN}Meluncurkan instance '$name' ($image, ${ram}GB RAM, ${cpu} Cores)...${COLOR_RESET}"
    lxc launch "$image" "$name" -c limits.memory="${ram}GB" -c limits.cpu="$cpu" -c security.nesting=true
    echo -e "${COLOR_GREEN}✅ LXD Container '$name' berhasil diluncurkan!${COLOR_RESET}"
  fi
  read -p "Tekan Enter untuk kembali..."
}

clean_uninstall() {
  banner
  cd "$ROOT_DIR" 2>/dev/null || true
  if [ -f "${ROOT_DIR}/scripts/uninstall.sh" ]; then
    bash "${ROOT_DIR}/scripts/uninstall.sh"
  elif [ -f "./scripts/uninstall.sh" ]; then
    bash ./scripts/uninstall.sh
  else
    echo -e "${COLOR_RED}Skrip uninstall.sh tidak ditemukan di ${ROOT_DIR}.${COLOR_RESET}"
  fi
  exit 0
}

check_and_update() {
  banner
  echo -e "${COLOR_BOLD}🔄 MEMERIKSA UPDATE DARI GITHUB (rizkykr/space-lxd)...${COLOR_RESET}"
  echo "------------------------------------------------------"
  cd "$ROOT_DIR" 2>/dev/null || true
  git fetch --all >/dev/null 2>&1 || true

  LOCAL_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  REMOTE_HASH=$(git rev-parse --short origin/main 2>/dev/null || echo "unknown")

  echo -e "  📌 Versi Terpasang:  ${COLOR_CYAN}${LOCAL_HASH}${COLOR_RESET}"
  echo -e "  🌐 Versi GitHub Main: ${COLOR_GREEN}${REMOTE_HASH}${COLOR_RESET}"
  echo "------------------------------------------------------"

  if [ "$LOCAL_HASH" != "unknown" ] && [ "$REMOTE_HASH" != "unknown" ] && [ "$LOCAL_HASH" != "$REMOTE_HASH" ]; then
    echo -e "${COLOR_YELLOW}🚀 HORE! Update terbaru Space LXD tersedia di GitHub!${COLOR_RESET}"
    read -p "Apakah Anda ingin melakukan update otomatis sekarang? (Y/n): " confirm
    confirm=${confirm:-"Y"}
    if [[ "$confirm" == "y" || "$confirm" == "Y" ]]; then
      echo -e "${COLOR_CYAN}Mengunduh kode terbaru dari GitHub...${COLOR_RESET}"
      git reset --hard origin/main
      git pull origin main
      echo -e "${COLOR_CYAN}Kompilasi biner dan aset React UI...${COLOR_RESET}"
      ./scripts/build.sh
      echo -e "${COLOR_GREEN}Merekonstruksi service Systemd...${COLOR_RESET}"
      sudo systemctl restart lxd-manager-master 2>/dev/null || true
      echo -e "${COLOR_GREEN}✅ UPDATE SELESAI! Space LXD Dashboard telah diperbarui.${COLOR_RESET}"
    else
      echo "Update dibatalkan."
    fi
  else
    echo -e "${COLOR_GREEN}✅ Space LXD Dashboard sudah menggunakan versi terbaru (${LOCAL_HASH})!${COLOR_RESET}"
  fi
  read -p "Tekan Enter untuk kembali..."
}

interactive_menu() {
  while true; do
    banner
    echo -e "  ${COLOR_BOLD}[1]${COLOR_RESET} 📊 Status Dashboard & Health Check"
    echo -e "  ${COLOR_BOLD}[2]${COLOR_RESET} 🚀 Start Space LXD Master Server"
    echo -e "  ${COLOR_BOLD}[3]${COLOR_RESET} 🛑 Stop Space LXD Master Server"
    echo -e "  ${COLOR_BOLD}[4]${COLOR_RESET} 🔄 Restart Service"
    echo -e "  ${COLOR_BOLD}[5]${COLOR_RESET} ➕ Quick Create LXD Container"
    echo -e "  ${COLOR_BOLD}[6]${COLOR_RESET} 📋 List Active LXD Containers"
    echo -e "  ${COLOR_BOLD}[7]${COLOR_RESET} 🖥️ Connect LXD Terminal Shell"
    echo -e "  ${COLOR_BOLD}[8]${COLOR_RESET} 📄 View Realtime Service Logs"
    echo -e "  ${COLOR_BOLD}[9]${COLOR_RESET} 🔨 Rebuild React UI & Go Binaries"
    echo -e "  ${COLOR_BOLD}[10]${COLOR_RESET} 🔄 Check & Update Space LXD from GitHub"
    echo -e "  ${COLOR_BOLD}[11]${COLOR_RESET} 🗑️ Clean Uninstall & Purge All Data (Total Reset)"
    echo -e "  ${COLOR_BOLD}[0]${COLOR_RESET} 🚪 Exit CLI Menu"
    echo "======================================================"
    read -p "Pilihan Anda [0-11]: " choice

    case $choice in
      1) show_status ;;
      2) start_service ;;
      3) stop_service ;;
      4) stop_service && start_service ;;
      5) quick_create ;;
      6) list_containers ;;
      7) connect_terminal ;;
      8) view_logs ;;
      9) rebuild_app ;;
      10) check_and_update ;;
      11) clean_uninstall ;;
      0) echo -e "${COLOR_GREEN}Terima kasih telah menggunakan Space LXD Dashboard! Bye 👋${COLOR_RESET}"; exit 0 ;;
      *) echo -e "${COLOR_RED}Pilihan tidak valid!${COLOR_RESET}"; sleep 1 ;;
    esac
  done
}

# CLI Argument Router
case "$1" in
  status) show_status ;;
  start) start_service ;;
  stop) stop_service ;;
  restart) stop_service && start_service ;;
  list) list_containers ;;
  shell) connect_terminal ;;
  logs) view_logs ;;
  rebuild) rebuild_app ;;
  update) check_and_update ;;
  uninstall|purge) clean_uninstall ;;
  *) interactive_menu ;;
esac
