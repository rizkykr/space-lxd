// Package bench provides hardware discovery and lightweight host benchmarks
// (CPU, memory, disk I/O, and internet throughput) used by the node hardware
// & performance tooling in the dashboard.
package bench

import (
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

type HardwareInfo struct {
	Hostname     string    `json:"hostname"`
	OS           string    `json:"os"`
	Kernel       string    `json:"kernel"`
	Architecture string    `json:"architecture"`
	Uptime       string    `json:"uptime"`
	CPU          CPUInfo   `json:"cpu"`
	RAMTotalMB   uint64    `json:"ram_total_mb"`
	Disks        []DiskInfo `json:"disks"`
	Networks     []NetInfo `json:"networks"`
}

type CPUInfo struct {
	Model     string `json:"model"`
	Sockets   int    `json:"sockets"`
	Cores     int    `json:"cores"`
	Threads   int    `json:"threads"`
	Frequency string `json:"frequency"`
}

type DiskInfo struct {
	Name   string `json:"name"`
	Model  string `json:"model"`
	SizeGB string `json:"size_gb"`
	Type   string `json:"type"` // ssd | hdd | unknown
	Mount  string `json:"mount,omitempty"`
}

type NetInfo struct {
	Name    string   `json:"name"`
	State   string   `json:"state"`
	MAC     string   `json:"mac"`
	Speed   string   `json:"speed"`
	Addresses []string `json:"addresses"`
}

type BenchmarkResult struct {
	Timestamp      string  `json:"timestamp"`
	DurationSec    float64 `json:"duration_sec"`
	CPUScore       float64 `json:"cpu_score"`        // single-thread ops/s
	CPUMultiScore  float64 `json:"cpu_multi_score"`  // multi-thread ops/s
	MemoryWriteMBs float64 `json:"memory_write_mbs"`
	MemoryReadMBs  float64 `json:"memory_read_mbs"`
	DiskWriteMBs   float64 `json:"disk_write_mbs"`
	DiskReadMBs    float64 `json:"disk_read_mbs"`
	NetworkMbps    float64 `json:"network_mbps"`
	NetworkOK      bool    `json:"network_ok"`
	SpeedIndex     int     `json:"speed_index"`
}

// ── Hardware discovery ──────────────────────────────────────────────────────────

func GetHardwareInfo() HardwareInfo {
	hostname, _ := os.Hostname()
	info := HardwareInfo{
		Hostname:     hostname,
		OS:           readFirstLine("/etc/os-release", "PRETTY_NAME=", `"`),
		Kernel:       readCmd("uname", "-r"),
		Architecture: readCmd("uname", "-m"),
		Uptime:       strings.TrimPrefix(readCmd("uptime", "-p"), "up "),
		CPU:          getCPUInfo(),
		RAMTotalMB:   getMemTotalMB(),
		Disks:        getDisks(),
		Networks:     getNetworks(),
	}
	return info
}

func readFirstLine(path, prefix, strip string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, prefix) {
			val := strings.TrimPrefix(line, prefix)
			val = strings.Trim(val, `"`)
			if strip != "" {
				val = strings.TrimSuffix(val, strip)
			}
			return val
		}
	}
	return ""
}

func readCmd(name string, args ...string) string {
	out, err := exec.Command(name, args...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func getCPUInfo() CPUInfo {
	cpu := CPUInfo{
		Model: "Unknown",
	}
	data, err := os.ReadFile("/proc/cpuinfo")
	if err != nil {
		cpu.Cores = runtime.NumCPU()
		cpu.Threads = runtime.NumCPU()
		cpu.Sockets = 1
		return cpu
	}
	var (
		modelName        string
		cores, siblings  int
		sockets          = map[string]bool{}
		freq             string
	)
	for _, line := range strings.Split(string(data), "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		switch key {
		case "model name":
			if modelName == "" {
				modelName = val
			}
		case "cpu cores":
			var v int
			if _, err := fmt.Sscanf(val, "%d", &v); err == nil && v > cores {
				cores = v
			}
		case "siblings":
			var v int
			if _, err := fmt.Sscanf(val, "%d", &v); err == nil && v > siblings {
				siblings = v
			}
		case "physical id":
			sockets[val] = true
		case "cpu MHz":
			freq = val
		}
	}
	if modelName != "" {
		cpu.Model = modelName
	}
	if len(sockets) > 0 {
		cpu.Sockets = len(sockets)
	} else {
		cpu.Sockets = 1
	}
	cpu.Cores = cores
	cpu.Threads = siblings
	if cpu.Cores == 0 {
		cpu.Cores = runtime.NumCPU()
	}
	if cpu.Threads == 0 {
		cpu.Threads = runtime.NumCPU()
	}
	if freq != "" {
		cpu.Frequency = fmt.Sprintf("%s MHz", strings.Split(freq, ".")[0])
	}
	return cpu
}

func getMemTotalMB() uint64 {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.HasPrefix(line, "MemTotal:") {
			fields := strings.Fields(line)
			if len(fields) >= 2 {
				var kb uint64
				fmt.Sscanf(fields[1], "%d", &kb)
				return kb / 1024
			}
		}
	}
	return 0
}

