package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"

	"lxd-manager-dashboard/pkg/auth"
	"lxd-manager-dashboard/pkg/config"
	"lxd-manager-dashboard/pkg/db"
	"lxd-manager-dashboard/pkg/lxd"
	"lxd-manager-dashboard/pkg/updater"
	"lxd-manager-dashboard/pkg/ws"
)

type Server struct {
	cfg        config.MasterConfig
	db         *db.DB
	hub        *ws.Hub
	upgrader   websocket.Upgrader
	dashConns  sync.Map // *websocket.Conn -> bool
}

func main() {
	cfg := config.LoadMasterConfig()

	// Dynamic Port Fallback (Try 9090 -> 9091 -> 9092 ...)
	startPort, _ := strconv.Atoi(cfg.Port)
	if startPort <= 0 {
		startPort = 9090
	}

	var listener net.Listener
	finalPort := startPort
	for p := startPort; p < startPort+50; p++ {
		l, err := net.Listen("tcp", fmt.Sprintf(":%d", p))
		if err == nil {
			listener = l
			finalPort = p
			break
		}
	}

	if listener == nil {
		log.Fatalf("❌ Could not bind to any port starting from %d", startPort)
	}

	cfg.Port = fmt.Sprintf("%d", finalPort)
	if os.Getenv("MASTER_PUBLIC_URL") == "" {
		cfg.MasterPublic = fmt.Sprintf("http://localhost:%d", finalPort)
	}

	log.Printf("🚀 Starting Space LXD Master | Listening on port %s", cfg.Port)

	database, err := db.InitDB(cfg.DBPath)
	if err != nil {
		log.Fatalf("❌ Failed to initialize database: %v", err)
	}

	hub := ws.NewHub()

	srv := &Server{
		cfg:       cfg,
		db:        database,
		hub:       hub,
		upgrader:  websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }},
	}

	// Register Local Master Node in DB
	masterHost := lxd.NewClient(cfg.LXDSocket).GetHostStats()
	_ = database.UpsertNode(db.Node{
		ID:              "local-master",
		Name:            fmt.Sprintf("%s (Master)", masterHost.Hostname),
		IP:              masterHost.IP,
		Status:          "online",
		OSName:          masterHost.OS,
		Kernel:          masterHost.Kernel,
		Uptime:          masterHost.Uptime,
		LoadAvg:         masterHost.LoadAvg,
		CPUCores:        masterHost.CPUCores,
		CPUUsagePct:     masterHost.CPUUsagePct,
		RAMTotalMB:      masterHost.RAMTotalMB,
		RAMUsedMB:       masterHost.RAMUsedMB,
		StorageTotalGB:  masterHost.StorageTotalGB,
		StorageUsedGB:   masterHost.StorageUsedGB,
		StorageUsagePct: masterHost.StorageUsagePct,
		SecretToken:     "master-secret-local",
		IsMaster:        true,
	})

	// Start embedded Local Agent in background so Master acts as a node too
	go srv.startLocalAgent()

	// Start Dashboard Live Broadcast Loop
	go srv.startDashboardBroadcaster()

	// HTTP Routes
	mux := http.NewServeMux()

	// Auth & API
	mux.HandleFunc("/api/auth/status", srv.handleAuthStatus)
	mux.HandleFunc("/api/auth/setup", srv.handleAuthSetup)
	mux.HandleFunc("/api/auth/login", srv.handleLogin)
	mux.HandleFunc("/api/auth/change-password", srv.handleChangePassword)
	mux.HandleFunc("/api/nodes", srv.handleGetNodes)
	mux.HandleFunc("/api/nodes/join-token", srv.handleCreateJoinToken)
	mux.HandleFunc("/api/nodes/register", srv.handleAgentRegister)
	mux.HandleFunc("/api/nodes/", srv.handleNodeAction)
	mux.HandleFunc("/api/storage-pools", srv.handleGetStoragePools)
	mux.HandleFunc("/api/networks", srv.handleGetNetworks)
	mux.HandleFunc("/api/logs", srv.handleGetAuditLogs)
	mux.HandleFunc("/api/ssh-keys", srv.handleSSHKeys)
	mux.HandleFunc("/api/settings", srv.handleSettings)
	mux.HandleFunc("/api/system/version", srv.handleSystemVersion)
	mux.HandleFunc("/api/system/update", srv.handleSystemUpdate)

	// WebSockets
	mux.HandleFunc("/ws/agent", srv.handleWSAgent)
	mux.HandleFunc("/ws/dashboard", srv.handleWSDashboard)
	mux.HandleFunc("/ws/terminal", srv.handleWSTerminal)
	mux.HandleFunc("/ws/node-terminal", srv.handleWSNodeTerminal)

	// Downloads & Scripts
	mux.HandleFunc("/join.sh", srv.handleServeJoinScript)
	mux.HandleFunc("/downloads/lxd-manager-agent", srv.handleDownloadAgent)
	mux.HandleFunc("/download/agent", srv.handleDownloadAgent)

	// Static Web Dashboard SPA
	webDir := filepath.Join(".", "web", "dist")
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		webDir = filepath.Join(".", "web")
	}
	fileServer := http.FileServer(http.Dir(webDir))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/ws/") {
			return
		}
		path := filepath.Join(webDir, r.URL.Path)
		if _, err := os.Stat(path); os.IsNotExist(err) {
			http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
			return
		}
		fileServer.ServeHTTP(w, r)
	})

	log.Printf("🌐 Master Dashboard ready at: %s", cfg.MasterPublic)
	if err := http.Serve(listener, srv.corsMiddleware(mux)); err != nil {
		log.Fatalf("❌ HTTP Server stopped: %v", err)
	}
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── HTTP API Handlers ───────────────────────────────────────────────

