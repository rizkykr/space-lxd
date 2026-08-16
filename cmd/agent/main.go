package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"

	"lxd-manager-dashboard/pkg/config"
	"lxd-manager-dashboard/pkg/lxd"
	"lxd-manager-dashboard/pkg/ws"
)

func main() {
	cfg := config.LoadAgentConfig()
	log.Printf("🚀 Starting Enterprise LXD Manager Agent | Node ID: %s | Master: %s", cfg.NodeID, cfg.MasterURL)

	lxdClient := lxd.NewClient(cfg.LXDSocket)

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)

	// Exponential Backoff parameters: min 2s, max 60s
	minBackoff := 2 * time.Second
	maxBackoff := 60 * time.Second
	currentBackoff := minBackoff

	// LXD Socket Fail Count for Auto-Healing Watchdog
	lxdFailCount := 0

	for {
		err := runAgentLoop(cfg, lxdClient, interrupt, &lxdFailCount)
		if err != nil {
			// Calculate jittered exponential backoff
			jitter := time.Duration(rand.Intn(1000)) * time.Millisecond
			sleepDuration := currentBackoff + jitter

			log.Printf("⚠️ Agent connection lost: %v. Retrying in %v...", err, sleepDuration.Truncate(100*time.Millisecond))
			
			select {
			case <-time.After(sleepDuration):
			case <-interrupt:
				log.Println("👋 Agent stopping gracefully during backoff.")
				return
			}

			// Double the backoff for next time up to maxBackoff
			currentBackoff *= 2
			if currentBackoff > maxBackoff {
				currentBackoff = maxBackoff
			}
		} else {
			log.Println("👋 Agent stopping gracefully.")
			break
		}
	}
}

func runAgentLoop(cfg config.AgentConfig, lxdClient *lxd.Client, interrupt chan os.Signal, lxdFailCount *int) error {
	urls := parseMasterURLs(cfg.MasterURL)

	var conn *websocket.Conn
	for _, u := range urls {
		parsed, err := url.Parse(u)
		if err != nil {
			continue
		}

		wsScheme := "ws"
		if parsed.Scheme == "https" {
			wsScheme = "wss"
		}
		wsURL := fmt.Sprintf("%s://%s/ws/agent", wsScheme, parsed.Host)

		log.Printf("Connecting WebSocket to Master -> %s", wsURL)
		c, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err == nil {
			conn = c
			break
		}
		log.Printf("⚠️ Failed to dial %s: %v", wsURL, err)
	}

	if conn == nil {
		return fmt.Errorf("all master endpoints unreachable: %v", urls)
	}
	defer conn.Close()

	// Mutex to serialize WebSocket writes (prevent concurrent write panic)
	var wsMu sync.Mutex

	// Ping/Pong Read Deadline Keepalive Configuration (Read timeout 60s)
	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// 1. Send Register Message
	regPayload, _ := json.Marshal(map[string]string{
		"secret_token": cfg.AgentSecret,
		"node_id":      cfg.NodeID,
		"node_name":    cfg.NodeName,
	})

	regMsg := ws.WSMessage{
		Type:    ws.MsgRegister,
		NodeID:  cfg.NodeID,
		Payload: regPayload,
	}

	wsMu.Lock()
	err := conn.WriteJSON(regMsg)
	wsMu.Unlock()
	if err != nil {
		return fmt.Errorf("failed to send register message: %w", err)
	}

	// 2. Telemetry & Ping Ticker Setup
	telemetryTicker := time.NewTicker(2 * time.Second)
	defer telemetryTicker.Stop()

	pingTicker := time.NewTicker(25 * time.Second)
	defer pingTicker.Stop()

	done := make(chan struct{})

	// Read loop from Master
	go func() {
		defer close(done)
		for {
			var msg ws.WSMessage
			if err := conn.ReadJSON(&msg); err != nil {
				log.Printf("WebSocket read error: %v", err)
				return
			}
			// Reset read deadline on valid incoming RPC message
			_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
			handleMasterMessage(conn, &wsMu, lxdClient, msg)
		}
	}()

	for {
		select {
		case <-telemetryTicker.C:
			// LXD Watchdog & Self-Healing Check
			hostStats := lxdClient.GetHostStats()
			instances, err := lxdClient.ListInstances()
			if err != nil {
				*lxdFailCount++
				log.Printf("⚠️ [Watchdog] Failed to query local LXD daemon (%d/3): %v", *lxdFailCount, err)
				
				// Self-Healing Trigger: If LXD Socket fails 3 times in a row, auto-restart lxd service
				if *lxdFailCount >= 3 {
					log.Printf("🚨 [Self-Healing Watchdog] LXD daemon unresponsive for 3 cycles! Triggering auto-restart of lxd service...")
					_ = exec.Command("systemctl", "restart", "lxd").Run()
					*lxdFailCount = 0
				}
			} else {
				*lxdFailCount = 0 // Reset counter on success
			}

			hb := ws.HeartbeatPayload{
				HostStats: hostStats,
				Instances: instances,
			}
			hbBytes, _ := json.Marshal(hb)

			msg := ws.WSMessage{
				Type:    ws.MsgHeartbeat,
				NodeID:  cfg.NodeID,
				Payload: hbBytes,
			}

			wsMu.Lock()
			writeErr := conn.WriteJSON(msg)
			wsMu.Unlock()
			if writeErr != nil {
				return writeErr
			}

		case <-pingTicker.C:
			// Send WebSocket Ping control frame every 25 seconds
			wsMu.Lock()
			pingErr := conn.WriteMessage(websocket.PingMessage, nil)
			wsMu.Unlock()
			if pingErr != nil {
				return pingErr
			}

		case <-done:
			return fmt.Errorf("connection closed by server")

		case <-interrupt:
			wsMu.Lock()
			_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			wsMu.Unlock()
			return nil
		}
	}
}

