#!/usr/bin/env bash
set -e

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
  cd web
  npm install --legacy-peer-deps --silent 2>/dev/null || npm install --silent
  npm run build
  cd ..
  echo "✅ React UI built successfully!"
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
