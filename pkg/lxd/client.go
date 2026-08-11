package lxd

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type LXD struct {
	Name        string `json:"name"`
	Type        string `json:"type"`   // "container" or "virtual-machine"
	Status      string `json:"status"` // "Running", "Stopped", "Frozen"
	IPv4        string `json:"ipv4"`
	RAMUsedMB   int64  `json:"ram_used_mb"`
	RAMLimitMB  int64  `json:"ram_limit_mb"`
	CPUCores    int    `json:"cpu_cores"`
	CPUUsagePct float64`json:"cpu_usage_pct"`
	Autostart   bool   `json:"autostart"`
}

type Instance = LXD

type HostStats struct {
	Hostname        string  `json:"hostname"`
	IP              string  `json:"ip"`
	OS              string  `json:"os"`
	Kernel          string  `json:"kernel"`
	Uptime          string  `json:"uptime"`
	LoadAvg         string  `json:"load_avg"`
	CPUCores        int     `json:"cpu_cores"`
	CPUUsagePct     float64 `json:"cpu_usage_pct"`
	RAMTotalMB      int64   `json:"ram_total_mb"`
	RAMUsedMB       int64   `json:"ram_used_mb"`
	StorageTotalGB  float64 `json:"storage_total_gb"`
	StorageUsedGB   float64 `json:"storage_used_gb"`
	StorageUsagePct float64 `json:"storage_usage_pct"`
}

type Client struct {
	SocketPath string
	httpClient *http.Client
	mockLXDs   []LXD
	mu         sync.Mutex
}

func NewClient(socketPath string) *Client {
	if socketPath == "" {
		socketPath = "/var/snap/lxd/common/lxd/unix.socket"
	}

	httpClient := &http.Client{
		Transport: &http.Transport{
			DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
				return net.Dial("unix", socketPath)
			},
		},
		Timeout: 5 * time.Second,
	}

	return &Client{
		SocketPath: socketPath,
		httpClient: httpClient,
		mockLXDs:   []LXD{},
	}
}

func FindLXCBin() string {
	paths := []string{"/snap/bin/lxc", "/usr/bin/lxc", "/usr/local/bin/lxc"}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	if p, err := exec.LookPath("lxc"); err == nil {
		return p
	}
	return "lxc"
}

func (c *Client) IsAvailable() bool {
	if _, err := os.Stat(c.SocketPath); os.IsNotExist(err) {
		return false
	}
	resp, err := c.httpClient.Get("http://unix/1.0")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (c *Client) GetHostStats() HostStats {
	hostname, _ := os.Hostname()

	cores := 1
	if out, err := exec.Command("nproc").Output(); err == nil {
		if val, err := strconv.Atoi(strings.TrimSpace(string(out))); err == nil && val > 0 {
			cores = val
		}
	}

	var totalMB, usedMB int64
	if out, err := exec.Command("free", "-m").Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			if strings.HasPrefix(line, "Mem:") {
				fields := strings.Fields(line)
				if len(fields) >= 3 {
					totalMB, _ = strconv.ParseInt(fields[1], 10, 64)
					usedMB, _ = strconv.ParseInt(fields[2], 10, 64)
				}
			}
		}
	}

	var storageTotalGB, storageUsedGB, storagePct float64
	if out, err := exec.Command("df", "-BG", "/").Output(); err == nil {
		lines := strings.Split(string(out), "\n")
		if len(lines) >= 2 {
			fields := strings.Fields(lines[1])
			if len(fields) >= 5 {
				totalStr := strings.TrimSuffix(fields[1], "G")
				usedStr := strings.TrimSuffix(fields[2], "G")
				pctStr := strings.TrimSuffix(fields[4], "%")

				storageTotalGB, _ = strconv.ParseFloat(totalStr, 64)
				storageUsedGB, _ = strconv.ParseFloat(usedStr, 64)
				storagePct, _ = strconv.ParseFloat(pctStr, 64)
			}
		}
	}

	uptimeStr := "0m"
	if out, err := exec.Command("uptime", "-p").Output(); err == nil {
		uptimeStr = strings.TrimPrefix(strings.TrimSpace(string(out)), "up ")
	}

	loadAvg := "0.00"
	if out, err := exec.Command("cat", "/proc/loadavg").Output(); err == nil {
		fields := strings.Fields(string(out))
		if len(fields) >= 3 {
			loadAvg = fmt.Sprintf("%s %s %s", fields[0], fields[1], fields[2])
		}
	}

	cpuPct := 0.0
	if out, err := exec.Command("sh", "-c", "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'").Output(); err == nil {
		cpuPct, _ = strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	}

	osName := "Linux"
	if out, err := exec.Command("sh", "-c", "grep PRETTY_NAME /etc/os-release | cut -d= -f2 | tr -d '\"'").Output(); err == nil && len(out) > 0 {
		osName = strings.TrimSpace(string(out))
	}

	kernel := ""
	if out, err := exec.Command("uname", "-r").Output(); err == nil {
		kernel = strings.TrimSpace(string(out))
	}

	primaryIP := "127.0.0.1"
	if out, err := exec.Command("hostname", "-I").Output(); err == nil {
		fields := strings.Fields(string(out))
		if len(fields) > 0 {
			primaryIP = fields[0]
		}
	}

	return HostStats{
		Hostname:        hostname,
		IP:              primaryIP,
		OS:              osName,
		Kernel:          kernel,
		Uptime:          uptimeStr,
		LoadAvg:         loadAvg,
		CPUCores:        cores,
		CPUUsagePct:     cpuPct,
		RAMTotalMB:      totalMB,
		RAMUsedMB:       usedMB,
		StorageTotalGB:  storageTotalGB,
		StorageUsedGB:   storageUsedGB,
		StorageUsagePct: storagePct,
	}
}

