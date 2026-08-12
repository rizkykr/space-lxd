# 🚀 Space LXD Dashboard

[![Go Version](https://img.shields.io/badge/Go-1.22+-00ADD8?style=flat&logo=go)](https://golang.org)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat&logo=react)](https://react.dev)
[![LXD](https://img.shields.io/badge/LXD-Container-832561?style=flat&logo=canonical)](https://ubuntu.com/lxd)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Space LXD Dashboard** adalah platform manajemen dan orkestrasi kluster **Multi-Node LXD Container / VM** berbasis web modern, cepat, dan aman. Platform ini dirancang untuk mempermudah pembuatan, pemantauan, backup snapshot, dan interaksi terminal shell container LXD dari satu Dashboard terpusat.

---

## ✨ Fitur Utama

- 🌐 **Orkestrasi Multi-Node LXD**: Hubungkan Master Control Plane dengan banyak Node Worker via Secure Agent WebSockets.
- 🧙 **Wizard Pembuatan LXD 6-Step**:
  - Selection Node Server & Auto-Slug Name.
  - OS Image Picker (Ubuntu 24.04, Ubuntu 22.04, Debian 12, Alpine Linux, AlmaLinux 9, & Custom Remote Aliases).
  - Alokasi Hardware Specs (RAM, CPU Cores, Storage Quota) dengan **Preset & Custom Number Inputs**.
  - Auto-Injeksi Kunci SSH Publik ke `/root/.ssh/authorized_keys`.
  - Cloud-Init App Templates (Docker & Compose, Nginx SSL, Node.js PM2, Python FastAPI).
- 📡 **100% Real-Time Backend Command Streaming**: Streaming log nyata per-baris perintah CLI host (`lxc image copy`, `lxc launch`, `lxc exec`) dari Go `client.go` ke terminal web UI via `ReadableStream`.
- 💻 **Embedded Web Terminal (xterm.js)**: Interaksi shell terminal interaktif langsung di browser tanpa perlu SSH client eksternal.
- 📸 **Snapshot & Schedule Management**: Fitur snapshot manual & otomatis berbasis jadwal cron, lengkap dengan retensi dan 1-click UI restore.
- 🌍 **Global Timezone Inheritance**: Sinkronisasi zona waktu global dari Agent Host ke setiap LXD container.
- 🛡️ **Master URL & Domain Verification**: Deteksi domain mismatch secara realtime untuk keamanan akses dashboard.
- ⚠️ **Shadcn Danger Dialogs**: Konfirmasi penghapusan container dengan input konfirmasi nama instance.

---

## 🚀 Quick Start (Instalasi Cepat 1 Baris)

Jalankan perintah berikut di server Linux Anda (Ubuntu / Debian / AlmaLinux / Fedora):

```bash
curl -fsSL https://raw.githubusercontent.com/rizkykr/space-lxd/main/install.sh | sudo bash
```

Script di atas akan secara **otomatis 100% (Zero Prerequisite Manual)**:
1. Memeriksa & menginstall LXD daemon via Snap jika belum ada (`sudo snap install lxd && sudo lxd init --auto`).
2. Membuat **dedicated system user `space-lxd`** (Home: `/var/lib/space-lxd`) beserta SSH Key pair otomatis (`id_ed25519`).
3. Menyiapkan biner & aset UI (tidak memerlukan instalasi Go / Node.js manual).
4. Mengonfigurasi dan mengaktifkan **Systemd Service** `lxd-manager-master` di bawah user `space-lxd`.
5. Memasang perintah CLI Interaktif **`space-lxd`** di terminal `/usr/local/bin/space-lxd`.

Setelah instalasi selesai, buka Dashboard di browser:
👉 **`http://<SERVER_IP>:9090`**

---

## 🛠️ Pengembangan & Build Manual dari Source Code

*Catatan: Langkah di bawah ini HANYA dibutuhkan jika Anda ingin memodifikasi atau mengompilasi ulang source code secara manual.*

### Prasyarat Kompilasi Manual:
- **Linux OS** (Ubuntu 22.04 / 24.04 disarankan)
- **LXD Daemon** (`sudo snap install lxd && sudo lxd init --auto`)
- **Go 1.22+** & **Node.js 20+ / npm** (hanya untuk build manual)

### Langkah Kompilasi & Jalankan:

```bash
# 1. Clone repositori
git clone https://github.com/rizkykr/space-lxd.git
cd space-lxd

# 2. Build Frontend UI & Go Binaries
./scripts/build.sh

# 3. Jalankan Master Control Plane
PORT=9090 ./bin/lxd-manager-master
```

---

---

## 🔗 Menghubungkan Worker Node (Multi-Node Cluster)

Untuk menambahkan Worker Node baru ke dalam cluster, dapatkan Join Command / Token dari Dashboard Web (`Node Servers` -> `Add Node`), lalu jalankan perintah berikut sebagai `sudo` pada node worker:

```bash
curl -sSL http://<MASTER_IP>:9090/join.sh | sudo bash -s -- --master http://<MASTER_IP>:9090 --token <JOIN_TOKEN> --name "Worker-01"
```

Perintah di atas akan membuat user `space-lxd` + SSH key secara otomatis di node worker dan mendaftarkan agent ke Master Control Plane.

---

## 💻 Interactive Terminal CLI (`space-lxd`)

Space LXD Dashboard menyediakan **Menu CLI Interaktif Terminal** yang dapat diakses langsung dari mana saja di terminal Anda:

```bash
# Buka Menu CLI Interaktif di terminal
sudo space-lxd

# Perintah Langsung (CLI Quick Commands):
sudo space-lxd status    # Cek status kesehatan service & port API
sudo space-lxd start     # Memulai layanan Master
sudo space-lxd stop      # Menghentikan layanan
sudo space-lxd restart   # Restart layanan
sudo space-lxd list      # Tampilkan list LXD container aktif
sudo space-lxd shell     # Hubungkan langsung ke terminal container (lxc exec)
sudo space-lxd logs      # Tampilkan streaming log realtime (journalctl / file log)
sudo space-lxd rebuild   # Rebuild React UI & Go binaries
sudo space-lxd uninstall # Clean uninstall (Pilihan: Local server saja atau Cluster-wide seluruh node)
```

---

## 📜 Utility Scripts Reference

Direktori `scripts/` menyediakan skrip utilitas untuk pengelolaan aplikasi:

| Script | Deskripsi |
| :--- | :--- |
| `space-lxd` | Perintah CLI Interaktif Terminal di `/usr/local/bin/space-lxd`. |
| `./install.sh` | Skrip instalasi otomatis (membuat user `space-lxd` & Systemd Service). |
| `./scripts/join.sh` | Skrip pendaftaran & setup worker agent node baru. |
| `./scripts/space-lxd-cli.sh` | Engine utama untuk Menu CLI Terminal `space-lxd`. |
| `./scripts/build.sh` | Mengompilasi React UI (`npm run build`) dan Go binaries. |
| `./scripts/start.sh` | Memulai layanan Master secara background / Systemd. |
| `./scripts/stop.sh` | Menghentikan proses Master & Worker Agent. |
| `./scripts/status.sh` | Memeriksa status proses, port 9090, dan Systemd service. |
| `./scripts/uninstall.sh` | Menghapus instalasi (Pilihan: Local Server atau Cluster-wide seluruh node). |

---

## 🏗️ Arsitektur Sistem

```
 ┌───────────────────────────────────────────────────────────┐
 │               Space LXD Master Dashboard                  │
 │           (Go HTTP Server + React Web UI)                 │
 └──────────────────────────────┬────────────────────────────┘
                                │ WebSocket (RPC / Status)
       ┌────────────────────────┼────────────────────────┐
       ▼                        ▼                        ▼
 ┌───────────┐            ┌───────────┐            ┌───────────┐
 │  Local    │            ┌ Worker-1  │            │ Worker-2  │
 │  Master   │            │ Agent     │            │ Agent     │
 │  Agent    │            └─────┬─────┘            └─────┬─────┘
 └─────┬─────┘                  │                        │
       │ (lxc socket)           │ (lxc socket)           │ (lxc socket)
 ┌─────▼─────┐            ┌─────▼─────┐            ┌─────▼─────┐
 │ LXD Host  │            │ LXD Host  │            │ LXD Host  │
 └───────────┘            └───────────┘            └───────────┘
```

---

## ⚙️ Konfigurasi Environment & Database

Konfigurasi disimpan secara otomatis di SQLite Database (`lxd-manager.db`):

- **Default Timezone**: Dapat diatur via Halaman Pengaturan (`/settings`).
- **Master Public Endpoint URL**: URL domain publik utama untuk domain verification.
- **Default Resources**: Preset RAM, CPU, dan Storage default untuk Wizard Pembuatan LXD.

---

## 📄 Lisensi

Project ini dirilis di bawah lisensi **MIT License**.
