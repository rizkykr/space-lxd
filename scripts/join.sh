#!/usr/bin/env bash
# LXD Manager Agent Installer & Multi-Node Join Script
# Usage:
#   curl -sSL http://master-url/join.sh | sudo bash -s -- --master http://master-url --token YOUR_TOKEN --name "Worker-01"

set -e

R=$'\033[0m'; BD=$'\033[1m'
GRN=$'\033[38;5;42m'; CYN=$'\033[38;5;45m'; YLW=$'\033[38;5;220m'
RED=$'\033[38;5;196m'; DIM=$'\033[38;5;240m'

MASTER_URL=""
TOKEN=""
NODE_NAME="$(hostname)"
SPACE_USER="space-lxd"
SPACE_HOME="/var/lib/space-lxd"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --master) MASTER_URL="$2"; shift 2 ;;
    --token)  TOKEN="$2"; shift 2 ;;
    --name)   NODE_NAME="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "${RED}Error: Script ini harus dijalankan sebagai root (sudo bash)${R}"
  exit 1
fi

if [[ -z "$MASTER_URL" || -z "$TOKEN" ]]; then
  echo "${RED}Error: Parameter --master dan --token wajib diisi.${R}"
  echo "Penggunaan: curl -sSL http://master:9090/join.sh | sudo bash -s -- --master http://master:9090 --token <TOKEN>"
  exit 1
fi

echo "${CYN}${BD}🪐 SPACE LXD AGENT INSTALLER${R}"
echo "--------------------------------------------------------"
echo "  Master URL : ${MASTER_URL}"
echo "  Node Name  : ${NODE_NAME}"
echo "--------------------------------------------------------"

# ── Step 0: Deteksi & Self-Healing Inisialisasi LXD Daemon ──────────────────────
echo "${DIM}[1/6] Memeriksa keberadaan daemon LXD...${R}"
if ! command -v lxc &>/dev/null; then
  echo "${YLW}⚠ LXD belum terpasang di node ini. Menginstall LXD via snap...${R}"
  if command -v snap &>/dev/null; then
    snap install lxd || true
    lxd init --auto || true
  elif command -v apt-get &>/dev/null; then
    apt-get update && apt-get install -y snapd
    snap install lxd || true
    lxd init --auto || true
  else
    echo "${RED}✗ Gagal menginstall LXD secara otomatis. Pasang LXD terlebih dahulu.${R}"
    exit 1
  fi
else
  LXC_VER=$(lxc --version 2>/dev/null || echo "ok")
  echo "${GRN}✓ LXD Daemon terdeteksi (${LXC_VER}).${R}"
fi

# ── Step 0b: Buat Dedicated Service User ────────────────────────────────────────
echo "${DIM}[2/6] Menyiapkan dedicated service user '${SPACE_USER}'...${R}"

if id "${SPACE_USER}" &>/dev/null; then
  echo "${GRN}✓ User '${SPACE_USER}' sudah ada.${R}"
else
  useradd --system \
          --home-dir "${SPACE_HOME}" \
          --create-home \
          --shell /bin/bash \
          --comment "Space LXD Agent Service User" \
          "${SPACE_USER}"
  echo "${GRN}✓ User '${SPACE_USER}' berhasil dibuat.${R}"
fi

# Setup home dir & permissions
mkdir -p "${SPACE_HOME}/.ssh"
chmod 750 "${SPACE_HOME}"
chmod 700 "${SPACE_HOME}/.ssh"
chown -R "${SPACE_USER}:${SPACE_USER}" "${SPACE_HOME}"

SSH_KEY="${SPACE_HOME}/.ssh/id_ed25519"

# Generate SSH key pair
if [ ! -f "${SSH_KEY}" ]; then
  sudo -u "${SPACE_USER}" ssh-keygen -t ed25519 \
    -C "space-lxd@${NODE_NAME}" \
    -f "${SSH_KEY}" \
    -N "" -q
  echo "${GRN}✓ SSH key pair dibuat: ${SSH_KEY}${R}"
else
  echo "${GRN}✓ SSH key pair sudah ada: ${SSH_KEY}${R}"
fi

# Tambahkan public key ke authorized_keys
AUTH_KEYS="${SPACE_HOME}/.ssh/authorized_keys"
PUBKEY_CONTENT=$(cat "${SSH_KEY}.pub" 2>/dev/null || echo "")
if [[ -n "${PUBKEY_CONTENT}" ]]; then
  if ! grep -qF "${PUBKEY_CONTENT}" "${AUTH_KEYS}" 2>/dev/null; then
    echo "${PUBKEY_CONTENT}" >> "${AUTH_KEYS}"
  fi
  chmod 600 "${AUTH_KEYS}"
  chown "${SPACE_USER}:${SPACE_USER}" "${AUTH_KEYS}"
fi

# Tambahkan ke grup lxd
if getent group lxd &>/dev/null; then
  usermod -aG lxd "${SPACE_USER}" 2>/dev/null || true
fi

