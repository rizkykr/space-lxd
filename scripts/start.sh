#!/usr/bin/env bash
# ==============================================================================
# Space LXD Dashboard - Start Service Script
# ==============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-9090}"

echo "🚀 Starting Space LXD Dashboard Master Control Plane on port ${PORT}..."

if systemctl is-active --quiet lxd-manager-master 2>/dev/null; then
  echo "🔄 Restarting Systemd service 'lxd-manager-master'..."
  sudo systemctl restart lxd-manager-master
  echo "✅ Service running via Systemd."
else
  cd "$ROOT_DIR"
  pkill -9 -f lxd-manager-master 2>/dev/null || true
  sleep 1
  PORT=$PORT ./bin/lxd-manager-master > /tmp/lxd-manager-master.log 2>&1 &
  echo "✅ Master launched in background (PID: $!). Output logged to /tmp/lxd-manager-master.log"
fi
