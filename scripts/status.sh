#!/usr/bin/env bash
# ==============================================================================
# Space LXD Dashboard - Status Check Script
# ==============================================================================
set -e

PORT="${PORT:-9090}"

echo "📊 Checking Space LXD Dashboard Status..."
echo "------------------------------------------------------"

if systemctl is-active --quiet lxd-manager-master 2>/dev/null; then
  echo "🟢 Systemd Service 'lxd-manager-master': ACTIVE (RUNNING)"
else
  echo "⚪ Systemd Service 'lxd-manager-master': INACTIVE / NOT INSTALLED"
fi

if pgrep -f "lxd-manager-master" >/dev/null; then
  PIDS=$(pgrep -f "lxd-manager-master" | tr '\n' ' ')
  echo "🟢 Master Process: RUNNING (PIDs: $PIDS)"
else
  echo "🔴 Master Process: NOT RUNNING"
fi

if pgrep -f "lxd-manager-agent" >/dev/null; then
  PIDS=$(pgrep -f "lxd-manager-agent" | tr '\n' ' ')
  echo "🟢 Worker Agent Process: RUNNING (PIDs: $PIDS)"
else
  echo "⚪ Worker Agent Process: NOT RUNNING"
fi

echo "------------------------------------------------------"
if curl -s "http://localhost:${PORT}/api/auth/status" >/dev/null 2>&1; then
  echo "🌐 Web Dashboard API: RESPONDING on http://localhost:${PORT}"
else
  echo "⚠️ Web Dashboard API: UNREACHABLE on port ${PORT}"
fi
echo "------------------------------------------------------"
