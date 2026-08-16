#!/usr/bin/env bash
# Space LXD Agent Installer & Multi-Node Join Script
# Hybrid connectivity: works over public IP, LAN, Tailscale, or a domain.
# Usage:
#   curl -sSL http://master-url/join.sh | sudo bash -s -- --master http://master-url --token YOUR_TOKEN --name "Worker-01"

set -e

R=$'\033[0m'; BD=$'\033[1m'
GRN=$'\033[38;5;42m'; CYN=$'\033[38;5;45m'; YLW=$'\033[38;5;220m'
RED=$'\033[38;5;196m'; DIM=$'\033[38;5;240m'

MASTER_URL=""
TOKEN=""
ENDPOINTS=""
NODE_NAME="$(hostname)"
SPACE_USER="space-lxd"
SPACE_HOME="/home/space-lxd"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --master)    MASTER_URL="$2"; shift 2 ;;
    --token)     TOKEN="$2"; shift 2 ;;
    --name)      NODE_NAME="$2"; shift 2 ;;
    --endpoints) ENDPOINTS="$2"; shift 2 ;;
    *) shift ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "${RED}Error: Script ini harus dijalankan sebagai root (sudo bash)${R}"
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "${RED}Error: Parameter --token wajib diisi.${R}"
  echo "Penggunaan: curl -sSL http://master:9090/join.sh | sudo bash -s -- --master http://master:9090 --token <TOKEN>"
  exit 1
fi

if [[ -z "$MASTER_URL" && -z "$ENDPOINTS" ]]; then
  echo "${RED}Error: Sertakan --master <url> atau --endpoints '<url1,url2,...>' untuk mencapaikan Master.${R}"
  exit 1
fi

echo "${CYN}${BD}🪐 SPACE LXD AGENT INSTALLER (Hybrid Mesh Ready)${R}"
echo "--------------------------------------------------------"
echo "  Master URL : ${MASTER_URL:-<auto-probe endpoints>}"
echo "  Node Name  : ${NODE_NAME}"
echo "--------------------------------------------------------"

# ── Step 0: Deteksi & Self-Healing Inisialisasi LXD Daemon ──────────────────────
echo "${DIM}[1/6] Memeriksa keberadaan daemon LXD...${R}"
if ! command -v lxc &>/dev/null; then
  echo "${YLW}⚠ LXD belum terpasang di node ini. Menginstall LXD via package manager native...${R}"
  INSTALLED=0
  if command -v apt-get &>/dev/null; then
    apt-get update && apt-get install -y lxd lvm2 && INSTALLED=1
  elif command -v dnf &>/dev/null; then
    dnf install -y lxd lvm2 && INSTALLED=1
  elif command -v yum &>/dev/null; then
    yum install -y lxd lvm2 && INSTALLED=1
  elif command -v pacman &>/dev/null; then
    pacman -Sy --noconfirm lxd lvm2 && INSTALLED=1
  elif command -v apk &>/dev/null; then
    apk add --no-cache lxd lvm2 && INSTALLED=1
  elif command -v zypper &>/dev/null; then
    zypper --non-interactive install lxd lvm2 && INSTALLED=1
  elif command -v snap &>/dev/null; then
    snap install lxd && INSTALLED=1
  fi

  if [ "$INSTALLED" -ne 1 ]; then
    echo "${RED}✗ Gagal menginstall LXD secara otomatis. Pasang LXD terlebih dahulu.${R}"
    exit 1
  fi
  lxd init --auto || true
else
  LXC_VER=$(lxc --version 2>/dev/null || echo "ok")
  echo "${GRN}✓ LXD Daemon terdeteksi (${LXC_VER}).${R}"
fi

# ── Best-Performance Storage Pool (ZFS > LVM-thin > dir, verified) ──────────────
if ! lxc storage list --format=csv 2>/dev/null | grep -q .; then
  if command -v zfs >/dev/null 2>&1 && command -v zpool >/dev/null 2>&1 &&
     lxd init --auto --storage-backend=zfs --storage-create-loop=10GB --storage-pool=default >/dev/null 2>&1 &&
     lxc storage list --format=csv 2>/dev/null | grep -q .; then
    echo "${CYN}⚙ LXD initialized with ZFS storage pool (best performance).${R}"
  elif command -v lvcreate >/dev/null 2>&1 &&
       lxd init --auto --storage-backend=lvm --storage-create-loop=10GB --storage-pool=default >/dev/null 2>&1 &&
       lxc storage list --format=csv 2>/dev/null | grep -q .; then
    echo "${CYN}⚙ LXD initialized with LVM-thin storage pool (copy-on-write).${R}"
  else
    echo "${YLW}⚠ ZFS/LVM unavailable or failed; initializing LXD with default (dir) storage.${R}"
    if ! lxd init --auto; then
      echo "${RED}✗ Gagal menginisialisasi LXD. Periksa daemon LXD.${R}"
      exit 1
    fi
  fi
fi