func getDisks() []DiskInfo {
	var disks []DiskInfo

	// Prefer lsblk (JSON) when available for model/rotation info.
	if out, err := exec.Command("lsblk", "-J", "-b", "-o", "NAME,MODEL,SIZE,ROTA,MOUNTPOINTS,TYPE").Output(); err == nil {
		var parsed struct {
			BlockDevices []struct {
				Name        string   `json:"name"`
				Model       string   `json:"model"`
				Size        uint64   `json:"size"`
				Rota        int      `json:"rota"`
				Type        string   `json:"type"`
				Mountpoints []string `json:"mountpoints"`
			} `json:"blockdevices"`
		}
		if json.Unmarshal(out, &parsed) == nil {
			for _, d := range parsed.BlockDevices {
				if d.Type != "disk" {
					continue
				}
				disk := DiskInfo{
					Name:   d.Name,
					Model:  d.Model,
					SizeGB: fmt.Sprintf("%.0f", float64(d.Size)/1024/1024/1024),
					Mount:  strings.Join(nonEmpty(d.Mountpoints), ", "),
				}
				if d.Rota == 0 {
					disk.Type = "ssd"
				} else {
					disk.Type = "hdd"
				}
				disks = append(disks, disk)
			}
		}
	}

	if len(disks) == 0 {
		// Fallback: enumerate /sys/block
		entries, _ := os.ReadDir("/sys/block")
		for _, e := range entries {
			model := ""
			if data, err := os.ReadFile(filepath.Join("/sys/block", e.Name(), "device", "model")); err == nil {
				model = strings.TrimSpace(string(data))
			}
			disks = append(disks, DiskInfo{
				Name:   e.Name(),
				Model:  model,
				SizeGB: "?",
				Type:   "unknown",
			})
		}
	}

	sort.Slice(disks, func(i, j int) bool { return disks[i].Name < disks[j].Name })
	return disks
}

func nonEmpty(in []string) []string {
	var out []string
	for _, s := range in {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func getNetworks() []NetInfo {
	var nets []NetInfo
	ifaces, err := net.Interfaces()
	if err != nil {
		return nets
	}
	for _, iface := range ifaces {
		var addrs []string
		if a, err := iface.Addrs(); err == nil {
			for _, addr := range a {
				addrs = append(addrs, addr.String())
			}
		}
		state := "down"
		if iface.Flags&net.FlagUp != 0 {
			state = "up"
		}
		speed := ""
		if data, err := os.ReadFile(filepath.Join("/sys/class/net", iface.Name, "speed")); err == nil {
			speed = strings.TrimSpace(string(data))
		}
		nets = append(nets, NetInfo{
			Name:      iface.Name,
			State:     state,
			MAC:       iface.HardwareAddr.String(),
			Speed:     speed,
			Addresses: addrs,
		})
	}
	return nets
}

// ── Benchmarks ──────────────────────────────────────────────────────────────────

const (
	refCPUScore  = 200_000_000.0 // single-thread integer loop ops/s on a modern desktop
	refMemMBs    = 8000.0
	refDiskMBs   = 1200.0
	refNetMbps   = 200.0
	memBenchMB   = 256
	diskBenchMB  = 256
)

func RunBenchmark() BenchmarkResult {
	start := time.Now()

	threads := runtime.NumCPU()
	if threads > 8 {
		threads = 8
	}
	cpuSingle := benchCPUSingle(600 * time.Millisecond)
	cpuMulti := benchCPUMulti(600*time.Millisecond, threads)
	memWrite, memRead := benchMemory(memBenchMB)
	diskWrite, diskRead := benchDisk(diskBenchMB)
	netMbps, netOK := benchNetwork()

	result := BenchmarkResult{
		Timestamp:      time.Now().UTC().Format(time.RFC3339),
		CPUScore:       cpuSingle,
		CPUMultiScore:  cpuMulti,
		MemoryWriteMBs: memWrite,
		MemoryReadMBs:  memRead,
		DiskWriteMBs:   diskWrite,
		DiskReadMBs:    diskRead,
		NetworkMbps:    netMbps,
		NetworkOK:      netOK,
	}
	result.SpeedIndex = computeIndex(result)
	result.DurationSec = time.Since(start).Seconds()
	return result
}

func benchCPUSingle(d time.Duration) float64 {
	const batch = 1_000_000
	var x uint64 = 1
	iters := 0
	start := time.Now()
	for time.Since(start) < d {
		for i := 0; i < batch; i++ {
			x = x*1103515245 + 12345
		}
		iters += batch
	}
	_ = x
	elapsed := time.Since(start).Seconds()
	if elapsed <= 0 {
		return 0
	}
	return float64(iters) / elapsed
}

func benchCPUMulti(d time.Duration, threads int) float64 {
	var wg sync.WaitGroup
	var mu sync.Mutex
	total := 0.0
	for i := 0; i < threads; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s := benchCPUSingle(d)
			mu.Lock()
			total += s
			mu.Unlock()
		}()
	}
	wg.Wait()
	return total
}

