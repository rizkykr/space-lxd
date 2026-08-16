package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"lxd-manager-dashboard/pkg/lxd"
)

type MessageType string

const (
	MsgRegister     MessageType = "REGISTER"
	MsgHeartbeat    MessageType = "HEARTBEAT"
	MsgRPCReq       MessageType = "RPC_REQ"
	MsgRPCResp      MessageType = "RPC_RESP"
	MsgTermOpen     MessageType = "TERM_OPEN"
	MsgHostTermOpen MessageType = "HOST_TERM_OPEN"
	MsgTermData     MessageType = "TERM_DATA"
	MsgTermClose    MessageType = "TERM_CLOSE"
	MsgTermResize   MessageType = "TERM_RESIZE"
)

type WSMessage struct {
	Type     MessageType     `json:"type"`
	NodeID   string          `json:"node_id,omitempty"`
	ReqID    string          `json:"req_id,omitempty"`
	Action   string          `json:"action,omitempty"`
	Payload  json.RawMessage `json:"payload,omitempty"`
	Error    string          `json:"error,omitempty"`
}

type HeartbeatPayload struct {
	HostStats lxd.HostStats  `json:"host_stats"`
	Instances []lxd.Instance `json:"instances"`
}

type RPCReqPayload struct {
	Name           string `json:"name,omitempty"`
	Image          string `json:"image,omitempty"`
	Type           string `json:"type,omitempty"`
	RAMGB          int    `json:"ram_gb,omitempty"`
	CPUCores       int    `json:"cpu_cores,omitempty"`
	DiskGB         int    `json:"disk_gb,omitempty"`
	Autostart      bool   `json:"autostart,omitempty"`
	SSHKey         string `json:"ssh_key,omitempty"`
	TemplatePreset string `json:"template_preset,omitempty"`
	StoragePool    string `json:"storage_pool,omitempty"`
	Network        string `json:"network,omitempty"`
	Privileged     bool   `json:"privileged,omitempty"`
	Nesting        bool   `json:"nesting,omitempty"`
	CPUAllowance   string `json:"cpu_allowance,omitempty"`
	MemorySwap     bool   `json:"memory_swap,omitempty"`
	SnapName       string `json:"snap_name,omitempty"`
	SnapEnabled    bool   `json:"snap_enabled,omitempty"`
	SnapCron       string `json:"snap_cron,omitempty"`
	RetentionDays  int    `json:"retention_days,omitempty"`
}

type AgentConnection struct {
	NodeID    string
	NodeName  string
	Conn      *websocket.Conn
	LastSeen  time.Time
	HostStats lxd.HostStats
	Instances []lxd.Instance
	mu        sync.Mutex
}

type Hub struct {
	Agents       sync.Map // string (NodeID) -> *AgentConnection
	rpcWaiters   sync.Map // string (ReqID) -> chan WSMessage
	termSessions sync.Map // string (ReqID) -> *websocket.Conn (Web Browser UI Conn)
	upgrader     websocket.Upgrader
	mu           sync.RWMutex
}

func (h *Hub) RegisterTermSession(sessionID string, conn *websocket.Conn) {
	h.termSessions.Store(sessionID, conn)
}

func (h *Hub) UnregisterTermSession(sessionID string) {
	h.termSessions.Delete(sessionID)
}

func (h *Hub) SendWSMessage(nodeID string, msg WSMessage) error {
	agent, ok := h.GetAgent(nodeID)
	if !ok {
		return fmt.Errorf("node agent '%s' is not connected", nodeID)
	}
	agent.mu.Lock()
	defer agent.mu.Unlock()
	return agent.Conn.WriteJSON(msg)
}