var activeAgentTerms sync.Map // sessionID (ReqID) -> ptmx (io.ReadWriteCloser)

func handleMasterMessage(conn *websocket.Conn, wsMu *sync.Mutex, lxdClient *lxd.Client, msg ws.WSMessage) {
	switch msg.Type {
	case ws.MsgTermOpen, ws.MsgHostTermOpen:
		instName := msg.Action
		sessionID := msg.ReqID
		var cmd *exec.Cmd

		if msg.Type == ws.MsgHostTermOpen {
			log.Printf("🖥️ [Agent Host Terminal Tunnel] Opening Host Shell for Node '%s' (session %s)", msg.NodeID, sessionID)
			cmd = exec.Command("bash")
		} else {
			log.Printf("🖥️ [Agent LXD Terminal Tunnel] Opening terminal for LXD '%s' (session %s)", instName, sessionID)
			lxcBin := lxd.FindLXCBin()
			cmd = exec.Command(lxcBin, "exec", instName, "--", "bash")
		}
		cmd.Env = append(os.Environ(), "TERM=xterm-256color")

		ptmx, err := pty.Start(cmd)
		if err != nil {
			if msg.Type == ws.MsgHostTermOpen {
				cmd = exec.Command("sh")
			} else {
				lxcBin := lxd.FindLXCBin()
				cmd = exec.Command(lxcBin, "exec", instName, "--", "sh")
			}
			cmd.Env = append(os.Environ(), "TERM=xterm-256color")
			ptmx, err = pty.Start(cmd)
		}

		if err != nil {
			log.Printf("❌ Failed to open terminal for '%s': %v", instName, err)
			closeMsg := ws.WSMessage{
				Type:   ws.MsgTermClose,
				NodeID: msg.NodeID,
				ReqID:  sessionID,
				Error:  err.Error(),
			}
			wsMu.Lock()
			_ = conn.WriteJSON(closeMsg)
			wsMu.Unlock()
			return
		}

		activeAgentTerms.Store(sessionID, ptmx)

		// Read PTY output -> Send to Master via WebSocket
		go func() {
			defer func() {
				_ = ptmx.Close()
				activeAgentTerms.Delete(sessionID)
				closeMsg := ws.WSMessage{
					Type:   ws.MsgTermClose,
					NodeID: msg.NodeID,
					ReqID:  sessionID,
				}
				wsMu.Lock()
				_ = conn.WriteJSON(closeMsg)
				wsMu.Unlock()
			}()

			buf := make([]byte, 4096)
			for {
				n, err := ptmx.Read(buf)
				if err != nil {
					break
				}
				rawStr, _ := json.Marshal(string(buf[:n]))
				dataMsg := ws.WSMessage{
					Type:    ws.MsgTermData,
					NodeID:  msg.NodeID,
					ReqID:   sessionID,
					Payload: json.RawMessage(rawStr),
				}
				wsMu.Lock()
				writeErr := conn.WriteJSON(dataMsg)
				wsMu.Unlock()
				if writeErr != nil {
					break
				}
			}
		}()

	case ws.MsgTermData:
		sessionID := msg.ReqID
		if val, ok := activeAgentTerms.Load(sessionID); ok {
			ptmx := val.(io.ReadWriteCloser)
			var inputData []byte
			if err := json.Unmarshal(msg.Payload, &inputData); err == nil {
				_, _ = ptmx.Write(inputData)
			} else {
				_, _ = ptmx.Write([]byte(msg.Payload))
			}
		}

	case ws.MsgTermClose:
		sessionID := msg.ReqID
		if val, ok := activeAgentTerms.LoadAndDelete(sessionID); ok {
			ptmx := val.(io.ReadWriteCloser)
			_ = ptmx.Close()
		}

	case ws.MsgRPCReq:
		var req ws.RPCReqPayload
		_ = json.Unmarshal(msg.Payload, &req)

		log.Printf("📥 RPC Action '%s' for target '%s'", msg.Action, req.Name)

		respMsg := ws.WSMessage{
			Type:   ws.MsgRPCResp,
			NodeID: msg.NodeID,
			ReqID:  msg.ReqID,
			Action: msg.Action,
		}

		var err error
		switch msg.Action {
		case "start":
			err = lxdClient.StartInstance(req.Name)
		case "stop":
			err = lxdClient.StopInstance(req.Name)
		case "delete":
			err = lxdClient.DeleteInstance(req.Name)
		case "create_snapshot":
			err = lxdClient.CreateSnapshot(req.Name, req.SnapName)
		case "restore_snapshot":
			err = lxdClient.RestoreSnapshot(req.Name, req.SnapName)
		case "delete_snapshot":
			err = lxdClient.DeleteSnapshot(req.Name, req.SnapName)
		case "update_snapshot_schedule":
			err = lxdClient.UpdateSnapshotSchedule(req.Name, req.SnapEnabled, req.SnapCron, req.RetentionDays)
		case "get_snapshots":
			snapData, snapErr := lxdClient.GetInstanceSnapshotsAndSchedule(req.Name)
			if snapErr != nil {
				err = snapErr
			} else {
				respPayload, _ := json.Marshal(snapData)
				respMsg.Payload = respPayload
			}
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
			err = lxdClient.LaunchInstance(lxd.LaunchOptions{
				Name:           req.Name,
				Image:          img,
				Type:           instType,
				RAMGB:          ramGB,
				CPUCores:       cpuCores,
				DiskGB:         req.DiskGB,
				Autostart:      req.Autostart,
				SSHKey:         req.SSHKey,
				TemplatePreset: req.TemplatePreset,
				StoragePool:    req.StoragePool,
				Network:        req.Network,
				Privileged:     req.Privileged,
				Nesting:        req.Nesting,
				CPUAllowance:   req.CPUAllowance,
				MemorySwap:     req.MemorySwap,
			})
		case "self_update":
			log.Printf("🚀 [Agent Self-Update] Received cluster update command from Master! Executing space-lxd update...")
			go func() {
				time.Sleep(1 * time.Second)
				_ = exec.Command("sudo", "space-lxd", "update").Run()
			}()
		default:
			err = fmt.Errorf("unknown action '%s'", msg.Action)
		}

		if err != nil {
			respMsg.Error = err.Error()
		} else if len(respMsg.Payload) == 0 {
			respMsg.Payload = json.RawMessage(`{"status":"ok"}`)
		}

		wsMu.Lock()
		_ = conn.WriteJSON(respMsg)
		wsMu.Unlock()
	}
}

func parseRAMGB(limitStr string) int {
	clean := strings.TrimSuffix(limitStr, "GB")
	val, err := strconv.Atoi(clean)
	if err != nil || val <= 0 {
		return 2
	}
	return val
}

// parseMasterURLs splits a (possibly comma-separated) MASTER_URL list into
// clean endpoint strings, defaulting to localhost when empty.
func parseMasterURLs(masterURL string) []string {
	var out []string
	for _, u := range strings.Split(masterURL, ",") {
		u = strings.TrimSpace(u)
		if u != "" {
			out = append(out, u)
		}
	}
	if len(out) == 0 {
		out = append(out, "http://localhost:9090")
	}
	return out
}