func benchMemory(sizeMB int) (writeMBs, readMBs float64) {
	buf := make([]byte, sizeMB*1024*1024)

	start := time.Now()
	for i := range buf {
		buf[i] = byte(i)
	}
	writeMBs = float64(sizeMB) / time.Since(start).Seconds()

	var sum uint64
	start = time.Now()
	for _, b := range buf {
		sum += uint64(b)
	}
	readMBs = float64(sizeMB) / time.Since(start).Seconds()
	_ = sum
	return writeMBs, readMBs
}

func benchDisk(sizeMB int) (writeMBs, readMBs float64) {
	dir, err := os.MkdirTemp("", "space-lxd-bench-")
	if err != nil {
		return 0, 0
	}
	defer os.RemoveAll(dir)

	path := filepath.Join(dir, "bench.bin")
	f, err := os.Create(path)
	if err != nil {
		return 0, 0
	}
	chunk := make([]byte, 1024*1024)
	for i := range chunk {
		chunk[i] = byte(i)
	}

	start := time.Now()
	for i := 0; i < sizeMB; i++ {
		if _, err := f.Write(chunk); err != nil {
			f.Close()
			return 0, 0
		}
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return 0, 0
	}
	writeMBs = float64(sizeMB) / time.Since(start).Seconds()
	f.Close()

	f, err = os.Open(path)
	if err != nil {
		return writeMBs, 0
	}
	defer f.Close()
	readBuf := make([]byte, 1024*1024)
	start = time.Now()
	total := 0
	for {
		n, err := f.Read(readBuf)
		total += n
		if err != nil {
			break
		}
	}
	readMBs = float64(total/1024/1024) / time.Since(start).Seconds()
	return writeMBs, readMBs
}

var netTestURLs = []string{
	"https://proof.ovh.net/files/5Mb.dat",
	"https://speed.hetzner.de/10MB.bin",
	"http://speedtest.tele2.net/5MB.zip",
}

func benchNetwork() (mbps float64, ok bool) {
	client := &http.Client{Timeout: 10 * time.Second}
	for _, u := range netTestURLs {
		start := time.Now()
		resp, err := client.Get(u)
		if err != nil {
			continue
		}
		n, err := io.Copy(io.Discard, resp.Body)
		_ = resp.Body.Close()
		if err != nil {
			continue
		}
		secs := time.Since(start).Seconds()
		if secs <= 0 || n < 50_000 {
			continue
		}
		mbps = float64(n) * 8 / secs / 1_000_000
		if mbps > 0 {
			return mbps, true
		}
	}
	return 0, false
}

func clamp(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func computeIndex(r BenchmarkResult) int {
	cpuIdx := clamp(r.CPUScore / refCPUScore * 100)
	memIdx := clamp(((r.MemoryWriteMBs + r.MemoryReadMBs) / 2) / refMemMBs * 100)
	diskIdx := clamp(((r.DiskWriteMBs + r.DiskReadMBs) / 2) / refDiskMBs * 100)
	netIdx := 0.0
	if r.NetworkOK {
		netIdx = clamp(r.NetworkMbps / refNetMbps * 100)
	}
	idx := 0.4*cpuIdx + 0.2*memIdx + 0.2*diskIdx + 0.2*netIdx
	return int(idx)
}