# Simpan info
mkdir -p /etc/lxd-manager
cat > /etc/lxd-manager/service-user.env << ENVEOF
SPACE_USER="${SPACE_USER}"
SPACE_HOME="${SPACE_HOME}"
SSH_KEY="${SSH_KEY}"
SSH_PUBKEY="${SSH_KEY}.pub"
ENVEOF
chmod 600 /etc/lxd-manager/service-user.env

echo "${GRN}✓ Service user siap. SSH Public Key:${R}"
echo "  ${DIM}$(cat "${SSH_KEY}.pub" 2>/dev/null || echo 'N/A')${R}"

NODE_ID="node_$(cat /etc/machine-id 2>/dev/null || date +%s | cut -c1-10)"

# ── Step 1: Verification & Token Exchange ──────────────────────────────────────
echo "${DIM}[3/6] Verifikasi registrasi token dengan Master...${R}"

# Sertakan public key saat registrasi agar Master bisa catat untuk SSH
SSH_PUBKEY_CONTENT=$(cat "${SSH_KEY}.pub" 2>/dev/null || echo "")

REG_RESP=$(curl -s -f -X POST "${MASTER_URL}/api/nodes/register" \
  -H "Content-Type: application/json" \
  -d "{\"token\": \"${TOKEN}\", \"node_id\": \"${NODE_ID}\", \"node_name\": \"${NODE_NAME}\", \"ssh_pubkey\": \"${SSH_PUBKEY_CONTENT}\"}" || echo "")

if [[ -z "$REG_RESP" ]]; then
  echo "${RED}✗ Registrasi gagal. Token tidak valid atau Master tidak dapat dijangkau di ${MASTER_URL}${R}"
  exit 1
fi

SECRET_TOKEN=$(echo "$REG_RESP" | grep -o '"secret_token":"[^"]*' | cut -d'"' -f4 || echo "")
if [[ -z "$SECRET_TOKEN" ]]; then
  SECRET_TOKEN="${TOKEN}"
fi

echo "${GRN}✓ Registrasi berhasil! Node ID: ${NODE_ID}${R}"

# ── Step 2: Directories & Agent Env Setup ─────────────────────────────────────
echo "${DIM}[4/6] Menyiapkan direktori & file konfigurasi aman...${R}"
mkdir -p /etc/lxd-manager /usr/local/bin

cat > /etc/lxd-manager/agent.env << EOF
MASTER_URL="${MASTER_URL}"
NODE_ID="${NODE_ID}"
NODE_NAME="${NODE_NAME}"
AGENT_SECRET="${SECRET_TOKEN}"
LXD_SOCKET="/var/snap/lxd/common/lxd/unix.socket"
SPACE_USER="${SPACE_USER}"
SPACE_HOME="${SPACE_HOME}"
EOF

chmod 600 /etc/lxd-manager/agent.env

# ── Step 3: Agent Binary Download ──────────────────────────────────────────────
echo "${DIM}[5/6] Mendownload binary lxd-manager-agent dari Master...${R}"
curl -sSL -f "${MASTER_URL}/downloads/lxd-manager-agent" -o /usr/local/bin/lxd-manager-agent 2>/dev/null || {
  echo "${YLW}⚠ Binary tidak ditemukan di master downloads. Menggunakan binary lokal jika ada...${R}"
  if [[ -f "./lxd-manager-agent" ]]; then
    cp ./lxd-manager-agent /usr/local/bin/lxd-manager-agent
  elif [[ -f "./bin/lxd-manager-agent" ]]; then
    cp ./bin/lxd-manager-agent /usr/local/bin/lxd-manager-agent
  fi
}

chmod +x /usr/local/bin/lxd-manager-agent

# ── Step 4: Systemd Service Installation & Auto-Start ──────────────────────────
echo "${DIM}[6/6] Memasang & mengaktifkan Systemd Auto-Recovery Service...${R}"
cat > /etc/systemd/system/lxd-manager-agent.service << EOF
[Unit]
Description=Space LXD Worker Agent Node
After=network-online.target lxd.service
Wants=network-online.target lxd.service

[Service]
Type=simple
User=${SPACE_USER}
Group=${SPACE_USER}
EnvironmentFile=/etc/lxd-manager/agent.env
Environment="HOME=${SPACE_HOME}"
ExecStart=/usr/local/bin/lxd-manager-agent
Restart=always
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now lxd-manager-agent 2>/dev/null || true

echo "--------------------------------------------------------"
echo "${GRN}${BD}✅ BERHASIL JOIN CLUSTER!${R}"
echo "  Worker node '${NODE_NAME}' sekarang aktif dan terhubung ke Master."
echo "  Service User  : ${SPACE_USER} (Home: ${SPACE_HOME})"
echo "  SSH Public Key: $(cat "${SSH_KEY}.pub" 2>/dev/null | cut -d' ' -f1-2 | cut -c1-60)..."
echo "  Service Status: systemctl status lxd-manager-agent"
echo "--------------------------------------------------------"
