#!/usr/bin/env bash
# ==============================================================================
# Space LXD Dashboard - Production Installation & Deployment Script
# 🚀 Automated One-Line Setup for LXD Control Plane & Worker Nodes
# ==============================================================================
set -e

COLOR_RESET="\033[0m"
COLOR_GREEN="\033[1;32m"
COLOR_CYAN="\033[1;36m"
COLOR_YELLOW="\033[1;33m"
COLOR_RED="\033[1;31m"
COLOR_BOLD="\033[1m"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)"

banner() {
  echo -e "${COLOR_CYAN}"
  echo "        🚀 SPACE LXD DASHBOARD INSTALLER"
  echo "======================================================"
  echo " Multi-Node LXD Orchestration & Management Control Plane"
  echo -e "======================================================${COLOR_RESET}"
}

info() { echo -e "${COLOR_CYAN}[INFO]${COLOR_RESET} $1"; }
success() { echo -e "${COLOR_GREEN}[SUCCESS]${COLOR_RESET} $1"; }
warn() { echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET} $1"; }
error() { echo -e "${COLOR_RED}[ERROR]${COLOR_RESET} $1"; exit 1; }

check_root() {
  if [ "$EUID" -ne 0 ]; then
    warn "Installer disarankan dijalankan sebagai root (sudo) untuk setup Systemd Service."
  fi
}

detect_os() {
  info "Checking system environment and Linux distribution..."
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$NAME
    VER=$VERSION_ID
    info "OS Detected: $OS $VER"
  else
    warn "Operating System info not found in /etc/os-release, proceeding with standard Linux fallback."
  fi
}

check_lxd() {
  info "Checking LXD daemon installation..."
  if command -v lxc >/dev/null 2>&1; then
    success "LXD CLI (lxc) found: $(lxc --version 2>/dev/null || echo 'installed')"
  else
    warn "LXD tidak ditemukan! Menginstall LXD via Snap..."
    if command -v snap >/dev/null 2>&1; then
      sudo snap install lxd || error "Gagal menginstall LXD snap!"
      sudo lxd init --auto || true
      success "LXD berhasil diinstall dan diinisialisasi otomatis!"
    else
      error "Snap package manager tidak ditemukan! Harap install LXD secara manual pada host ini."
    fi
  fi
}

install_node_lts() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    success "Node.js terdeteksi: $(node -v)"
    return
  fi
  info "Menginstall Node.js versi LTS resmi (via NodeSource)..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - || true
    sudo apt-get install -y nodejs || true
    success "Node.js LTS berhasil terpasang: $(node -v 2>/dev/null || echo 'OK')"
  fi
}