func (s *Server) handleAuthStatus(w http.ResponseWriter, r *http.Request) {
	hasAdmin := s.db.HasUsers()
	masterPub := s.db.GetSetting("master_public_url", s.cfg.MasterPublic)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"setup_completed": hasAdmin,
		"master_public":   masterPub,
	})
}

func (s *Server) handleAuthSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Username     string `json:"username"`
		Password     string `json:"password"`
		MasterPublic string `json:"master_public"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.Password == "" {
		http.Error(w, "Invalid username or password", http.StatusBadRequest)
		return
	}

	user, err := s.db.CreateAdminUser(req.Username, req.Password)
	if err != nil {
		http.Error(w, "Failed to create admin user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if req.MasterPublic != "" {
		s.cfg.MasterPublic = req.MasterPublic
	}

	token, _ := auth.GenerateToken(user.ID, user.Username, user.Role, s.cfg.JWTSecret)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
		"token":  token,
		"user":   user,
	})
}

func (s *Server) handleChangePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Username    string `json:"username"`
		OldPassword string `json:"old_password"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Username == "" || req.OldPassword == "" || req.NewPassword == "" {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	if err := s.db.UpdateUserPassword(req.Username, req.OldPassword, req.NewPassword); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "Password berhasil diperbarui"})
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	user, err := s.db.AuthenticateUser(req.Username, req.Password)
	if err != nil {
		http.Error(w, "Invalid username or password", http.StatusUnauthorized)
		return
	}

	token, err := auth.GenerateToken(user.ID, user.Username, user.Role, s.cfg.JWTSecret)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"token": token,
		"user":  user,
	})
}

