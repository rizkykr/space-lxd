#!/usr/bin/env bash
# ==============================================================================
# Space LXD Dashboard - Stop Service Script
# ==============================================================================
set -e

echo "🛑 Stopping Space LXD Dashboard Master & Agent processes..."

if systemctl is-active --quiet lxd-manager-master 2>/dev/null; then
  sudo systemctl stop lxd-manager-master 2>/dev/null || true
  echo "✅ Systemd service lxd-manager-master stopped."
fi

pkill -9 -f lxd-manager-master 2>/dev/null || true
pkill -9 -f lxd-manager-agent 2>/dev/null || true

echo "✅ All Space LXD Dashboard processes stopped."
