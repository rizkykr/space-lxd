package config

import (
	"os"

	"lxd-manager-dashboard/pkg/lxd"
)

type MasterConfig struct {
	Port         string
	DBPath       string
	JWTSecret    string
	LXDSocket    string
	MasterPublic string // e.g. http://master-ip:9090 or https://domain.com
}

type AgentConfig struct {
	MasterURL   string
	NodeID      string
	NodeName    string
	AgentSecret string
	LXDSocket   string
}

func LoadMasterConfig() MasterConfig {
	port := os.Getenv("PORT")
	if port == "" {
		port = "9090"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "lxd-manager.db"
	}
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "lxd-manager-super-secret-key-2026"
	}
	lxdSocket := os.Getenv("LXD_SOCKET")
	if lxdSocket == "" {
		lxdSocket = lxd.DetectLXDSocket()
	}
	masterPublic := os.Getenv("MASTER_PUBLIC_URL")
	if masterPublic == "" {
		masterPublic = "http://localhost:" + port
	}

	return MasterConfig{
		Port:         port,
		DBPath:       dbPath,
		JWTSecret:    jwtSecret,
		LXDSocket:    lxdSocket,
		MasterPublic: masterPublic,
	}
}

func LoadAgentConfig() AgentConfig {
	masterURL := os.Getenv("MASTER_URL")
	if masterURL == "" {
		masterURL = "http://localhost:9090"
	}
	nodeID := os.Getenv("NODE_ID")
	if nodeID == "" {
		nodeID = "local-node"
	}
	nodeName := os.Getenv("NODE_NAME")
	if nodeName == "" {
		nodeName = "Master Node (Local)"
	}
	secret := os.Getenv("AGENT_SECRET")
	if secret == "" {
		secret = "agent-secret-token"
	}
	lxdSocket := os.Getenv("LXD_SOCKET")
	if lxdSocket == "" {
		lxdSocket = lxd.DetectLXDSocket()
	}

	return AgentConfig{
		MasterURL:   masterURL,
		NodeID:      nodeID,
		NodeName:    nodeName,
		AgentSecret: secret,
		LXDSocket:   lxdSocket,
	}
}
