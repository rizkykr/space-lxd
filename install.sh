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

SPACE_USER="space-lxd"
SPACE_HOME="/var/lib/space-lxd"

banner() {
  echo -e "${COLOR_CYAN}"
  echo "        🚀 SPACE LXD DASHBOARD INSTALLER"
  echo "======================================================"
  echo " Multi-Node LXD Orchestration & Management Control Plane"
  echo -e "======================================================${COLOR_RESET}"
}

info()    { echo -e "${COLOR_CYAN}[INFO]${COLOR_RESET} $1"; }
success() { echo -e "${COLOR_GREEN}[SUCCESS]${COLOR_RESET} $1"; }
warn()    { echo -e "${COLOR_YELLOW}[WARN]${COLOR_RESET} $1"; }
error()   { echo -e "${COLOR_RED}[ERROR]${COLOR_RESET} $1"; exit 1; }

check_root() {
  if [ "$EUID" -ne 0 ]; then
    error "Installer harus dijalankan sebagai root: sudo bash install.sh"
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

# ── Create dedicated service user & SSH key ─────────────────────────────────
setup_service_user() {
  info "Menyiapkan dedicated service user '${SPACE_USER}'..."

  if id "${SPACE_USER}" &>/dev/null; then
    success "User '${SPACE_USER}' sudah ada."
  else
    useradd --system \
            --home-dir "${SPACE_HOME}" \
            --create-home \
            --shell /bin/bash \
            --comment "Space LXD Dashboard Service User" \
            "${SPACE_USER}"
    success "User '${SPACE_USER}' berhasil dibuat."
  fi

  # Pastikan home dir ada dan dimiliki oleh user
  mkdir -p "${SPACE_HOME}/.ssh"
  chown -R "${SPACE_USER}:${SPACE_USER}" "${SPACE_HOME}"
  chmod 750 "${SPACE_HOME}"
  chmod 700 "${SPACE_HOME}/.ssh"

  SSH_KEY="${SPACE_HOME}/.ssh/id_ed25519"

  # Generate SSH key jika belum ada
  if [ ! -f "${SSH_KEY}" ]; then
    info "Membuat SSH key pair untuk user '${SPACE_USER}'..."
    sudo -u "${SPACE_USER}" ssh-keygen -t ed25519 \
      -C "space-lxd@$(hostname)" \
      -f "${SSH_KEY}" \
      -N "" -q
    success "SSH key pair berhasil dibuat: ${SSH_KEY}"
  else
    success "SSH key pair sudah ada: ${SSH_KEY}"
  fi

  # Tambahkan public key ke authorized_keys (untuk SSH lokal / node terminal)
  PUBKEY_FILE="${SSH_KEY}.pub"
  AUTH_KEYS="${SPACE_HOME}/.ssh/authorized_keys"

  if [ -f "${PUBKEY_FILE}" ]; then
    PUBKEY_CONTENT=$(cat "${PUBKEY_FILE}")
    if ! grep -qF "${PUBKEY_CONTENT}" "${AUTH_KEYS}" 2>/dev/null; then
      echo "${PUBKEY_CONTENT}" >> "${AUTH_KEYS}"
      success "Public key ditambahkan ke authorized_keys."
    fi
    chmod 600 "${AUTH_KEYS}"
    chown "${SPACE_USER}:${SPACE_USER}" "${AUTH_KEYS}"
  fi

  # Tambahkan user ke grup lxd agar bisa akses lxc
  if getent group lxd &>/dev/null; then
    usermod -aG lxd "${SPACE_USER}" 2>/dev/null || true
    success "User '${SPACE_USER}' ditambahkan ke grup 'lxd'."
  fi

  # Simpan SSH key info ke config
  mkdir -p /etc/lxd-manager
  cat > /etc/lxd-manager/service-user.env << EOF
SPACE_USER="${SPACE_USER}"
SPACE_HOME="${SPACE_HOME}"
SSH_KEY="${SSH_KEY}"
SSH_PUBKEY="${SSH_KEY}.pub"
EOF
  chmod 600 /etc/lxd-manager/service-user.env

  success "Konfigurasi service user tersimpan di /etc/lxd-manager/service-user.env"
  info "  📌 SSH Public Key: $(cat ${PUBKEY_FILE})"
}

check_lxd() {
  info "Checking LXD daemon installation..."
  if command -v lxc >/dev/null 2>&1; then
    LXC_VER=$(lxc --version 2>/dev/null || echo "ok")
    success "LXD CLI (lxc) found: ${LXC_VER}"
  else
    warn "LXD tidak ditemukan! Menginstall LXD via Snap..."
    if command -v snap >/dev/null 2>&1; then
      snap install lxd || error "Gagal menginstall LXD snap!"
      lxd init --auto || true
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
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - || true
    apt-get install -y nodejs || true
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
  rm -rf /usr/local/go
  tar -C /usr/local -xzf /tmp/go.tar.gz
  export PATH=$PATH:/usr/local/go/bin
  success "Go compiler (${GO_VER}) berhasil terpasang!"
}

ensure_repo() {
  INSTALL_DIR="/opt/space-lxd"

  if [ -f "./cmd/master/main.go" ] && [ -f "./scripts/build.sh" ]; then
    ROOT_DIR="$(pwd)"
    return
  fi

  info "Mengklon/memperbarui repositori resmi di ${INSTALL_DIR}..."
  if ! command -v git >/dev/null 2>&1; then
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update && apt-get install -y git || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y git || true
    fi
  fi

  mkdir -p "${INSTALL_DIR}"
  chown -R "${SPACE_USER}:${SPACE_USER}" "${INSTALL_DIR}" 2>/dev/null || true

  if [ -d "${INSTALL_DIR}/.git" ]; then
    git -C "${INSTALL_DIR}" fetch --all || true
    git -C "${INSTALL_DIR}" reset --hard origin/main || true
    git -C "${INSTALL_DIR}" pull origin main || true
  else
    rm -rf "${INSTALL_DIR}"
    mkdir -p "${INSTALL_DIR}"
    git clone https://github.com/rizkykr/space-lxd.git "${INSTALL_DIR}"
    chown -R "${SPACE_USER}:${SPACE_USER}" "${INSTALL_DIR}" 2>/dev/null || true
  fi

  ROOT_DIR="${INSTALL_DIR}"
  cd "${ROOT_DIR}"
}

build_project() {
  info "Memeriksa biner dan aset Space LXD Dashboard..."
  ensure_repo
  cd "${ROOT_DIR}"

  install_node_lts
  install_golang_latest

  info "Kompilasi dari source code di ${ROOT_DIR}..."
  export PATH=$PATH:/usr/local/go/bin

  if [ -d "${ROOT_DIR}/web" ] && command -v npm >/dev/null 2>&1; then
    info "Building React Frontend UI..."
    (cd "${ROOT_DIR}/web" && npm install --legacy-peer-deps && npm run build)
  fi

  info "Building Master & Agent Go Binaries..."
  mkdir -p "${ROOT_DIR}/bin"
  go build -o "${ROOT_DIR}/bin/lxd-manager-master" "${ROOT_DIR}/cmd/master"
  go build -o "${ROOT_DIR}/bin/lxd-manager-agent" "${ROOT_DIR}/cmd/agent"
  cp "${ROOT_DIR}/bin/lxd-manager-agent" "${ROOT_DIR}/lxd-manager-agent" 2>/dev/null || true
  chown -R "${SPACE_USER}:${SPACE_USER}" "${ROOT_DIR}/bin" 2>/dev/null || true
  success "Biner Space LXD berhasil dibuat!"
}

setup_systemd() {
  info "Mengkonfigurasi Systemd Service Units..."
  ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
  if [ ! -d "$ROOT_DIR" ] || [ ! -f "${ROOT_DIR}/scripts/build.sh" ]; then
    ROOT_DIR="/opt/space-lxd"
  fi
  PORT="${PORT:-9090}"

  cat <<EOF | tee /etc/systemd/system/lxd-manager-master.service >/dev/null
[Unit]
Description=Space LXD Dashboard Master Control Plane
After=network.target lxd.service
Wants=lxd.service

[Service]
Type=simple
User=${SPACE_USER}
Group=${SPACE_USER}
WorkingDirectory=${ROOT_DIR}
Environment="PORT=${PORT}"
Environment="HOME=${SPACE_HOME}"
ExecStart=${ROOT_DIR}/bin/lxd-manager-master
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable lxd-manager-master
  systemctl restart lxd-manager-master
  success "Systemd Service 'lxd-manager-master' berhasil diaktifkan dan dijalankan!"

  info "Memasang perintah CLI Interaktif 'space-lxd' di /usr/local/bin/space-lxd..."
  chmod +x "${ROOT_DIR}/scripts/space-lxd-cli.sh"
  ln -sf "${ROOT_DIR}/scripts/space-lxd-cli.sh" /usr/local/bin/space-lxd || true
  success "Perintah 'space-lxd' berhasil terpasang di terminal!"
}

summary() {
  PORT="${PORT:-9090}"
  LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  SSH_PUBKEY=$(cat "${SPACE_HOME}/.ssh/id_ed25519.pub" 2>/dev/null || echo "N/A")

  banner
  success "SPACE LXD DASHBOARD BERHASIL DIDEPLOY!"
  echo ""
  echo -e "  🌐 Master Web Dashboard: ${COLOR_GREEN}http://${LOCAL_IP}:${PORT}${COLOR_RESET}"
  echo -e "  🖥️ Local Fallback URL:  ${COLOR_CYAN}http://localhost:${PORT}${COLOR_RESET}"
  echo ""
  echo -e "  ${COLOR_BOLD}👤 Service User:${COLOR_RESET}"
  echo -e "    • User    : ${COLOR_CYAN}${SPACE_USER}${COLOR_RESET}"
  echo -e "    • Home    : ${COLOR_CYAN}${SPACE_HOME}${COLOR_RESET}"
  echo -e "    • SSH Key : ${COLOR_CYAN}${SPACE_HOME}/.ssh/id_ed25519${COLOR_RESET}"
  echo ""
  echo -e "  💻 ${COLOR_BOLD}CLI Interaktif Terminal:${COLOR_RESET}"
  echo -e "    Ketik ${COLOR_GREEN}space-lxd${COLOR_RESET} di mana saja pada terminal!"
  echo ""
  echo -e "  ${COLOR_BOLD}Status Service Commands:${COLOR_RESET}"
  echo -e "    • Systemd status: ${COLOR_YELLOW}sudo systemctl status lxd-manager-master${COLOR_RESET}"
  echo -e "    • Cek status:     ${COLOR_YELLOW}space-lxd status${COLOR_RESET}"
  echo ""
  echo "======================================================"
}

main() {
  banner
  check_root
  detect_os
  check_lxd
  setup_service_user
  build_project
  setup_systemd
  summary
}

main "$@"