if ! lxc storage list --format=csv 2>/dev/null | grep -q .; then
  echo "${RED}✗ LXD tidak memiliki storage pool. Periksa daemon LXD.${R}"
  exit 1
fi

# ── Managed bridge with NAT + DHCP (auto subnet, avoids collisions) ─────────────
if ! lxc network show lxdbr0 >/dev/null 2>&1; then
  echo "${CYN}⚡ Constructing managed bridge 'lxdbr0' (NAT + DHCP + DNS)...${R}"
  if ! lxc network create lxdbr0 \
      ipv4.address=auto \
      ipv4.nat=true \
      ipv4.dhcp=true \
      ipv6.address=auto \
      ipv6.nat=true \
      dns.mode=managed; then
    echo "${RED}✗ Gagal membuat network 'lxdbr0'. Periksa daemon LXD.${R}"
    exit 1
  fi
fi

# Repair an existing lxdbr0: ensure NAT + DHCP + managed DNS (idempotent)
lxc network set lxdbr0 ipv4.nat=true 2>/dev/null || true
lxc network set lxdbr0 ipv4.dhcp=true 2>/dev/null || true
lxc network set lxdbr0 dns.mode=managed 2>/dev/null || true

# ── Default profile MUST have eth0 pointing to lxdbr0 ──────────────────────────
if ! lxc profile device get default eth0 parent 2>/dev/null | grep -qx lxdbr0; then
  lxc profile device remove default eth0 >/dev/null 2>&1 || true
  lxc profile device add default eth0 nictype=bridged parent=lxdbr0 name=eth0
fi

# ── Best-Performance Tuning: ZFS compression & no swap thrashing ──────────────
lxc storage set default zfs.compression=on 2>/dev/null || true
lxc profile set default limits.memory.swap=false 2>/dev/null || true

# Enable Kernel IPv4 Forwarding for NAT / Cross-Node / Tailscale Mesh Routing
sysctl -w net.ipv4.ip_forward=1 &>/dev/null || true
if ! grep -q "net.ipv4.ip_forward=1" /etc/sysctl.conf 2>/dev/null; then
  echo "net.ipv4.ip_forward=1" >> /etc/sysctl.conf
fi

# Self-check
if lxc profile device get default eth0 parent 2>/dev/null | grep -qx lxdbr0; then
  echo "${GRN}✓ Jaringan LXD siap: lxdbr0 (NAT+DHCP+DNS) + default profile eth0.${R}"
else
  echo "${YLW}⚠ Profile 'default' tidak memiliki eth0 di lxdbr0 — container mungkin tanpa jaringan.${R}"
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

# ── Step 0c: Tailscale Mesh (NAT traversal — works without a public IP) ─────────
echo "${DIM}🌐 Memeriksa Tailscale mesh (opsional)...${R}"
if ! command -v tailscale >/dev/null 2>&1; then
  echo "${YLW}⚠ Tailscale belum terpasang. Menginstall otomatis...${R}"
  if command -v apt-get >/dev/null 2>&1; then
    CODENAME=$(. /etc/os-release && echo "$VERSION_CODENAME")
    curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${CODENAME}.noarmor.gpg" 2>/dev/null | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null 2>&1 || true
    curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${CODENAME}.tailscale-list" 2>/dev/null | tee /etc/apt/sources.list.d/tailscale.list >/dev/null 2>&1 || true
    apt-get update >/dev/null 2>&1 || true
    apt-get install -y tailscale >/dev/null 2>&1 || true
  elif command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    dnf config-manager --add-repo https://pkgs.tailscale.com/stable/rhel/9/tailscale.repo >/dev/null 2>&1 || true
    dnf install -y tailscale >/dev/null 2>&1 || true
  elif command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm tailscale >/dev/null 2>&1 || true
  elif command -v zypper >/dev/null 2>&1; then
    zypper --non-interactive install tailscale >/dev/null 2>&1 || true
  elif command -v apk >/dev/null 2>&1; then
    apk add --no-cache tailscale >/dev/null 2>&1 || true
  fi
fi

TAILSCALE_IP=""
TAILSCALE_HOST=""
if command -v tailscale >/dev/null 2>&1; then
  systemctl enable --now tailscaled >/dev/null 2>&1 || true
  if ! tailscale ip -4 >/dev/null 2>&1; then
    echo "${YLW}⏳ Tailscale perlu login sekali (one-time):${R}"
    echo "  ${CYN}  sudo tailscale up${R}"
    echo "  Setelah login, jalankan ulang perintah join ini agar node masuk tailnet."
  else
    TAILSCALE_IP=$(tailscale ip -4 2>/dev/null | head -n1)
    TS_DNS=$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*' | head -n1 | cut -d'"' -f4 | sed 's/\.$//')
    [ -n "$TS_DNS" ] && TAILSCALE_HOST="$TS_DNS"
    echo "${GRN}✓ Tailscale aktif: ${TAILSCALE_HOST:-$TAILSCALE_IP}${R}"
  fi
fi

# Auto-fill custom_ip_domain so the master can reach this node over the mesh (SSH fallback)
CUSTOM_IP_DOMAIN="${TAILSCALE_HOST:-$TAILSCALE_IP}"

