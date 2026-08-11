package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url"
	"os"
	"os/signal"

	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"

	"lxd-manager-dashboard/pkg/config"
	"lxd-manager-dashboard/pkg/lxd"
	"lxd-manager-dashboard/pkg/ws"
)

func main() {
	cfg := config.LoadAgentConfig()
	log.Printf("🚀 Starting LXD Manager Agent | Node ID: %s | Master: %s", cfg.NodeID, cfg.MasterURL)

	lxdClient := lxd.NewClient(cfg.LXDSocket)

	interrupt := make(chan os.Signal, 1)
	signal.Notify(interrupt, os.Interrupt, syscall.SIGTERM)

	for {
		err := runAgentLoop(cfg, lxdClient, interrupt)
		if err != nil {
			log.Printf("⚠️ Agent connection lost: %v. Retrying in 5 seconds...", err)
			time.Sleep(5 * time.Second)
		} else {
			log.Println("👋 Agent stopping gracefully.")
			break
		}
	}
}

func runAgentLoop(cfg config.AgentConfig, lxdClient *lxd.Client, interrupt chan os.Signal) error {
	u, err := url.Parse(cfg.MasterURL)
	if err != nil {
		return fmt.Errorf("invalid master URL: %w", err)
	}

	wsScheme := "ws"
	if u.Scheme == "https" {
		wsScheme = "wss"
	}
	wsURL := fmt.Sprintf("%s://%s/ws/agent", wsScheme, u.Host)

	log.Printf("Connecting WebSocket to Master -> %s", wsURL)
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return fmt.Errorf("failed to dial websocket: %w", err)
	}
	defer conn.Close()

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
	if err := conn.WriteJSON(regMsg); err != nil {
		return fmt.Errorf("failed to send register message: %w", err)
	}

	// 2. Start Telemetry Loop
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

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
			handleMasterMessage(conn, lxdClient, msg)
		}
	}()

	for {
		select {
		case <-ticker.C:
			hostStats := lxdClient.GetHostStats()
			instances, _ := lxdClient.ListInstances()

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
			if err := conn.WriteJSON(msg); err != nil {
				return err
			}

		case <-done:
			return fmt.Errorf("connection closed by server")

		case <-interrupt:
			_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
			return nil
		}
	}
}

func handleMasterMessage(conn *websocket.Conn, lxdClient *lxd.Client, msg ws.WSMessage) {
	if msg.Type == ws.MsgRPCReq {
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
			err = lxdClient.LaunchInstance(req.Name, img, instType, ramGB, cpuCores, req.DiskGB, req.Autostart, req.SSHKey, req.TemplatePreset)
		default:
			err = fmt.Errorf("unknown action '%s'", msg.Action)
		}

		if err != nil {
			respMsg.Error = err.Error()
		} else if len(respMsg.Payload) == 0 {
			respMsg.Payload = json.RawMessage(`{"status":"ok"}`)
		}

		_ = conn.WriteJSON(respMsg)
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