install_golang_latest() {
  if command -v go >/dev/null 2>&1; then
    success "Go compiler terdeteksi: $(go version)"
    return
  fi
  info "Menginstall Go (Golang) rilis resmi terbaru dari go.dev..."
  ARCH="amd64"
  if [ "$(uname -m)" = "aarch64" ]; then ARCH="arm64"; fi

  GO_VER=$(curl -s https://go.dev/VERSION?m=text | head -n1)
  GO_VER=${GO_VER:-"go1.23.0"}

  info "Mendownload ${GO_VER}.linux-${ARCH}.tar.gz dari official go.dev..."
  curl -fsSL "https://go.dev/dl/${GO_VER}.linux-${ARCH}.tar.gz" -o /tmp/go.tar.gz
  sudo rm -rf /usr/local/go
  sudo tar -C /usr/local -xzf /tmp/go.tar.gz
  export PATH=$PATH:/usr/local/go/bin
  if ! grep -q "/usr/local/go/bin" ~/.bashrc 2>/dev/null; then
    echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
  fi
  success "Go compiler (${GO_VER}) berhasil terpasang!"
}

ensure_repo() {
  INSTALL_DIR="/opt/space-lxd"
  if [ ! -f "${ROOT_DIR}/scripts/build.sh" ]; then
    info "Skrip dijalankan via curl pipe. Mengklon repositori resmi ke ${INSTALL_DIR}..."
    if ! command -v git >/dev/null 2>&1; then
      if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y git || true
      elif command -v dnf >/dev/null 2>&1; then
        sudo dnf install -y git || true
      fi
    fi
    sudo mkdir -p "${INSTALL_DIR}"
    sudo chown -R ${USER}:${USER} "${INSTALL_DIR}" 2>/dev/null || true
    if [ -d "${INSTALL_DIR}/.git" ]; then
      git -C "${INSTALL_DIR}" pull || true
    else
      git clone https://github.com/rizkykr/space-lxd.git "${INSTALL_DIR}"
    fi
    ROOT_DIR="${INSTALL_DIR}"
    cd "${ROOT_DIR}"
  fi
}

build_project() {
  info "Memeriksa biner dan aset Space LXD Dashboard..."
  ensure_repo

  if [ -f "${ROOT_DIR}/bin/lxd-manager-master" ] && [ -d "${ROOT_DIR}/web/dist" ]; then
    success "Aset pre-built terdeteksi di ${ROOT_DIR}."
    return
  fi

  install_node_lts
  install_golang_latest

  info "Kompilasi dari source code..."
  export PATH=$PATH:/usr/local/go/bin
  chmod +x "${ROOT_DIR}/scripts/build.sh"
  "${ROOT_DIR}/scripts/build.sh" || error "Gagal membuat biner Space LXD."
}

setup_systemd() {
  info "Mengkonfigurasi Systemd Service Units..."
  ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
  if [ ! -d "$ROOT_DIR" ] || [ ! -f "${ROOT_DIR}/scripts/build.sh" ]; then
    ROOT_DIR="/opt/space-lxd"
  fi
  PORT="${PORT:-9090}"

  cat <<EOF | sudo tee /etc/systemd/system/lxd-manager-master.service >/dev/null
[Unit]
Description=Space LXD Dashboard Master Control Plane
After=network.target lxd.service
Wants=lxd.service

[Service]
Type=simple
User=${USER}
WorkingDirectory=${ROOT_DIR}
Environment="PORT=${PORT}"
ExecStart=${ROOT_DIR}/bin/lxd-manager-master
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable lxd-manager-master
  sudo systemctl restart lxd-manager-master
  success "Systemd Service 'lxd-manager-master' berhasil diaktifkan dan dijalankan!"

  info "Memasang perintah CLI Interaktif 'space-lxd' di /usr/local/bin/space-lxd..."
  sudo chmod +x "${ROOT_DIR}/scripts/space-lxd-cli.sh"
  sudo ln -sf "${ROOT_DIR}/scripts/space-lxd-cli.sh" /usr/local/bin/space-lxd || true
  success "Perintah 'space-lxd' berhasil terpasang di terminal!"
}

summary() {
  PORT="${PORT:-9090}"
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

  banner
  success "SPACE LXD DASHBOARD BERHASIL DIDETEKSI & DIDEPLOY!"
  echo ""
  echo -e "  🌐 Master Web Dashboard: ${COLOR_GREEN}http://${LOCAL_IP}:${PORT}${COLOR_RESET}"
  echo -e "  🖥️ Local Fallback URL:  ${COLOR_CYAN}http://localhost:${PORT}${COLOR_RESET}"
  echo ""
  echo -e "  💻 ${COLOR_BOLD}CLI Interaktif Terminal:${COLOR_RESET}"
  echo -e "    Ketik ${COLOR_GREEN}space-lxd${COLOR_RESET} di mana saja pada terminal untuk membuka Menu CLI Interaktif!"
  echo ""
  echo -e "  ${COLOR_BOLD}Status Service Commands:${COLOR_RESET}"
  echo -e "    • Systemd status: ${COLOR_YELLOW}sudo systemctl status lxd-manager-master${COLOR_RESET}"
  echo -e "    • Cek status:     ${COLOR_YELLOW}space-lxd status${COLOR_RESET} atau ${COLOR_YELLOW}./scripts/status.sh${COLOR_RESET}"
  echo -e "    • Stop service:   ${COLOR_YELLOW}space-lxd stop${COLOR_RESET} atau ${COLOR_YELLOW}./scripts/stop.sh${COLOR_RESET}"
  echo -e "    • Start service:  ${COLOR_YELLOW}space-lxd start${COLOR_RESET} atau ${COLOR_YELLOW}./scripts/start.sh${COLOR_RESET}"
  echo ""
  echo "======================================================"
}

main() {
  banner
  check_root
  detect_os
  check_lxd
  build_project
  setup_systemd
  summary
}

main "$@"