func (c *Client) ListInstances() ([]LXD, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if !c.IsAvailable() {
		insts, err := c.listInstancesFallback()
		if len(insts) > 0 || err != nil {
			return append(insts, c.mockLXDs...), err
		}
		return c.mockLXDs, nil
	}

	resp, err := c.httpClient.Get("http://unix/1.0/instances?recursion=2")
	if err != nil {
		return c.mockLXDs, nil
	}
	defer resp.Body.Close()

	var apiResp struct {
		StatusCode int `json:"status_code"`
		Metadata   []struct {
			Name   string `json:"name"`
			Type   string `json:"type"`
			Status string `json:"status"`
			Config map[string]string `json:"config"`
			State  *struct {
				CPU map[string]interface{} `json:"cpu"`
				Memory map[string]interface{} `json:"memory"`
				Network map[string]struct {
					Addresses []struct {
						Family string `json:"family"`
						Address string `json:"address"`
					} `json:"addresses"`
				} `json:"network"`
			} `json:"state"`
		} `json:"metadata"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return c.mockLXDs, nil
	}

	var instances []LXD
	for _, item := range apiResp.Metadata {
		ipv4 := "-"
		ramUsed := int64(0)
		if item.State != nil {
			for _, netItem := range item.State.Network {
				for _, addr := range netItem.Addresses {
					if addr.Family == "inet" && addr.Address != "127.0.0.1" {
						ipv4 = addr.Address
						break
					}
				}
			}
			if usage, ok := item.State.Memory["usage"].(float64); ok {
				ramUsed = int64(usage / (1024 * 1024))
			}
		}

		instType := item.Type
		if instType == "" {
			instType = "container"
		}

		autostart := item.Config["boot.autostart"] == "true"
		cores, _ := strconv.Atoi(item.Config["limits.cpu"])
		if cores == 0 {
			cores = 1
		}
		memMB, _ := strconv.ParseInt(strings.TrimSuffix(item.Config["limits.memory"], "GB"), 10, 64)
		if memMB > 0 {
			memMB = memMB * 1024
		}

		instances = append(instances, LXD{
			Name:       item.Name,
			Type:       instType,
			Status:     item.Status,
			IPv4:       ipv4,
			RAMUsedMB:  ramUsed,
			RAMLimitMB: memMB,
			CPUCores:   cores,
			Autostart:  autostart,
		})
	}

	return append(instances, c.mockLXDs...), nil
}

func (c *Client) listInstancesFallback() ([]LXD, error) {
	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "list", "-c", "n,s,4,t", "--format", "csv").Output()
	if err != nil {
		return []LXD{}, nil
	}

	var instances []LXD
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, ",")
		if len(parts) >= 3 {
			name := strings.TrimSpace(parts[0])
			status := strings.TrimSpace(parts[1])
			ipField := strings.TrimSpace(parts[2])
			ip := "-"
			if fields := strings.Fields(ipField); len(fields) > 0 {
				ip = fields[0]
			}
			instType := "container"
			instances = append(instances, LXD{
				Name:       name,
				Type:       instType,
				Status:     status,
				IPv4:       ip,
				CPUCores:   2,
				RAMLimitMB: 2048,
			})
		}
	}
	return instances, nil
}

func (c *Client) StartInstance(name string) error {
	c.mu.Lock()
	for i, item := range c.mockLXDs {
		if item.Name == name {
			c.mockLXDs[i].Status = "Running"
			c.mockLXDs[i].IPv4 = "10.150.0." + strconv.Itoa(10+i)
			c.mu.Unlock()
			return nil
		}
	}
	c.mu.Unlock()

	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "start", name).CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to start LXD '%s': %s", name, string(out))
	}
	return nil
}

func (c *Client) StopInstance(name string) error {
	c.mu.Lock()
	for i, item := range c.mockLXDs {
		if item.Name == name {
			c.mockLXDs[i].Status = "Stopped"
			c.mockLXDs[i].IPv4 = "-"
			c.mu.Unlock()
			return nil
		}
	}
	c.mu.Unlock()

	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "stop", name).CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to stop LXD '%s': %s", name, string(out))
	}
	return nil
}

func (c *Client) DeleteInstance(name string) error {
	c.mu.Lock()
	for i, item := range c.mockLXDs {
		if item.Name == name {
			c.mockLXDs = append(c.mockLXDs[:i], c.mockLXDs[i+1:]...)
			c.mu.Unlock()
			return nil
		}
	}
	c.mu.Unlock()

	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "delete", name, "--force").CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to delete LXD '%s': %s", name, string(out))
	}
	return nil
}

func (c *Client) RestartInstance(name string) error {
	c.mu.Lock()
	for i, item := range c.mockLXDs {
		if item.Name == name {
			c.mockLXDs[i].Status = "Running"
			c.mu.Unlock()
			return nil
		}
	}
	c.mu.Unlock()

	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "restart", name).CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to restart LXD '%s': %s", name, string(out))
	}
	return nil
}

func (c *Client) PauseInstance(name string) error {
	c.mu.Lock()
	for i, item := range c.mockLXDs {
		if item.Name == name {
			c.mockLXDs[i].Status = "Frozen"
			c.mu.Unlock()
			return nil
		}
	}
	c.mu.Unlock()

	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "pause", name).CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to pause LXD '%s': %s", name, string(out))
	}
	return nil
}

func (c *Client) ResumeInstance(name string) error {
	c.mu.Lock()
	for i, item := range c.mockLXDs {
		if item.Name == name {
			c.mockLXDs[i].Status = "Running"
			c.mu.Unlock()
			return nil
		}
	}
	c.mu.Unlock()

	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "start", name).CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to resume LXD '%s': %s", name, string(out))
	}
	return nil
}

func normalizeImage(img string) string {
	img = strings.TrimSpace(img)
	if img == "" {
		return "ubuntu:24.04"
	}
	if strings.HasPrefix(img, "ubuntu:") || strings.HasPrefix(img, "images:") {
		return img
	}
	if strings.Contains(img, ":") {
		return "images:" + strings.Replace(img, ":", "/", 1)
	}
	return img
}

func GetSystemTimezone() string {
	if data, err := os.ReadFile("/etc/timezone"); err == nil {
		tz := strings.TrimSpace(string(data))
		if tz != "" {
			return tz
		}
	}
	if target, err := filepath.EvalSymlinks("/etc/localtime"); err == nil {
		if idx := strings.Index(target, "zoneinfo/"); idx != -1 {
			return target[idx+len("zoneinfo/"):]
		}
	}
	loc := time.Now().Location().String()
	if loc != "" && loc != "Local" {
		return loc
	}
	return "UTC"
}

func getImageCandidates(image string) []string {
	img := strings.TrimSpace(image)
	if img == "" {
		return []string{"ubuntu:24.04"}
	}

	var candidates []string
	candidates = append(candidates, img)

	if strings.Contains(img, "alpine") {
		candidates = append(candidates, "images:alpine/edge", "images:alpine/3.24", "images:alpine/3.23", "images:alpine/3.22", "images:alpine/edge/cloud")
	}

	if strings.HasPrefix(img, "images:") {
		clean := strings.TrimPrefix(img, "images:")
		candidates = append(candidates, "images:"+clean)
		candidates = append(candidates, "images:"+clean+"/cloud")

		parts := strings.Split(clean, "/")
		if len(parts) > 0 && parts[0] != "" {
			candidates = append(candidates, "images:"+parts[0]+"/edge")
			candidates = append(candidates, "images:"+parts[0])
		}
	} else if strings.HasPrefix(img, "ubuntu:") {
		candidates = append(candidates, img)
	} else {
		slash := strings.Replace(img, ":", "/", 1)
		candidates = append(candidates, "images:"+slash)
		candidates = append(candidates, "images:"+slash+"/cloud")

		parts := strings.Split(slash, "/")
		if len(parts) > 0 && parts[0] != "" {
			candidates = append(candidates, "images:"+parts[0]+"/edge")
			candidates = append(candidates, "images:"+parts[0])
		}
		candidates = append(candidates, "ubuntu:"+img)
	}

	return candidates
}

func (c *Client) EnsureImageDownloaded(image string) error {
	return c.EnsureImageDownloadedWithStream(image, nil)
}

func (c *Client) EnsureImageDownloadedWithStream(image string, logFn func(string)) error {
	lxcBin := FindLXCBin()
	candidates := getImageCandidates(image)

	if logFn != nil {
		logFn(fmt.Sprintf("🔍 Memeriksa cache image lokal pada host untuk '%s'...", image))
	}

	// Check if already in local host image store
	out, err := exec.Command(lxcBin, "image", "list", "--format", "json").CombinedOutput()
	if err == nil {
		outStr := string(out)
		for _, cand := range candidates {
			cleanAlias := strings.TrimPrefix(strings.TrimPrefix(cand, "images:"), "ubuntu:")
			if cleanAlias != "" && (strings.Contains(outStr, cleanAlias) || strings.Contains(outStr, image)) {
				if logFn != nil {
					logFn(fmt.Sprintf("✅ Image '%s' telah tersedia di local cache host.", cand))
				}
				return nil
			}
		}
	}

	if logFn != nil {
		logFn(fmt.Sprintf("📦 Image '%s' belum ada di local cache. Mengunduh dari remote server...", image))
	}

	// Explicitly copy/pull image from remote server to local storage
	var lastCopyErr error
	for _, cand := range candidates {
		aliasName := strings.ReplaceAll(strings.TrimPrefix(strings.TrimPrefix(cand, "images:"), "ubuntu:"), "/", "-")
		if logFn != nil {
			logFn(fmt.Sprintf("⬇️ Executing: %s image copy %s local: --alias %s", lxcBin, cand, aliasName))
		}
		cmd := exec.Command(lxcBin, "image", "copy", cand, "local:", "--alias", aliasName)
		outCopy, errCopy := cmd.CombinedOutput()
		if errCopy == nil {
			if logFn != nil {
				logFn(fmt.Sprintf("✅ Sukses mengunduh dan meng-cache image '%s' ke local host.", cand))
			}
			return nil
		}
		lastCopyErr = fmt.Errorf("%s (output: %s)", errCopy.Error(), strings.TrimSpace(string(outCopy)))
		if logFn != nil {
			logFn(fmt.Sprintf("⚠️ Candidate '%s' gagal: %s", cand, strings.TrimSpace(string(outCopy))))
		}
	}

	return lastCopyErr
}

func (c *Client) LaunchInstance(name, image, instType string, ramGB, cpuCores, diskGB int, autostart bool, sshKey, templatePreset string) error {
	return c.LaunchInstanceStream(name, image, instType, ramGB, cpuCores, diskGB, autostart, sshKey, templatePreset, nil)
}

func (c *Client) LaunchInstanceStream(name, image, instType string, ramGB, cpuCores, diskGB int, autostart bool, sshKey, templatePreset string, logFn func(string)) error {
	lxcBin := FindLXCBin()

	if logFn != nil {
		logFn(fmt.Sprintf("📡 Connecting to Agent Host Server for launch '%s'...", name))
	}

	// Step 1: Pre-download / pull image to local host cache if not present
	_ = c.EnsureImageDownloadedWithStream(image, logFn)

	// Detect Agent Host System Timezone for Global Inheritance
	nodeTZ := GetSystemTimezone()
	if logFn != nil {
		logFn(fmt.Sprintf("🌐 Deteksi timezone agent host: %s", nodeTZ))
	}

	// Construct Cloud-Init User Data
	var userDataParts []string
	userDataParts = append(userDataParts, "#cloud-config")
	if nodeTZ != "" {
		userDataParts = append(userDataParts, fmt.Sprintf("timezone: %s", nodeTZ))
	}

	cleanSSHKey := strings.TrimSpace(sshKey)
	if cleanSSHKey != "" {
		userDataParts = append(userDataParts, "ssh_authorized_keys:", fmt.Sprintf("  - %s", cleanSSHKey))
		if logFn != nil {
			logFn(fmt.Sprintf("🔑 Injeksi SSH Authorized Public Key (%d bytes)", len(cleanSSHKey)))
		}
	}

	var postRunCmd string
	switch templatePreset {
	case "docker":
		postRunCmd = "curl -fsSL https://get.docker.com | sh"
	case "nginx":
		postRunCmd = "apt-get update && apt-get install -y nginx"
	case "nodejs":
		postRunCmd = "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && npm install -g pm2"
	case "python":
		postRunCmd = "apt-get update && apt-get install -y python3 python3-pip python3-venv"
	}

	if postRunCmd != "" {
		userDataParts = append(userDataParts, "runcmd:", fmt.Sprintf("  - %s", postRunCmd))
		if logFn != nil {
			logFn(fmt.Sprintf("📦 Preset template Cloud-Init: %s", templatePreset))
		}
	}

	args := []string{
		"launch", "TARGET_IMG_PLACEHOLDER", name,
		"-c", fmt.Sprintf("limits.memory=%dGB", ramGB),
		"-c", fmt.Sprintf("limits.cpu=%d", cpuCores),
		"-c", "security.nesting=true",
		"-c", "security.syscalls.intercept.mknod=true",
		"-c", "security.syscalls.intercept.setxattr=true",
		"-c", fmt.Sprintf("environment.TZ=%s", nodeTZ),
	}

	if len(userDataParts) > 1 {
		cloudConfigStr := strings.Join(userDataParts, "\n")
		args = append(args, "-c", fmt.Sprintf("user.user-data=%s", cloudConfigStr))
	}

	if diskGB > 0 {
		args = append(args, "-d", fmt.Sprintf("root,size=%dGB", diskGB))
	}
	if autostart {
		args = append(args, "-c", "boot.autostart=true")
	}

	candidates := getImageCandidates(image)
	var lastOut string

	for _, cand := range candidates {
		args[1] = cand
		cmdStr := fmt.Sprintf("%s launch %s %s -c limits.memory=%dGB -c limits.cpu=%d -c security.nesting=true", lxcBin, cand, name, ramGB, cpuCores)
		if logFn != nil {
			logFn(fmt.Sprintf("🚀 Executing: %s", cmdStr))
		}

		out, err := exec.Command(lxcBin, args...).CombinedOutput()
		lastOut = strings.TrimSpace(string(out))
		if err == nil {
			if logFn != nil {
				logFn(fmt.Sprintf("✅ Instance '%s' berhasil dibuat dan diluncurkan!", name))
			}
			c.postLaunchSetup(name, cleanSSHKey, templatePreset, nodeTZ)
			return nil
		}
		if logFn != nil && lastOut != "" {
			logFn(fmt.Sprintf("⚠️ Command output: %s", lastOut))
		}
		if !strings.Contains(lastOut, "couldn't be found") && !strings.Contains(lastOut, "not found") {
			break
		}
	}

	if strings.Contains(lastOut, "storage pool") {
		return fmt.Errorf("LXD storage pool belum terkonfigurasi pada node. Jalankan: sudo lxd init --auto")
	}
	if strings.Contains(lastOut, "Permission denied") || strings.Contains(lastOut, "socket") {
		return fmt.Errorf("Akses LXD socket ditolak / daemon mati. Jalankan: sudo snap restart lxd")
	}

	// Fallback for mock environments
	if strings.Contains(lastOut, "No such file") || !c.IsAvailable() {
		if logFn != nil {
			logFn(fmt.Sprintf("⚡ [Simulation Mode] Generating mock LXD instance '%s'...", name))
		}
		c.mu.Lock()
		c.mockLXDs = append(c.mockLXDs, LXD{
			Name:       name,
			Type:       instType,
			Status:     "Running",
			IPv4:       fmt.Sprintf("10.150.0.%d", len(c.mockLXDs)+12),
			RAMUsedMB:  45,
			RAMLimitMB: int64(ramGB * 1024),
			CPUCores:   cpuCores,
			Autostart:  autostart,
		})
		c.mu.Unlock()
		return nil
	}

	return fmt.Errorf("Gagal launch LXD '%s': %s", name, lastOut)
}

func (c *Client) postLaunchSetup(name, cleanSSHKey, templatePreset, nodeTZ string) {
	lxcBin := FindLXCBin()
	go func() {
		time.Sleep(2 * time.Second)
		if nodeTZ != "" {
			tzCmd := fmt.Sprintf("ln -sf /usr/share/zoneinfo/%s /etc/localtime && echo '%s' > /etc/timezone", nodeTZ, nodeTZ)
			_ = exec.Command(lxcBin, "exec", name, "--", "sh", "-c", tzCmd).Run()
		}

		if cleanSSHKey != "" {
			execCmd := fmt.Sprintf("mkdir -p /root/.ssh && echo '%s' >> /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys", cleanSSHKey)
			_ = exec.Command(lxcBin, "exec", name, "--", "sh", "-c", execCmd).Run()
		}
	}()

	var postRunCmd string
	switch templatePreset {
	case "docker":
		postRunCmd = "curl -fsSL https://get.docker.com | sh"
	case "nginx":
		postRunCmd = "apt-get update && apt-get install -y nginx"
	case "nodejs":
		postRunCmd = "curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs && npm install -g pm2"
	case "python":
		postRunCmd = "apt-get update && apt-get install -y python3 python3-pip python3-venv"
	}

	if postRunCmd != "" {
		go func() {
			time.Sleep(5 * time.Second)
			_ = exec.Command(lxcBin, "exec", name, "--", "sh", "-c", postRunCmd).Run()
		}()
	}
}

type Snapshot struct {
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
}

type StoragePool struct {
	Name   string `json:"name"`
	Driver string `json:"driver"`
	Used   string `json:"used"`
}

type LXDNetwork struct {
	Name    string `json:"name"`
	Type    string `json:"type"`
	IPv4    string `json:"ipv4"`
	Managed bool   `json:"managed"`
}

func (c *Client) CreateSnapshot(instanceName, snapName string) error {
	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "snapshot", instanceName, snapName).CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to create snapshot: %s", string(out))
	}
	return nil
}

func (c *Client) ListSnapshots(instanceName string) ([]Snapshot, error) {
	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "info", instanceName).Output()
	if err != nil {
		return []Snapshot{}, nil
	}

	var snapshots []Snapshot
	inSnapSection := false
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "Snapshots:") {
			inSnapSection = true
			continue
		}
		if inSnapSection {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" || strings.HasPrefix(trimmed, "Documentation:") {
				break
			}
			parts := strings.Fields(trimmed)
			if len(parts) >= 1 {
				snapshots = append(snapshots, Snapshot{
					Name: parts[0],
					CreatedAt: time.Now(),
				})
			}
		}
	}
	return snapshots, nil
}

type SnapshotConfig struct {
	Enabled       bool       `json:"enabled"`
	ScheduleCron  string     `json:"schedule_cron"`
	RetentionDays int        `json:"retention_days"`
	Snapshots     []Snapshot `json:"snapshots"`
}

func (c *Client) UpdateSnapshotSchedule(instanceName string, enabled bool, scheduleCron string, retentionDays int) error {
	lxcBin := FindLXCBin()
	if !enabled || strings.TrimSpace(scheduleCron) == "" {
		_ = exec.Command(lxcBin, "config", "unset", instanceName, "snapshots.schedule").Run()
		_ = exec.Command(lxcBin, "config", "unset", instanceName, "snapshots.expiry").Run()
		return nil
	}

	cronStr := strings.TrimSpace(scheduleCron)
	expiryStr := fmt.Sprintf("%dd", retentionDays)
	if retentionDays <= 0 {
		expiryStr = "7d"
	}

	_ = exec.Command(lxcBin, "config", "set", instanceName, "snapshots.schedule", cronStr).Run()
	_ = exec.Command(lxcBin, "config", "set", instanceName, "snapshots.expiry", expiryStr).Run()
	_ = exec.Command(lxcBin, "config", "set", instanceName, "snapshots.schedule.stopped", "true").Run()
	return nil
}

func (c *Client) GetInstanceSnapshotsAndSchedule(instanceName string) (SnapshotConfig, error) {
	lxcBin := FindLXCBin()
	cfg := SnapshotConfig{
		Enabled:       false,
		ScheduleCron:  "0 0 * * *",
		RetentionDays: 7,
		Snapshots:     []Snapshot{},
	}

	outConfig, err := exec.Command(lxcBin, "config", "get", instanceName, "snapshots.schedule").Output()
	if err == nil {
		sched := strings.TrimSpace(string(outConfig))
		if sched != "" {
			cfg.Enabled = true
			cfg.ScheduleCron = sched
		}
	}

	outExpiry, err := exec.Command(lxcBin, "config", "get", instanceName, "snapshots.expiry").Output()
	if err == nil {
		exp := strings.TrimSpace(string(outExpiry))
		if strings.HasSuffix(exp, "d") {
			days, _ := strconv.Atoi(strings.TrimSuffix(exp, "d"))
			if days > 0 {
				cfg.RetentionDays = days
			}
		}
	}

	snaps, _ := c.ListSnapshots(instanceName)
	cfg.Snapshots = snaps

	return cfg, nil
}

func (c *Client) DeleteSnapshot(instanceName, snapName string) error {
	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "delete", fmt.Sprintf("%s/%s", instanceName, snapName)).CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to delete snapshot: %s", string(out))
	}
	return nil
}

func (c *Client) RestoreSnapshot(instanceName, snapName string) error {
	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "restore", instanceName, snapName).CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to restore snapshot: %s", string(out))
	}
	return nil
}

func (c *Client) UpdateInstanceConfig(name string, ramGB, cpuCores int, autostart bool) error {
	lxcBin := FindLXCBin()
	_ = exec.Command(lxcBin, "config", "set", name, "limits.memory", fmt.Sprintf("%dGB", ramGB)).Run()
	_ = exec.Command(lxcBin, "config", "set", name, "limits.cpu", fmt.Sprintf("%d", cpuCores)).Run()
	autostartStr := "false"
	if autostart {
		autostartStr = "true"
	}
	_ = exec.Command(lxcBin, "config", "set", name, "boot.autostart", autostartStr).Run()
	return nil
}

func (c *Client) ListStoragePools() ([]StoragePool, error) {
	pools := []StoragePool{}
	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "storage", "list", "--format", "csv").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			parts := strings.Split(line, ",")
			if len(parts) >= 2 && strings.TrimSpace(parts[0]) != "" {
				pools = append(pools, StoragePool{
					Name:   strings.TrimSpace(parts[0]),
					Driver: strings.TrimSpace(parts[1]),
					Used:   "Active",
				})
			}
		}
	}
	if len(pools) == 0 {
		pools = append(pools, StoragePool{Name: "default", Driver: "dir", Used: "Active"})
	}
	return pools, nil
}

func (c *Client) ListNetworks() ([]LXDNetwork, error) {
	nets := []LXDNetwork{}
	lxcBin := FindLXCBin()
	out, err := exec.Command(lxcBin, "network", "list", "--format", "csv").Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			parts := strings.Split(line, ",")
			if len(parts) >= 2 && strings.TrimSpace(parts[0]) != "" {
				name := strings.TrimSpace(parts[0])
				netType := strings.TrimSpace(parts[1])
				ipv4 := "-"
				if len(parts) >= 4 && strings.TrimSpace(parts[3]) != "" {
					ipv4 = strings.TrimSpace(parts[3])
				}
				nets = append(nets, LXDNetwork{
					Name:    name,
					Type:    netType,
					IPv4:    ipv4,
					Managed: true,
				})
			}
		}
	}
	if len(nets) == 0 {
		nets = append(nets, LXDNetwork{Name: "lxdbr0", Type: "bridge", IPv4: "10.150.0.1/24", Managed: true})
	}
	return nets, nil
}
