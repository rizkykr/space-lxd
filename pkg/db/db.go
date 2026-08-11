package db

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
	"golang.org/x/crypto/bcrypt"
)

type Node struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	IP              string    `json:"ip"`
	Status          string    `json:"status"` // "online", "offline", "syncing"
	OSName          string    `json:"os_name"`
	Kernel          string    `json:"kernel"`
	Uptime          string    `json:"uptime"`
	LoadAvg         string    `json:"load_avg"`
	CPUCores        int       `json:"cpu_cores"`
	CPUUsagePct     float64   `json:"cpu_usage_pct"`
	RAMTotalMB      int64     `json:"ram_total_mb"`
	RAMUsedMB       int64     `json:"ram_used_mb"`
	StorageTotalGB  float64   `json:"storage_total_gb"`
	StorageUsedGB   float64   `json:"storage_used_gb"`
	StorageUsagePct float64   `json:"storage_usage_pct"`
	SecretToken     string    `json:"-"`
	IsMaster        bool      `json:"is_master"`
	LastSeen        time.Time `json:"last_seen"`
	CreatedAt       time.Time `json:"created_at"`
}

type User struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

type JoinToken struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
	Used      bool      `json:"used"`
	NodeID    string    `json:"node_id,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type AuditLog struct {
	ID        int64     `json:"id"`
	Action    string    `json:"action"`
	Target    string    `json:"target"`
	Detail    string    `json:"detail"`
	CreatedAt time.Time `json:"created_at"`
}

type SSHKey struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	PublicKey string    `json:"public_key"`
	CreatedAt time.Time `json:"created_at"`
}

type DB struct {
	*sql.DB
}

func InitDB(dbPath string) (*DB, error) {
	sqlDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database: %w", err)
	}

	_, _ = sqlDB.Exec("PRAGMA journal_mode=WAL;")
	_, _ = sqlDB.Exec("PRAGMA foreign_keys=ON;")

	database := &DB{sqlDB}

	if err := database.createTables(); err != nil {
		return nil, err
	}

	database.migrateColumns()

	return database, nil
}

func (db *DB) createTables() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'admin',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS nodes (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		ip TEXT DEFAULT '',
		status TEXT DEFAULT 'offline',
		os_name TEXT DEFAULT '',
		kernel TEXT DEFAULT '',
		uptime TEXT DEFAULT '',
		load_avg TEXT DEFAULT '',
		cpu_cores INTEGER DEFAULT 0,
		cpu_usage_pct REAL DEFAULT 0.0,
		ram_total_mb INTEGER DEFAULT 0,
		ram_used_mb INTEGER DEFAULT 0,
		storage_total_gb REAL DEFAULT 0.0,
		storage_used_gb REAL DEFAULT 0.0,
		storage_usage_pct REAL DEFAULT 0.0,
		secret_token TEXT NOT NULL,
		is_master BOOLEAN DEFAULT 0,
		last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS join_tokens (
		token TEXT PRIMARY KEY,
		expires_at DATETIME NOT NULL,
		used BOOLEAN DEFAULT 0,
		node_id TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS audit_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		action TEXT NOT NULL,
		target TEXT NOT NULL,
		detail TEXT DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS ssh_keys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL,
		public_key TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS settings (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL
	);
	`
	_, err := db.Exec(schema)
	return err
}

func (db *DB) migrateColumns() {
	columns := []string{
		"ALTER TABLE nodes ADD COLUMN os_name TEXT DEFAULT ''",
		"ALTER TABLE nodes ADD COLUMN kernel TEXT DEFAULT ''",
		"ALTER TABLE nodes ADD COLUMN uptime TEXT DEFAULT ''",
		"ALTER TABLE nodes ADD COLUMN load_avg TEXT DEFAULT ''",
		"ALTER TABLE nodes ADD COLUMN storage_total_gb REAL DEFAULT 0.0",
		"ALTER TABLE nodes ADD COLUMN storage_used_gb REAL DEFAULT 0.0",
		"ALTER TABLE nodes ADD COLUMN storage_usage_pct REAL DEFAULT 0.0",
	}
	for _, query := range columns {
		_, _ = db.Exec(query)
	}
}

