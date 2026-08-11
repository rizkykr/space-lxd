#!/usr/bin/env bash
# ==============================================================================
# Space LXD Dashboard - Uninstall Script
# ==============================================================================
set -e

echo "⚠️ WARNING: This script will stop and remove Space LXD Dashboard services."
read -p "Apakah Anda yakin ingin menghapus Space LXD Dashboard? (y/N): " confirm

if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Pembatalan uninstallation."
  exit 0
fi

echo "🛑 Stopping services..."
sudo systemctl stop lxd-manager-master 2>/dev/null || true
sudo systemctl disable lxd-manager-master 2>/dev/null || true

if [ -f /etc/systemd/system/lxd-manager-master.service ]; then
  sudo rm -f /etc/systemd/system/lxd-manager-master.service
  sudo systemctl daemon-reload
  echo "✅ Systemd service removed."
fi

pkill -9 -f lxd-manager-master 2>/dev/null || true
pkill -9 -f lxd-manager-agent 2>/dev/null || true

echo "✅ Space LXD Dashboard successfully uninstalled."