func (s *Server) handleGetNodes(w http.ResponseWriter, r *http.Request) {
	nodes, err := s.db.GetAllNodes()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	type NodeResponse struct {
		db.Node
		Instances []lxd.LXD `json:"instances"`
		Lxds      []lxd.LXD `json:"lxds"`
	}

	var result []NodeResponse
	for _, n := range nodes {
		insts := []lxd.LXD{}
		if agent, ok := s.hub.GetAgent(n.ID); ok {
			n.Status = "online"
			n.CPUUsagePct = agent.HostStats.CPUUsagePct
			n.RAMUsedMB = agent.HostStats.RAMUsedMB
			n.RAMTotalMB = agent.HostStats.RAMTotalMB
			n.CPUCores = agent.HostStats.CPUCores
			n.StorageTotalGB = agent.HostStats.StorageTotalGB
			n.StorageUsedGB = agent.HostStats.StorageUsedGB
			n.StorageUsagePct = agent.HostStats.StorageUsagePct
			n.OSName = agent.HostStats.OS
			n.Kernel = agent.HostStats.Kernel
			n.Uptime = agent.HostStats.Uptime
			n.LoadAvg = agent.HostStats.LoadAvg
			if agent.HostStats.IP != "" {
				n.IP = agent.HostStats.IP
			}
			insts = agent.Instances
		} else if n.IsMaster {
			n.Status = "online"
			client := lxd.NewClient(s.cfg.LXDSocket)
			stats := client.GetHostStats()
			n.CPUUsagePct = stats.CPUUsagePct
			n.RAMUsedMB = stats.RAMUsedMB
			n.RAMTotalMB = stats.RAMTotalMB
			n.CPUCores = stats.CPUCores
			n.StorageTotalGB = stats.StorageTotalGB
			n.StorageUsedGB = stats.StorageUsedGB
			n.StorageUsagePct = stats.StorageUsagePct
			n.OSName = stats.OS
			n.Kernel = stats.Kernel
			n.Uptime = stats.Uptime
			n.LoadAvg = stats.LoadAvg
			if stats.IP != "" {
				n.IP = stats.IP
			}
			insts, _ = client.ListInstances()
		}
		result = append(result, NodeResponse{
			Node:      n,
			Instances: insts,
			Lxds:      insts,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

func (s *Server) handleCreateJoinToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	tokenStr := auth.GenerateRandomToken(16)
	if err := s.db.CreateJoinToken(tokenStr, 60); err != nil {
		http.Error(w, "Failed to create join token", http.StatusInternalServerError)
		return
	}

	masterHost := s.cfg.MasterPublic
	joinCommand := fmt.Sprintf("curl -sSL %s/join.sh | sudo bash -s -- --master %s --token %s", masterHost, masterHost, tokenStr)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"token":        tokenStr,
		"expires_in":   "60 minutes",
		"join_command": joinCommand,
	})
}

func (s *Server) handleAgentRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Token    string `json:"token"`
		NodeID   string `json:"node_id"`
		NodeName string `json:"node_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	if !s.db.ValidateAndConsumeJoinToken(req.Token, req.NodeID) {
		http.Error(w, "Invalid or expired join token", http.StatusForbidden)
		return
	}

	secretToken := auth.GenerateRandomToken(32)

	err := s.db.UpsertNode(db.Node{
		ID:          req.NodeID,
		Name:        req.NodeName,
		IP:          r.RemoteAddr,
		Status:      "online",
		SecretToken: secretToken,
		IsMaster:    false,
	})
	if err != nil {
		http.Error(w, "Failed to register node", http.StatusInternalServerError)
		return
	}

	log.Printf("✅ Node registered -> ID: %s | Name: %s", req.NodeID, req.NodeName)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":       "registered",
		"secret_token": secretToken,
		"node_id":      req.NodeID,
	})
}

func (s *Server) handleNodeAction(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) < 3 {
		http.Error(w, "Invalid endpoint", http.StatusBadRequest)
		return
	}
	nodeID := parts[2]

	var req struct {
		Action         string `json:"action"` // start, stop, delete, launch, rename_node, update_node_domain, etc.
		Name           string `json:"name"`
		NewName        string `json:"new_name"`
		CustomIPDomain string `json:"custom_ip_domain"`
		Image          string `json:"image"`
		Type           string `json:"type"`
		RAMGB          int    `json:"ram_gb"`
		CPUCores       int    `json:"cpu_cores"`
		DiskGB         int    `json:"disk_gb"`
		Autostart      bool   `json:"autostart"`
		SSHKey         string `json:"ssh_key"`
		TemplatePreset string `json:"template_preset"`
		SnapName       string `json:"snap_name"`
		SnapEnabled    bool   `json:"snap_enabled"`
		SnapCron       string `json:"snap_cron"`
		RetentionDays  int    `json:"retention_days"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	log.Printf("🎮 Action '%s' requested for LXD '%s' on Node '%s'", req.Action, req.Name, nodeID)

	if req.Action == "rename_node" {
		newName := strings.TrimSpace(req.NewName)
		if newName == "" {
			http.Error(w, "Nama baru tidak boleh kosong", http.StatusBadRequest)
			return
		}
		if err := s.db.UpdateNodeName(nodeID, newName); err != nil {
			http.Error(w, "Gagal mengubah nama node: "+err.Error(), http.StatusInternalServerError)
			return
		}
		_ = s.db.LogAuditAction("RENAME_NODE", nodeID, fmt.Sprintf("Renamed node to '%s'", newName))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "Nama node berhasil diperbarui"})
		return
	}

	if req.Action == "update_node_domain" {
		customDomain := strings.TrimSpace(req.CustomIPDomain)
		if err := s.db.UpdateNodeIPDomain(nodeID, customDomain); err != nil {
			http.Error(w, "Gagal mengubah IP/Domain node: "+err.Error(), http.StatusInternalServerError)
			return
		}
		_ = s.db.LogAuditAction("UPDATE_NODE_DOMAIN", nodeID, fmt.Sprintf("Set custom IP/Domain to '%s'", customDomain))
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "Domain/IP Custom node berhasil diperbarui"})
		return
	}
	if req.Action == "delete_node" {
		log.Printf("🗑️ Request deleting Node '%s' and purging all its LXD containers...", nodeID)
		
		// 1. Purge all LXD containers on the node
		if agent, ok := s.hub.GetAgent(nodeID); ok {
			for _, inst := range agent.Instances {
				log.Printf("Deleting LXD '%s' on node '%s' before purging node...", inst.Name, nodeID)
				_, _ = s.hub.SendRPC(nodeID, "delete", ws.RPCReqPayload{Name: inst.Name}, 15*time.Second)
			}
		} else if nodeID == "local-master" {
			lxdClient := lxd.NewClient(s.cfg.LXDSocket)
			if insts, err := lxdClient.ListInstances(); err == nil {
				for _, inst := range insts {
					_ = lxdClient.DeleteInstance(inst.Name)
				}
			}
		}

		// 2. Remove Node entry from DB
		if err := s.db.DeleteNode(nodeID); err != nil {
			http.Error(w, "Gagal menghapus node dari database: "+err.Error(), http.StatusInternalServerError)
			return
		}
		_ = s.db.LogAuditAction("DELETE_NODE", nodeID, "Deleted worker node and purged all containers")

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "message": "Node dan seluruh LXD container di dalamnya berhasil dihapus"})
		return
	}

	if nodeID == "local-master" {
		lxdClient := lxd.NewClient(s.cfg.LXDSocket)
		var err error
		switch req.Action {
		case "start":
			err = lxdClient.StartInstance(req.Name)
			if err == nil { _ = s.db.LogAuditAction("START_LXD", req.Name, "Started LXD container on Master") }
		case "stop":
			err = lxdClient.StopInstance(req.Name)
			if err == nil { _ = s.db.LogAuditAction("STOP_LXD", req.Name, "Stopped LXD container on Master") }
		case "restart":
			err = lxdClient.RestartInstance(req.Name)
			if err == nil { _ = s.db.LogAuditAction("RESTART_LXD", req.Name, "Restarted LXD container on Master") }
		case "pause":
			err = lxdClient.PauseInstance(req.Name)
			if err == nil { _ = s.db.LogAuditAction("PAUSE_LXD", req.Name, "Paused LXD container on Master") }
		case "resume":
			err = lxdClient.ResumeInstance(req.Name)
			if err == nil { _ = s.db.LogAuditAction("RESUME_LXD", req.Name, "Resumed LXD container on Master") }
		case "delete":
			err = lxdClient.DeleteInstance(req.Name)
			if err == nil { _ = s.db.LogAuditAction("DELETE_LXD", req.Name, "Deleted LXD container on Master") }
		case "update_config":
			err = lxdClient.UpdateInstanceConfig(req.Name, req.RAMGB, req.CPUCores, req.Autostart)
			if err == nil { _ = s.db.LogAuditAction("UPDATE_CONFIG", req.Name, fmt.Sprintf("Updated RAM: %dGB, Cores: %d", req.RAMGB, req.CPUCores)) }
		case "create_snapshot":
			err = lxdClient.CreateSnapshot(req.Name, req.SnapName)
			if err == nil { _ = s.db.LogAuditAction("CREATE_SNAPSHOT", req.Name, fmt.Sprintf("Created snapshot '%s'", req.SnapName)) }
		case "restore_snapshot":
			err = lxdClient.RestoreSnapshot(req.Name, req.SnapName)
			if err == nil { _ = s.db.LogAuditAction("RESTORE_SNAPSHOT", req.Name, fmt.Sprintf("Restored snapshot '%s'", req.SnapName)) }
		case "delete_snapshot":
			err = lxdClient.DeleteSnapshot(req.Name, req.SnapName)
			if err == nil { _ = s.db.LogAuditAction("DELETE_SNAPSHOT", req.Name, fmt.Sprintf("Deleted snapshot '%s'", req.SnapName)) }
		case "update_snapshot_schedule":
			err = lxdClient.UpdateSnapshotSchedule(req.Name, req.SnapEnabled, req.SnapCron, req.RetentionDays)
			if err == nil { _ = s.db.LogAuditAction("UPDATE_SNAPSHOT_SCHEDULE", req.Name, fmt.Sprintf("Updated snapshot schedule: %s", req.SnapCron)) }
		case "get_snapshots":
			snapData, snapErr := lxdClient.GetInstanceSnapshotsAndSchedule(req.Name)
			if snapErr != nil {
				http.Error(w, snapErr.Error(), http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(snapData)
			return
		case "launch":
			ramGB := req.RAMGB
			if ramGB == 0 {
				ramGB = 2
			}
			cpuCores := req.CPUCores
			if cpuCores == 0 {
				cpuCores = 2
			}
			img := req.Image
			if img == "" {
				img = "ubuntu:24.04"
			}
			instType := req.Type
			if instType == "" {
				instType = "container"
			}

			if r.URL.Query().Get("stream") == "true" {
				w.Header().Set("Content-Type", "text/plain; charset=utf-8")
				w.Header().Set("X-Content-Type-Options", "nosniff")
				w.Header().Set("Cache-Control", "no-cache")
				flusher, ok := w.(http.Flusher)

				logFn := func(msg string) {
					fmt.Fprintf(w, "%s\n", msg)
					if ok {
						flusher.Flush()
					}
				}

				err = lxdClient.LaunchInstanceStream(req.Name, img, instType, ramGB, cpuCores, req.DiskGB, req.Autostart, req.SSHKey, req.TemplatePreset, logFn)
				if err != nil {
					logFn(fmt.Sprintf("❌ Error: %s", err.Error()))
					return
				}
				_ = s.db.LogAuditAction("LAUNCH_LXD", req.Name, fmt.Sprintf("Launched LXD %s '%s' on Master (Image: %s, RAM: %dGB)", instType, req.Name, img, ramGB))
				logFn(fmt.Sprintf("✅ SUCCESS: LXD container '%s' successfully created!", req.Name))
				return
			}

			err = lxdClient.LaunchInstance(req.Name, img, instType, ramGB, cpuCores, req.DiskGB, req.Autostart, req.SSHKey, req.TemplatePreset)
			if err == nil {
				_ = s.db.LogAuditAction("LAUNCH_LXD", req.Name, fmt.Sprintf("Launched LXD %s '%s' on Master (Image: %s)", instType, req.Name, img))
			}
		default:
			err = fmt.Errorf("unknown action '%s'", req.Action)
		}

		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		return
	}

	// Dispatch to Remote Node via Agent RPC
	payload := ws.RPCReqPayload{
		Name:           req.Name,
		Image:          req.Image,
		Type:           req.Type,
		RAMGB:          req.RAMGB,
		CPUCores:       req.CPUCores,
		DiskGB:         req.DiskGB,
		Autostart:      req.Autostart,
		SSHKey:         req.SSHKey,
		TemplatePreset: req.TemplatePreset,
		SnapName:       req.SnapName,
		SnapEnabled:    req.SnapEnabled,
		SnapCron:       req.SnapCron,
		RetentionDays:  req.RetentionDays,
	}
	rpcTimeout := 30 * time.Second
	if req.Action == "launch" {
		rpcTimeout = 5 * time.Minute
	}

	if req.Action == "launch" && r.URL.Query().Get("stream") == "true" {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-cache")
		flusher, ok := w.(http.Flusher)

		logFn := func(msg string) {
			fmt.Fprintf(w, "%s\n", msg)
			if ok {
				flusher.Flush()
			}
		}

		logFn(fmt.Sprintf("📡 Mengirim instruksi RPC Launch ke Worker Node '%s'...", nodeID))
		logFn(fmt.Sprintf("📦 Menyiapkan LXD %s '%s' (Image: %s, RAM: %dGB, Cores: %d)...", req.Type, req.Name, req.Image, req.RAMGB, req.CPUCores))

		resp, err := s.hub.SendRPC(nodeID, req.Action, payload, rpcTimeout)
		if err != nil {
			logFn(fmt.Sprintf("❌ Error RPC Agent: %s", err.Error()))
			return
		}

		if resp.Error != "" {
			logFn(fmt.Sprintf("❌ Launch Error: %s", resp.Error))
			return
		}

		logFn("⚙️ Mengkonfigurasi parameter resource & Cloud-Init...")
		logFn(fmt.Sprintf("✅ SUCCESS: LXD container '%s' successfully created on Worker Node!", req.Name))
		_ = s.db.LogAuditAction("LAUNCH_LXD", req.Name, fmt.Sprintf("Launched LXD '%s' on Worker Node '%s'", req.Name, nodeID))
		return
	}

	resp, err := s.hub.SendRPC(nodeID, req.Action, payload, rpcTimeout)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if resp.Error == "" {
		_ = s.db.LogAuditAction(strings.ToUpper(req.Action)+"_LXD", req.Name, fmt.Sprintf("Executed '%s' on Worker Node '%s'", req.Action, nodeID))
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) handleGetStoragePools(w http.ResponseWriter, r *http.Request) {
	client := lxd.NewClient(s.cfg.LXDSocket)
	pools, _ := client.ListStoragePools()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(pools)
}

func (s *Server) handleGetNetworks(w http.ResponseWriter, r *http.Request) {
	client := lxd.NewClient(s.cfg.LXDSocket)
	nets, _ := client.ListNetworks()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(nets)
}

func (s *Server) handleGetAuditLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := s.db.GetAuditLogs()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(logs)
}

func (s *Server) handleSSHKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		var req struct {
			Name      string `json:"name"`
			PublicKey string `json:"public_key"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Name == "" || req.PublicKey == "" {
			http.Error(w, "Invalid name or public key", http.StatusBadRequest)
			return
		}
		if err := s.db.AddSSHKey(req.Name, req.PublicKey); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		return
	}

	keys, err := s.db.GetSSHKeys()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(keys)
}

// ── WebSockets Handlers ─────────────────────────────────────────────

func (s *Server) handleWSAgent(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS Upgrade error: %v", err)
		return
	}

	var regMsg ws.WSMessage
	if err := conn.ReadJSON(&regMsg); err != nil {
		conn.Close()
		return
	}

	if regMsg.Type != ws.MsgRegister {
		conn.Close()
		return
	}

	var regPayload struct {
		SecretToken string `json:"secret_token"`
		NodeID      string `json:"node_id"`
		NodeName    string `json:"node_name"`
	}
	_ = json.Unmarshal(regMsg.Payload, &regPayload)

	agent := s.hub.RegisterAgentConn(regPayload.NodeID, regPayload.NodeName, conn)
	defer s.hub.UnregisterAgentConn(regPayload.NodeID)

	for {
		var msg ws.WSMessage
		if err := conn.ReadJSON(&msg); err != nil {
			break
		}
		s.hub.HandleAgentMessage(agent, msg)
	}
}

func (s *Server) handleWSDashboard(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	s.dashConns.Store(conn, true)
	defer func() {
		s.dashConns.Delete(conn)
		conn.Close()
	}()

	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (s *Server) startDashboardBroadcaster() {
	ticker := time.NewTicker(1 * time.Second)
	for range ticker.C {
		nodes, err := s.db.GetAllNodes()
		if err != nil {
			continue
		}

		type NodeResponse struct {
			db.Node
			Instances []lxd.LXD `json:"instances"`
			Lxds      []lxd.LXD `json:"lxds"`
		}

		var result []NodeResponse
		for _, n := range nodes {
			insts := []lxd.LXD{}
			if agent, ok := s.hub.GetAgent(n.ID); ok {
				n.Status = "online"
				n.CPUUsagePct = agent.HostStats.CPUUsagePct
				n.RAMUsedMB = agent.HostStats.RAMUsedMB
				n.RAMTotalMB = agent.HostStats.RAMTotalMB
				n.CPUCores = agent.HostStats.CPUCores
				n.StorageTotalGB = agent.HostStats.StorageTotalGB
				n.StorageUsedGB = agent.HostStats.StorageUsedGB
				n.StorageUsagePct = agent.HostStats.StorageUsagePct
				n.OSName = agent.HostStats.OS
				n.Kernel = agent.HostStats.Kernel
				n.Uptime = agent.HostStats.Uptime
				n.LoadAvg = agent.HostStats.LoadAvg
				if agent.HostStats.IP != "" {
					n.IP = agent.HostStats.IP
				}
				insts = agent.Instances
			} else if n.IsMaster {
				n.Status = "online"
				client := lxd.NewClient(s.cfg.LXDSocket)
				stats := client.GetHostStats()
				n.CPUUsagePct = stats.CPUUsagePct
				n.RAMUsedMB = stats.RAMUsedMB
				n.RAMTotalMB = stats.RAMTotalMB
				n.CPUCores = stats.CPUCores
				n.StorageTotalGB = stats.StorageTotalGB
				n.StorageUsedGB = stats.StorageUsedGB
				n.StorageUsagePct = stats.StorageUsagePct
				n.OSName = stats.OS
				n.Kernel = stats.Kernel
				n.Uptime = stats.Uptime
				n.LoadAvg = stats.LoadAvg
				if stats.IP != "" {
					n.IP = stats.IP
				}
				insts, _ = client.ListInstances()
			}
			result = append(result, NodeResponse{
				Node:      n,
				Instances: insts,
				Lxds:      insts,
			})
		}

		payload, err := json.Marshal(result)
		if err != nil {
			continue
		}

		s.dashConns.Range(func(key, value interface{}) bool {
			c := key.(*websocket.Conn)
			_ = c.WriteMessage(websocket.TextMessage, payload)
			return true
		})
	}
}

func (s *Server) handleWSTerminal(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	instName := r.URL.Query().Get("name")
	nodeID := r.URL.Query().Get("nodeId")

	if instName == "" {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("Error: LXD instance name required\r\n"))
		return
	}

	lxcBin := lxd.FindLXCBin()
	var cmd *exec.Cmd

	// Check if target node is a remote worker node
	isWorker := false
	var workerIP string
	if nodeID != "" && nodeID != "local-master" {
		nodes, _ := s.db.GetAllNodes()
		for _, n := range nodes {
			if (n.ID == nodeID || n.Name == nodeID) && !n.IsMaster {
				isWorker = true
				nodeID = n.ID // Normalize to real Node ID
				workerIP = n.IP
				if strings.TrimSpace(n.CustomIPDomain) != "" {
					workerIP = strings.TrimSpace(n.CustomIPDomain)
				}
				break
			}
		}
	}

	if isWorker {
		sessionID := fmt.Sprintf("term_%d", time.Now().UnixNano())
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\x1b[32m🔌 Opening direct WebSocket PTY Tunnel to LXD '%s' on Worker Node...\x1b[0m\r\n\r\n", instName)))

		s.hub.RegisterTermSession(sessionID, conn)
		defer s.hub.UnregisterTermSession(sessionID)

		// 1. Send TERM_OPEN to Worker Agent over Agent WebSocket
		openMsg := ws.WSMessage{
			Type:   ws.MsgTermOpen,
			NodeID: nodeID,
			ReqID:  sessionID,
			Action: instName,
		}

		if err := s.hub.SendWSMessage(nodeID, openMsg); err != nil {
			// Fallback to SSH exec if Agent WS is unavailable
			cleanIP := workerIP
			if idx := strings.Index(cleanIP, ":"); idx != -1 {
				cleanIP = cleanIP[:idx]
			}
			_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\x1b[33m⚠️ Agent WS Tunnel unavailable (%v). Falling back to SSH tunnel (%s)...\x1b[0m\r\n\r\n", err, cleanIP)))
			
			sshOpts := []string{
				"-o", "StrictHostKeyChecking=no",
				"-o", "ConnectTimeout=10",
				"-t",
				fmt.Sprintf("space-lxd@%s", cleanIP),
				fmt.Sprintf("lxc exec %s -- bash || lxc exec %s -- sh", instName, instName),
			}
			cmd = exec.Command("ssh", sshOpts...)
			cmd.Env = append(os.Environ(), "TERM=xterm-256color")

			ptmx, ptyErr := pty.Start(cmd)
			if ptyErr != nil {
				_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\nFailed to start terminal: %v\r\n", ptyErr)))
				return
			}
			defer func() {
				_ = ptmx.Close()
				if cmd.Process != nil {
					_ = cmd.Process.Kill()
				}
			}()

			var wsMu sync.Mutex
			done := make(chan struct{})
			go func() {
				buf := make([]byte, 4096)
				for {
					n, err := ptmx.Read(buf)
					if err != nil {
						break
					}
					wsMu.Lock()
					_ = conn.WriteMessage(websocket.TextMessage, buf[:n])
					wsMu.Unlock()
				}
			}()
			for {
				_, msg, err := conn.ReadMessage()
				if err != nil {
					break
				}
				_, _ = ptmx.Write(msg)
			}
			close(done)
			return
		}

		// Read browser input -> send TERM_DATA to Agent WS
		defer func() {
			closeMsg := ws.WSMessage{
				Type:   ws.MsgTermClose,
				NodeID: nodeID,
				ReqID:  sessionID,
			}
			_ = s.hub.SendWSMessage(nodeID, closeMsg)
		}()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}
			payload, _ := json.Marshal(msg)
			dataMsg := ws.WSMessage{
				Type:    ws.MsgTermData,
				NodeID:  nodeID,
				ReqID:   sessionID,
				Payload: payload,
			}
			_ = s.hub.SendWSMessage(nodeID, dataMsg)
		}
		return
	}

	// Target LXD is on local master node -> Execute local lxc exec
	cmd = exec.Command(lxcBin, "exec", instName, "--", "bash")
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		// Fallback to sh if bash is not in container
		cmd = exec.Command(lxcBin, "exec", instName, "--", "sh")
		cmd.Env = append(os.Environ(), "TERM=xterm-256color")
		ptmx, err = pty.Start(cmd)
	}

	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\nFailed to start terminal: %v\r\n", err)))
		return
	}

	defer func() {
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	}()

	// Use a mutex to protect concurrent WebSocket writes
	var wsMu sync.Mutex

	// Configure WebSocket keepalive: ping every 25s, timeout after 60s
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Goroutine: send ping frames every 25 seconds
	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				wsMu.Lock()
				err := conn.WriteMessage(websocket.PingMessage, nil)
				wsMu.Unlock()
				if err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()

	// Pipe PTY stdout -> WebSocket client
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				break
			}
			wsMu.Lock()
			writeErr := conn.WriteMessage(websocket.TextMessage, buf[:n])
			wsMu.Unlock()
			if writeErr != nil {
				break
			}
		}
	}()

	// Pipe WebSocket stdin -> PTY stdin
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		_, _ = ptmx.Write(msg)
	}
	close(done)
}

// handleWSNodeTerminal opens a PTY shell on the host node.
// For worker nodes: tunnels direct host bash PTY shell over Agent WebSocket.
// For master node: spawns a local bash shell on Master host.
func (s *Server) handleWSNodeTerminal(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	nodeID := r.URL.Query().Get("nodeId")

	// Look up node info from DB to display context
	nodes, _ := s.db.GetAllNodes()
	var nodeIP, nodeName string
	isMasterNode := true
	for _, n := range nodes {
		if (n.ID == nodeID || n.Name == nodeID) && !n.IsMaster {
			isMasterNode = false
			nodeID = n.ID // Normalize ID
			nodeIP = n.IP
			if strings.TrimSpace(n.CustomIPDomain) != "" {
				nodeIP = strings.TrimSpace(n.CustomIPDomain)
			}
			nodeName = n.Name
			break
		}
	}

	if !isMasterNode {
		sessionID := fmt.Sprintf("host_term_%d", time.Now().UnixNano())
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\x1b[32m🔌 Opening direct Host Shell WebSocket PTY Tunnel to Worker Node '%s' (%s)...\x1b[0m\r\n\r\n", nodeName, nodeIP)))

		s.hub.RegisterTermSession(sessionID, conn)
		defer s.hub.UnregisterTermSession(sessionID)

		openMsg := ws.WSMessage{
			Type:   ws.MsgHostTermOpen,
			NodeID: nodeID,
			ReqID:  sessionID,
		}

		if err := s.hub.SendWSMessage(nodeID, openMsg); err != nil {
			_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\n\x1b[31m❌ Worker Node Agent WS disconnect: %v\x1b[0m\r\n", err)))
			return
		}

		defer func() {
			closeMsg := ws.WSMessage{
				Type:   ws.MsgTermClose,
				NodeID: nodeID,
				ReqID:  sessionID,
			}
			_ = s.hub.SendWSMessage(nodeID, closeMsg)
		}()

		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				break
			}
			payload, _ := json.Marshal(msg)
			dataMsg := ws.WSMessage{
				Type:    ws.MsgTermData,
				NodeID:  nodeID,
				ReqID:   sessionID,
				Payload: payload,
			}
			_ = s.hub.SendWSMessage(nodeID, dataMsg)
		}
		return
	}

	// Spawn local bash on the master host
	cmd := exec.Command("bash")
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	ptmx, err := pty.Start(cmd)
	if err != nil {
		cmd = exec.Command("sh")
		cmd.Env = append(os.Environ(), "TERM=xterm-256color")
		ptmx, err = pty.Start(cmd)
	}
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("\r\nFailed to start host terminal: %v\r\n", err)))
		return
	}
	defer func() {
		_ = ptmx.Close()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	}()

	var wsMu sync.Mutex
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	done := make(chan struct{})
	go func() {
		ticker := time.NewTicker(25 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				wsMu.Lock()
				err := conn.WriteMessage(websocket.PingMessage, nil)
				wsMu.Unlock()
				if err != nil {
					return
				}
			case <-done:
				return
			}
		}
	}()

	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				break
			}
			wsMu.Lock()
			writeErr := conn.WriteMessage(websocket.TextMessage, buf[:n])
			wsMu.Unlock()
			if writeErr != nil {
				break
			}
		}
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			break
		}
		_, _ = ptmx.Write(msg)
	}
	close(done)
}

func (s *Server) handleServeJoinScript(w http.ResponseWriter, r *http.Request) {
	joinPath := filepath.Join(".", "scripts", "join.sh")
	content, err := os.ReadFile(joinPath)
	if err != nil {
		http.Error(w, "join.sh not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write(content)
}

func (s *Server) handleDownloadAgent(w http.ResponseWriter, r *http.Request) {
	repoPath := s.getRepoPath()
	agentBin := filepath.Join(repoPath, "bin", "lxd-manager-agent")
	if _, err := os.Stat(agentBin); os.IsNotExist(err) {
		agentBin = filepath.Join(repoPath, "lxd-manager-agent")
	}
	if _, err := os.Stat(agentBin); os.IsNotExist(err) {
		agentBin = filepath.Join(".", "bin", "lxd-manager-agent")
	}
	file, err := os.Open(agentBin)
	if err != nil {
		http.Error(w, "Agent binary not ready: "+err.Error(), http.StatusNotFound)
		return
	}
	defer file.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment; filename=lxd-manager-agent")
	_, _ = io.Copy(w, file)
}

func (s *Server) startLocalAgent() {
	time.Sleep(2 * time.Second)
	log.Println("🔄 Embedded Local Master Agent monitoring initialized")
}

func (s *Server) handleSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method == "GET" {
		settings := s.db.GetAllSettings()
		if _, exists := settings["master_public_url"]; !exists {
			settings["master_public_url"] = s.cfg.MasterPublic
		}
		if _, exists := settings["global_timezone"]; !exists {
			settings["global_timezone"] = lxd.GetSystemTimezone()
		}
		if _, exists := settings["default_ram_gb"]; !exists {
			settings["default_ram_gb"] = "2"
		}
		if _, exists := settings["default_cpu_cores"]; !exists {
			settings["default_cpu_cores"] = "2"
		}
		if _, exists := settings["default_disk_gb"]; !exists {
			settings["default_disk_gb"] = "20"
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(settings)
		return
	}

	if r.Method == "POST" {
		var req map[string]string
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid body", http.StatusBadRequest)
			return
		}
		for k, v := range req {
			_ = s.db.SetSetting(k, v)
			if k == "master_public_url" && v != "" {
				s.cfg.MasterPublic = v
			}
		}
		_ = s.db.LogAuditAction("UPDATE_SETTINGS", "global", "Updated global cluster settings")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		return
	}

	http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
}

func (s *Server) getRepoPath() string {
	if path, err := os.Getwd(); err == nil && fileExists(filepath.Join(path, "scripts", "build.sh")) {
		return path
	}
	if fileExists("/opt/space-lxd/scripts/build.sh") {
		return "/opt/space-lxd"
	}
	path, _ := os.Getwd()
	return path
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func (s *Server) handleSystemVersion(w http.ResponseWriter, r *http.Request) {
	info, err := updater.CheckForUpdates(s.getRepoPath())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(info)
}

func (s *Server) handleSystemUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-cache")

	flusher, flusherOk := w.(http.Flusher)

	logFn := func(msg string) {
		_, _ = fmt.Fprintln(w, msg)
		if flusherOk {
			flusher.Flush()
		}
	}

	err := updater.ApplyUpdate(s.getRepoPath(), logFn)
	if err != nil {
		logFn("❌ Update error: " + err.Error())
	} else {
		logFn("📢 Menyiarkan (broadcasting) instruksi update otomatis ke seluruh Worker Node Joiner di kluster...")
		s.hub.ClusterBroadcastUpdate()
	}
}
