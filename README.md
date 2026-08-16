# 🚀 Space LXD Dashboard

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react)](https://react.dev)
[![LXD](https://img.shields.io/badge/LXD-Container-832561?style=flat&logo=canonical)](https://ubuntu.com/lxd)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Space LXD Dashboard** is a modern, fast, and secure web platform for managing and orchestrating **multi-node LXD/Incus containers and VMs**. It is designed for developers and engineers who run their own servers — including servers **without a public IP** — and want to split them into isolated, remotely-managed LXD instances from a single central dashboard.

---

## ✨ Key Features

- 🌐 **Multi-Node Orchestration**: Connect a Master control plane with any number of Worker nodes over secure, outbound Agent WebSockets.
- 🔗 **Hybrid Plug-and-Play Connectivity**: Every host, LXD container, and the dashboard can reach each other over **public IP, LAN, Tailscale, or a custom domain** — the agent automatically probes and picks the reachable path. No public IP is required (Tailscale handles NAT traversal).
- 🧙 **6-Step LXD Creation Wizard**:
  - Node server selection & auto-slug name.
  - OS image picker (Ubuntu 24.04/22.04, Debian 12, Alpine, AlmaLinux 9 & custom remote aliases) plus **Container vs Virtual Machine** type.
  - Hardware specs (RAM, CPU cores, storage quota) with presets & custom inputs, plus **storage pool** and **network bridge** selection.
  - Auto-injection of SSH public keys into `/root/.ssh/authorized_keys`.
  - Cloud-Init app templates (Docker & Compose, Nginx SSL, Node.js PM2, Python FastAPI).
  - **Advanced options**: security nesting, privileged mode, memory swap toggle, and CPU allowance.
- 📡 **100% Realtime Data Pipeline**: live per-line streaming of host commands (`lxc image copy`, `lxc launch`, `lxc exec`) to the web terminal via `ReadableStream`, plus realtime cluster state pushed over WebSocket.
- 💻 **Embedded Web Terminal (xterm.js)**: interactive shell access from the browser — no external SSH client required.
- 📸 **Snapshot & Schedule Management**: manual and cron-based automatic snapshots with retention and one-click restore.
- 🌍 **Global Timezone Inheritance**: host timezone is synced to every LXD container automatically.
- 🔐 **JWT Authentication (REST + WebSocket)**: every API endpoint and terminal WebSocket is protected; unauthenticated requests are rejected with `401`.
- 🛡️ **Master URL & Domain Verification**: realtime detection of domain mismatch for dashboard access security.
- ⚠️ **Shadcn Danger Dialogs**: confirm destructive actions by typing the instance name.

---

## 🚀 Quick Start (One-Line Install)

Run the following on your Linux server (Ubuntu / Debian / AlmaLinux / Fedora / Arch / Alpine / openSUSE):

```bash
curl -fsSL https://raw.githubusercontent.com/rizkykr/space-lxd/main/install.sh | sudo bash
```

The script **fully automates everything (zero manual prerequisites)**:
1. Detects your distro and installs **LXD natively** via your package manager (`apt` / `dnf` / `yum` / `pacman` / `apk` / `zypper`) — **snap is only used as a last resort**, so non-Ubuntu systems work out of the box.
2. Auto-configures LXD with **best-performance defaults**: ZFS storage pool (fallback LVM-thin, then dir), ZFS compression, no swap thrashing, and a managed NAT bridge with a unique subnet to avoid cross-node collisions.
3. Creates a dedicated system user `space-lxd` (home: `/var/lib/space-lxd`) with an auto-generated SSH key pair.
4. Installs the binaries & UI assets (skips compilation when prebuilt binaries are present).
5. Configures and enables the Systemd service `lxd-manager-master` under the `space-lxd` user.
6. Installs the interactive CLI command `space-lxd` at `/usr/local/bin/space-lxd`.

After installation, open the dashboard:

👉 **`http://<SERVER_IP>:9090`**

> 💡 **No public IP? No problem.** Install [Tailscale](https://tailscale.com) on each host (`curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`) and access the dashboard at `https://master.ts.net:9090` (or add a MagicDNS cert via `sudo tailscale cert`). The join script auto-detects Tailscale and wires everything together.

---

## 🔗 Adding Worker Nodes (Hybrid Multi-Node Cluster)

To add a new Worker node, open the dashboard (`Node Servers` → `Add Node`) to get a Join Command / Token, then run the command on the worker as `sudo`:

```bash
curl -sSL http://<MASTER_IP>:9090/join.sh | sudo bash -s -- --master http://<MASTER_IP>:9090 --token <JOIN_TOKEN> --name "Worker-01"
```

The join script will:
1. Install LXD natively (distro auto-detected) and configure the storage pool + bridge.
2. Optionally auto-install **Tailscale** and guide you through a one-time `sudo tailscale up`.
3. **Auto-probe all reachable Master endpoints** (public IP, LAN, Tailscale, or domain) and register through whichever works.
4. Auto-fill each node's `custom_ip_domain` with its Tailscale hostname/IP so the Master can reach it over the mesh (SSH fallback, uninstall, etc.).
5. Create the `space-lxd` user + SSH key, download the agent binary, and install the `lxd-manager-agent` Systemd service.

The agent keeps **all Master endpoints** and automatically reconnects through whichever is reachable when your network changes.

---

## 💻 Interactive Terminal CLI (`space-lxd`)

Space LXD Dashboard ships an interactive CLI menu, available anywhere on the terminal:

```bash
# Open the interactive CLI menu
sudo space-lxd

# Direct commands:
sudo space-lxd status    # Health check of services & API port
sudo space-lxd start     # Start the Master service
sudo space-lxd stop      # Stop the service
sudo space-lxd restart   # Restart the service
sudo space-lxd list      # List active LXD containers
sudo space-lxd shell     # Connect to a container terminal (lxc exec)
sudo space-lxd logs      # Stream realtime logs (journalctl / log file)
sudo space-lxd rebuild   # Rebuild React UI & Go binaries
sudo space-lxd update    # Auto-update from GitHub
sudo space-lxd uninstall # Clean uninstall (local server or cluster-wide)
```

---

## 🛠️ Development & Manual Build from Source

*These steps are only needed if you want to modify or recompile the source manually.*

### Prerequisites
- **Linux OS** (Ubuntu 22.04 / 24.04 recommended, but any of the supported distros work)
- **LXD daemon** (installed via `install.sh` automatically, or manually)
- **Go 1.22+** & **Node.js 20+ / npm** (only for manual build)

### Build & Run

```bash
git clone https://github.com/rizkykr/space-lxd.git
cd space-lxd

# Build frontend UI & Go binaries
./scripts/build.sh

# Run the Master control plane
PORT=9090 ./bin/lxd-manager-master
```

---

## 📜 Utility Scripts Reference

| Script | Description |
| :--- | :--- |
| `./install.sh` | One-line automated installer (distro detection, native LXD, ZFS/LVM/bridge config, Systemd). |
| `./scripts/join.sh` | Worker node registration & agent setup (auto-probe Master endpoints, Tailscale-aware). |
| `./scripts/space-lxd-cli.sh` | Engine behind the interactive `space-lxd` CLI. |
| `./scripts/build.sh` | Compiles the React UI (`npm run build`) and Go binaries. |
| `./scripts/start.sh` | Starts the Master service (Systemd or background). |
| `./scripts/stop.sh` | Stops the Master & Worker Agent processes. |
| `./scripts/status.sh` | Checks process status, port 9090, and the Systemd service. |
| `./scripts/uninstall.sh` | Removes the installation (local server or cluster-wide across nodes). |

---

## 🏗️ System Architecture

```
 ┌───────────────────────────────────────────────────────────┐
 │              Space LXD Master Dashboard                   │
 │          (Go HTTP Server + React Web UI)                  │
 │   • JWT auth middleware (REST + WebSocket)                │
 │   • Realtime cluster snapshot broadcaster (WebSocket)     │
 └──────────────────────────────┬────────────────────────────┘
                                │ WebSocket (RPC / Status / Terminal)
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
  ┌───────────┐            ┌───────────┐            ┌───────────┐
  │  Local    │            │  Worker-1 │            │  Worker-2 │
  │  Master   │            │  Agent    │            │  Agent    │
  └─────┬─────┘            └─────┬─────┘            └─────┬─────┘
        │ (lxc socket)           │ (lxc socket)           │ (lxc socket)
  ┌─────▼─────┐            ┌─────▼─────┐            ┌─────▼─────┐
  │ LXD Host  │            │ LXD Host  │            │ LXD Host  │
  └───────────┘            └───────────┘            └───────────┘
        └─────────────── Hybrid Mesh (Public IP / LAN / Tailscale) ───────┘
```

### Connectivity model

- **Master ↔ Worker**: secure outbound Agent WebSockets. Workers never need inbound ports, so they work behind NAT/CGNAT.
- **Hybrid reachability**: the Master advertises every endpoint it believes it is reachable at (configured domain, Tailscale MagicDNS hostname/IP, and all local IPv4). Join scripts and agents probe them and use whichever path works — public IP, LAN, or Tailscale.
- **Container ↔ container / remote host access**: install Tailscale on each host to form a private mesh with NAT traversal; containers behind `lxdbr0` become reachable across nodes, and the dashboard's host terminals work remotely without any public exposure.

---

## ⚙️ Configuration & Database

Configuration is stored automatically in a SQLite database (`lxd-manager.db`):

- **Master Public Endpoint URL**: set from the Settings page (`/settings`) — used for domain verification and join command generation.
- **Default Timezone**: inherited by every new LXD container.
- **Default Resources**: default RAM, CPU, and storage presets for the creation wizard.

Environment variables (optional, with sensible auto-detection):

| Variable | Default | Notes |
| :-- | :-- | :-- |
| `PORT` | `9090` | Master HTTP port. |
| `DB_PATH` | `lxd-manager.db` | SQLite database path. |
| `JWT_SECRET` | generated fallback | **Set a strong secret in production.** |
| `LXD_SOCKET` | auto-detected | Snap (`/var/snap/lxd/...`), native LXD (`/var/lib/lxd/...`), or Incus (`/var/lib/incus/...`). |
| `MASTER_PUBLIC_URL` | auto | Public URL / domain for join commands. |
| `MASTER_URL` (agent) | `http://localhost:9090` | Comma-separated list of Master endpoints the agent should try. |

---

## 📄 License

This project is released under the **MIT License**.
