#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

# ── Dynamic Node/NPM PATH Resolution ───────────────────────────────────────────
if ! command -v npm >/dev/null 2>&1; then
  for dir in /home/*/.local/share/lerd/bin /root/.local/share/lerd/bin /home/*/.nvm/versions/node/*/bin /root/.nvm/versions/node/*/bin /usr/local/bin /usr/bin; do
    if [ -x "$dir/npm" ]; then
      export PATH="$dir:$PATH"
      break
    fi
  done
fi

# ── Dynamic Go PATH Resolution ─────────────────────────────────────────────────
export PATH="/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

GO_CMD="go"
USE_CONTAINER_GO=""

if command -v go >/dev/null 2>&1; then
  GO_CMD="go"
elif [ -x "/usr/local/go/bin/go" ]; then
  GO_CMD="/usr/local/go/bin/go"
  export PATH="/usr/local/go/bin:$PATH"
elif [ -x "/usr/bin/go" ]; then
  GO_CMD="/usr/bin/go"
elif [ -x "/snap/bin/go" ]; then
  GO_CMD="/snap/bin/go"
  export PATH="/snap/bin:$PATH"
elif command -v podman >/dev/null 2>&1; then
  USE_CONTAINER_GO="podman"
elif command -v docker >/dev/null 2>&1; then
  USE_CONTAINER_GO="docker"
else
  echo "❌ Error: Golang (go) tidak ditemukan di sistem (/usr/local/go/bin/go)!"
  exit 1
fi

# ── Build React UI ─────────────────────────────────────────────────────────────
if [ -f "web/package.json" ]; then
  echo "🎨 Building React UI..."
  if command -v npm >/dev/null 2>&1; then
    (
      cd web
      npm install --legacy-peer-deps
      npm run build
    )
    echo "✅ React UI build completed!"
  elif [ -d "web/dist" ]; then
    echo "ℹ️ Node.js/npm tidak ditemukan, menggunakan dist React UI yang ada."
  else
    echo "❌ Error: Node.js/npm tidak ditemukan dan folder web/dist belum ada!"
    exit 1
  fi
fi

# ── Build Go Binaries ──────────────────────────────────────────────────────────
echo "🔨 Building Space LXD Multi-Node Binaries..."
mkdir -p bin

if [ -n "$USE_CONTAINER_GO" ]; then
  echo "ℹ️ Mengompilasi biner Go menggunakan ${USE_CONTAINER_GO} container..."
  $USE_CONTAINER_GO run --rm -v "$(pwd):/app" -w /app -e GOTOOLCHAIN=auto golang:1.23-alpine sh -c "go build -o bin/lxd-manager-master ./cmd/master && go build -o bin/lxd-manager-agent ./cmd/agent"
else
  echo "1/2 Building Master Control Plane binary (bin/lxd-manager-master)..."
  GOTOOLCHAIN=auto $GO_CMD build -o bin/lxd-manager-master ./cmd/master

  echo "2/2 Building Worker Agent binary (bin/lxd-manager-agent)..."
  GOTOOLCHAIN=auto $GO_CMD build -o bin/lxd-manager-agent ./cmd/agent
fi

cp bin/lxd-manager-agent ./lxd-manager-agent 2>/dev/null || true
chmod +x bin/lxd-manager-master bin/lxd-manager-agent ./lxd-manager-agent 2>/dev/null || true

echo "✅ ALL BINARIES BUILT SUCCESSFULLY!"
ls -lh bin/