# ── Step 1: Verification & Token Exchange (auto-probe reachable master) ────────
echo "${DIM}[3/6] Verifikasi registrasi token dengan Master...${R}"

# Candidate master URLs: --master first, then --endpoints, then this node's Tailscale endpoints
CANDIDATES=()
[ -n "$MASTER_URL" ] && CANDIDATES+=("$MASTER_URL")
if [ -n "$ENDPOINTS" ]; then
  IFS=',' read -r -a EP_LIST <<< "$ENDPOINTS"
  for EP in "${EP_LIST[@]}"; do
    EP="$(echo "$EP" | tr -d ' \n\r')"
    [ -n "$EP" ] && CANDIDATES+=("$EP")
  done
fi
[ -n "$TAILSCALE_HOST" ] && CANDIDATES+=("http://${TAILSCALE_HOST}:9090")
[ -n "$TAILSCALE_IP" ] && CANDIDATES+=("http://${TAILSCALE_IP}:9090")

# Deduplicate (strip trailing slashes)
declare -A SEEN=()
DEDUPED=()
for C in "${CANDIDATES[@]}"; do
  C="$(echo "$C" | sed 's#/*$##')"
  if [ -n "$C" ] && [ -z "${SEEN[$C]}" ]; then
    SEEN["$C"]=1
    DEDUPED+=("$C")
  fi
done

# Sertakan public key saat registrasi agar Master bisa catat untuk SSH
SSH_PUBKEY_CONTENT=$(cat "${SSH_KEY}.pub" 2>/dev/null || echo "")

REG_RESP=""
REG_MASTER=""
for CAND in "${DEDUPED[@]}"; do
  echo "${DIM}  → Mencoba Master: ${CAND}${R}"
  REG_RESP=$(curl -s -f -m 8 -X POST "${CAND}/api/nodes/register" \
    -H "Content-Type: application/json" \
    -d "{\"token\": \"${TOKEN}\", \"node_id\": \"${NODE_ID}\", \"node_name\": \"${NODE_NAME}\", \"custom_ip_domain\": \"${CUSTOM_IP_DOMAIN}\", \"ssh_pubkey\": \"${SSH_PUBKEY_CONTENT}\"}" || echo "")
  if [ -n "$REG_RESP" ]; then
    REG_MASTER="$CAND"
    break
  fi
done

if [[ -z "$REG_RESP" ]]; then
  echo "${RED}✗ Registrasi gagal di semua endpoint Master.${R}"
  echo "  Endpoint yang dicoba: ${DEDUPED[*]}"
  echo "  Pastikan token valid dan salah satu endpoint dapat dijangkau node ini."
  exit 1
fi

# MASTER_URL = the endpoint that worked (used for downloads); agent keeps all candidates
MASTER_URL="${REG_MASTER}"
AGENT_MASTER_URLS="$(IFS=','; echo "${DEDUPED[*]}")"

SECRET_TOKEN=$(echo "$REG_RESP" | grep -o '"secret_token":"[^"]*' | cut -d'"' -f4 || echo "")
if [[ -z "$SECRET_TOKEN" ]]; then
  SECRET_TOKEN="${TOKEN}"
fi

echo "${GRN}✓ Registrasi berhasil! Node ID: ${NODE_ID}${R}"
echo "${GRN}✓ Master terhubung via: ${MASTER_URL}${R}"

# ── Step 2: Directories & Agent Env Setup ─────────────────────────────────────
echo "${DIM}[4/6] Menyiapkan direktori & file konfigurasi aman...${R}"
mkdir -p /etc/lxd-manager /usr/local/bin

# Auto-detect LXD/Incus daemon socket path
LXD_SOCKET="/var/lib/lxd/unix.socket"
for _s in /var/snap/lxd/common/lxd/unix.socket /var/lib/lxd/unix.socket /var/lib/incus/unix.socket; do
  if [ -S "$_s" ]; then
    LXD_SOCKET="$_s"
    break
  fi
done

cat > /etc/lxd-manager/agent.env << EOF
MASTER_URL="${AGENT_MASTER_URLS}"
NODE_ID="${NODE_ID}"
NODE_NAME="${NODE_NAME}"
AGENT_SECRET="${SECRET_TOKEN}"
LXD_SOCKET="${LXD_SOCKET}"
SPACE_USER="${SPACE_USER}"
SPACE_HOME="${SPACE_HOME}"
EOF

chmod 600 /etc/lxd-manager/agent.env

# ── Step 3: Agent Binary Download ──────────────────────────────────────────────
echo "${DIM}[5/6] Mendownload binary lxd-manager-agent dari Master...${R}"
curl -sSL -f "${MASTER_URL}/downloads/lxd-manager-agent" -o /usr/local/bin/lxd-manager-agent 2>/dev/null || \
curl -sSL -f "${MASTER_URL}/download/agent" -o /usr/local/bin/lxd-manager-agent 2>/dev/null || {
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