func NewHub() *Hub {
	return &Hub{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

func (h *Hub) RegisterAgentConn(nodeID, nodeName string, conn *websocket.Conn) *AgentConnection {
	agent := &AgentConnection{
		NodeID:   nodeID,
		NodeName: nodeName,
		Conn:     conn,
		LastSeen: time.Now(),
	}
	h.Agents.Store(nodeID, agent)
	log.Printf("🔌 Agent connected & registered -> Node ID: %s (%s)", nodeID, nodeName)
	return agent
}

func (h *Hub) UnregisterAgentConn(nodeID string) {
	if val, ok := h.Agents.LoadAndDelete(nodeID); ok {
		agent := val.(*AgentConnection)
		agent.Conn.Close()
		log.Printf("🔌 Agent disconnected -> Node ID: %s", nodeID)
	}
}

func (h *Hub) GetAgent(nodeID string) (*AgentConnection, bool) {
	val, ok := h.Agents.Load(nodeID)
	if !ok {
		return nil, false
	}
	return val.(*AgentConnection), true
}

func (h *Hub) ClusterBroadcastUpdate() {
	h.Agents.Range(func(key, value interface{}) bool {
		agent := value.(*AgentConnection)
		reqID := fmt.Sprintf("req_update_%d", time.Now().UnixNano())
		msg := WSMessage{
			Type:   MsgRPCReq,
			NodeID: agent.NodeID,
			ReqID:  reqID,
			Action: "self_update",
		}
		agent.mu.Lock()
		_ = agent.Conn.WriteJSON(msg)
		agent.mu.Unlock()
		log.Printf("📢 Broadcasted cluster update signal to Worker Node '%s'", agent.NodeID)
		return true
	})
}

func (h *Hub) SendRPC(nodeID string, action string, payload RPCReqPayload, timeout time.Duration) (*WSMessage, error) {
	agent, ok := h.GetAgent(nodeID)
	if !ok {
		return nil, fmt.Errorf("node agent '%s' is not connected", nodeID)
	}

	reqID := fmt.Sprintf("req_%d", time.Now().UnixNano())
	payloadBytes, _ := json.Marshal(payload)

	msg := WSMessage{
		Type:    MsgRPCReq,
		NodeID:  nodeID,
		ReqID:   reqID,
		Action:  action,
		Payload: payloadBytes,
	}

	ch := make(chan WSMessage, 1)
	h.rpcWaiters.Store(reqID, ch)
	defer h.rpcWaiters.Delete(reqID)

	agent.mu.Lock()
	err := agent.Conn.WriteJSON(msg)
	agent.mu.Unlock()

	if err != nil {
		return nil, fmt.Errorf("failed to send command to agent: %w", err)
	}

	select {
	case resp := <-ch:
		if resp.Error != "" {
			return nil, fmt.Errorf("%s", resp.Error)
		}
		return &resp, nil
	case <-time.After(timeout):
		return nil, fmt.Errorf("agent RPC request timed out")
	}
}

func (h *Hub) HandleAgentMessage(agent *AgentConnection, msg WSMessage) {
	agent.LastSeen = time.Now()

	switch msg.Type {
	case MsgHeartbeat:
		var hb HeartbeatPayload
		if err := json.Unmarshal(msg.Payload, &hb); err == nil {
			agent.mu.Lock()
			agent.HostStats = hb.HostStats
			agent.Instances = hb.Instances
			agent.mu.Unlock()
		}

	case MsgRPCResp:
		if chVal, ok := h.rpcWaiters.Load(msg.ReqID); ok {
			ch := chVal.(chan WSMessage)
			ch <- msg
		}

	case MsgTermData, MsgTermClose:
		if termConnVal, ok := h.termSessions.Load(msg.ReqID); ok {
			termConn := termConnVal.(*websocket.Conn)
			if msg.Type == MsgTermClose {
				termConn.Close()
				h.termSessions.Delete(msg.ReqID)
			} else {
				var decodedData string
				if err := json.Unmarshal(msg.Payload, &decodedData); err == nil {
					_ = termConn.WriteMessage(websocket.TextMessage, []byte(decodedData))
				} else {
					_ = termConn.WriteMessage(websocket.TextMessage, []byte(msg.Payload))
				}
			}
		}

	default:
		log.Printf("Received message type '%s' from node %s", msg.Type, agent.NodeID)
	}
}