func (db *DB) HasUsers() bool {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return err == nil && count > 0
}

func (db *DB) CreateAdminUser(username, password string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}
	res, err := db.Exec("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", username, string(hash), "admin")
	if err != nil {
		// If username already exists in database, update password instead of returning UNIQUE constraint error
		_, updateErr := db.Exec("UPDATE users SET password_hash = ?, role = 'admin' WHERE username = ?", string(hash), username)
		if updateErr != nil {
			return nil, err
		}
		var user User
		_ = db.QueryRow("SELECT id, username, role, created_at FROM users WHERE username = ?", username).Scan(&user.ID, &user.Username, &user.Role, &user.CreatedAt)
		return &user, nil
	}
	id, _ := res.LastInsertId()
	_ = db.LogAuditAction("USER_SETUP", username, "Initial admin user created")
	return &User{
		ID:        id,
		Username:  username,
		Role:      "admin",
		CreatedAt: time.Now(),
	}, nil
}

func (db *DB) UpdateUserPassword(username, oldPassword, newPassword string) error {
	var passwordHash string
	err := db.QueryRow("SELECT password_hash FROM users WHERE username = ?", username).Scan(&passwordHash)
	if err != nil {
		return fmt.Errorf("user not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(oldPassword)); err != nil {
		return fmt.Errorf("password lama salah")
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}

	_, err = db.Exec("UPDATE users SET password_hash = ? WHERE username = ?", string(newHash), username)
	if err == nil {
		_ = db.LogAuditAction("PASSWORD_CHANGE", username, "User changed password")
	}
	return err
}

func (db *DB) LogAuditAction(action, target, detail string) error {
	_, err := db.Exec("INSERT INTO audit_logs (action, target, detail) VALUES (?, ?, ?)", action, target, detail)
	return err
}

func (db *DB) GetAuditLogs() ([]AuditLog, error) {
	logs := []AuditLog{}
	rows, err := db.Query("SELECT id, action, target, detail, created_at FROM audit_logs ORDER BY id DESC LIMIT 100")
	if err != nil {
		return logs, nil
	}
	defer rows.Close()

	for rows.Next() {
		var l AuditLog
		if err := rows.Scan(&l.ID, &l.Action, &l.Target, &l.Detail, &l.CreatedAt); err != nil {
			return logs, nil
		}
		logs = append(logs, l)
	}
	return logs, nil
}

func (db *DB) AddSSHKey(name, pubKey string) error {
	_, err := db.Exec("INSERT INTO ssh_keys (name, public_key) VALUES (?, ?)", name, pubKey)
	if err == nil {
		_ = db.LogAuditAction("ADD_SSH_KEY", name, "Added SSH Public Key")
	}
	return err
}

func (db *DB) GetSSHKeys() ([]SSHKey, error) {
	keys := []SSHKey{}
	rows, err := db.Query("SELECT id, name, public_key, created_at FROM ssh_keys ORDER BY id DESC")
	if err != nil {
		return keys, nil
	}
	defer rows.Close()

	for rows.Next() {
		var k SSHKey
		if err := rows.Scan(&k.ID, &k.Name, &k.PublicKey, &k.CreatedAt); err != nil {
			return keys, nil
		}
		keys = append(keys, k)
	}
	return keys, nil
}

func (db *DB) DeleteSSHKey(id int64) error {
	_, err := db.Exec("DELETE FROM ssh_keys WHERE id = ?", id)
	return err
}

func (db *DB) UpsertNode(node Node) error {
	query := `
	INSERT INTO nodes (id, name, ip, status, os_name, kernel, uptime, load_avg, cpu_cores, cpu_usage_pct, ram_total_mb, ram_used_mb, storage_total_gb, storage_used_gb, storage_usage_pct, secret_token, is_master, last_seen, created_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
	ON CONFLICT(id) DO UPDATE SET
		name=excluded.name,
		ip=excluded.ip,
		status=excluded.status,
		os_name=excluded.os_name,
		kernel=excluded.kernel,
		uptime=excluded.uptime,
		load_avg=excluded.load_avg,
		cpu_cores=excluded.cpu_cores,
		cpu_usage_pct=excluded.cpu_usage_pct,
		ram_total_mb=excluded.ram_total_mb,
		ram_used_mb=excluded.ram_used_mb,
		storage_total_gb=excluded.storage_total_gb,
		storage_used_gb=excluded.storage_used_gb,
		storage_usage_pct=excluded.storage_usage_pct,
		secret_token=excluded.secret_token,
		last_seen=CURRENT_TIMESTAMP;
	`
	_, err := db.Exec(query, node.ID, node.Name, node.IP, node.Status, node.OSName, node.Kernel, node.Uptime, node.LoadAvg, node.CPUCores, node.CPUUsagePct, node.RAMTotalMB, node.RAMUsedMB, node.StorageTotalGB, node.StorageUsedGB, node.StorageUsagePct, node.SecretToken, node.IsMaster)
	return err
}

func (db *DB) GetAllNodes() ([]Node, error) {
	rows, err := db.Query("SELECT id, name, ip, status, os_name, kernel, uptime, load_avg, cpu_cores, cpu_usage_pct, ram_total_mb, ram_used_mb, storage_total_gb, storage_used_gb, storage_usage_pct, is_master, last_seen, created_at FROM nodes ORDER BY is_master DESC, name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []Node
	for rows.Next() {
		var n Node
		if err := rows.Scan(&n.ID, &n.Name, &n.IP, &n.Status, &n.OSName, &n.Kernel, &n.Uptime, &n.LoadAvg, &n.CPUCores, &n.CPUUsagePct, &n.RAMTotalMB, &n.RAMUsedMB, &n.StorageTotalGB, &n.StorageUsedGB, &n.StorageUsagePct, &n.IsMaster, &n.LastSeen, &n.CreatedAt); err != nil {
			return nil, err
		}
		nodes = append(nodes, n)
	}
	return nodes, nil
}

func (db *DB) CreateJoinToken(token string, durationMinutes int) error {
	expiresAt := time.Now().Add(time.Duration(durationMinutes) * time.Minute)
	_, err := db.Exec("INSERT INTO join_tokens (token, expires_at) VALUES (?, ?)", token, expiresAt)
	return err
}

func (db *DB) ValidateAndConsumeJoinToken(token string, nodeID string) bool {
	var expiresAt time.Time
	var used bool
	err := db.QueryRow("SELECT expires_at, used FROM join_tokens WHERE token = ?", token).Scan(&expiresAt, &used)
	if err != nil || used {
		return false
	}
	if time.Now().After(expiresAt) {
		return false
	}
	_, _ = db.Exec("UPDATE join_tokens SET used = 1, node_id = ? WHERE token = ?", nodeID, token)
	_ = db.LogAuditAction("NODE_JOIN", nodeID, "Worker Node joined cluster")
	return true
}

func (db *DB) AuthenticateUser(username, password string) (*User, error) {
	var u User
	var passwordHash string
	err := db.QueryRow("SELECT id, username, password_hash, role, created_at FROM users WHERE username = ?", username).Scan(&u.ID, &u.Username, &passwordHash, &u.Role, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid credentials")
	}

	return &u, nil
}

func (db *DB) GetSetting(key, defaultValue string) string {
	var val string
	err := db.QueryRow("SELECT value FROM settings WHERE key = ?", key).Scan(&val)
	if err != nil || val == "" {
		return defaultValue
	}
	return val
}

func (db *DB) SetSetting(key, value string) error {
	_, err := db.Exec("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?", key, value, value)
	return err
}

func (db *DB) GetAllSettings() map[string]string {
	res := make(map[string]string)
	rows, err := db.Query("SELECT key, value FROM settings")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				res[k] = v
			}
		}
	}
	return res
}
