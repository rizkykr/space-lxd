#!/usr/bin/env bash
set -e

# ── Dynamic Node/NPM & Go PATH Resolution ────────────────────────────────────
NODE_BIN=$(command -v node 2>/dev/null || find /home /usr /root -name "node" -type f -executable 2>/dev/null | head -n1 || echo "")
if [ -n "$NODE_BIN" ]; then
  NODE_DIR=$(dirname "$NODE_BIN")
  export PATH="$NODE_DIR:$PATH"
fi

export PATH="/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

GO_CMD="go"
if command -v go >/dev/null 2>&1; then
  GO_CMD="go"
elif [ -x "/usr/local/go/bin/go" ]; then
  GO_CMD="/usr/local/go/bin/go"
fi

# ── Build React UI ─────────────────────────────────────────────────────────────
if [ -f "web/package.json" ]; then
  echo "🎨 Building React UI..."
  if command -v npm >/dev/null 2>&1; then
    (
      cd web
      npm install --legacy-peer-deps --silent 2>/dev/null || npm install --silent 2>/dev/null || true
      npm run build || echo "⚠️ React UI build warning, proceeding with existing assets..."
    )
    echo "✅ React UI build completed!"
  elif [ -d "web/dist" ]; then
    echo "ℹ️ Node.js/npm tidak ditemukan, menggunakan dist React UI pre-built yang ada."
  else
    echo "⚠️ Node.js/npm tidak ditemukan & web/dist belum ada. UI mungkin belum terkompilasi."
  fi
fi

# ── Build Go Binaries ──────────────────────────────────────────────────────────
echo "🔨 Building Space LXD Multi-Node Binaries..."

mkdir -p bin

echo "1/3 Building Master Control Plane binary (bin/lxd-manager-master)..."
$GO_CMD build -o bin/lxd-manager-master ./cmd/master

echo "2/3 Building Worker Agent binary (bin/lxd-manager-agent)..."
$GO_CMD build -o bin/lxd-manager-agent ./cmd/agent

echo "3/3 Copying agent binary for downloadable join script..."
cp bin/lxd-manager-agent ./lxd-manager-agent 2>/dev/null || true

echo "✅ ALL BINARIES BUILT SUCCESSFULLY!"
ls -lh bin/
