#!/usr/bin/env bash
set -e

echo "🔨 Building LXD Manager Multi-Node Binaries..."

mkdir -p bin

echo "1/3 Building Master Control Plane binary (bin/lxd-manager-master)..."
go build -o bin/lxd-manager-master ./cmd/master

echo "2/3 Building Worker Agent binary (bin/lxd-manager-agent)..."
go build -o bin/lxd-manager-agent ./cmd/agent

echo "3/3 Copying agent binary for downloadable join script..."
cp bin/lxd-manager-agent ./lxd-manager-agent 2>/dev/null || true

echo "✅ ALL BINARIES BUILT SUCCESSFULLY!"
ls -lh bin/
