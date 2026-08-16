package updater

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type VersionInfo struct {
	CurrentCommit string `json:"current_commit"`
	LatestCommit  string `json:"latest_commit"`
	CommitMessage string `json:"commit_message"`
	HasUpdate     bool   `json:"has_update"`
	CurrentTag    string `json:"current_tag"`
}

type GitHubCommitResponse struct {
	Sha    string `json:"sha"`
	Commit struct {
		Message string `json:"message"`
	} `json:"commit"`
}

// GetCurrentCommit returns short local git commit SHA or "v1.0.0"
func GetCurrentCommit(repoPath string) string {
	cmd := exec.Command("git", "-c", "safe.directory=*", "rev-parse", "--short", "HEAD")
	cmd.Dir = repoPath
	out, err := cmd.Output()
	if err != nil {
		return "v1.0.0"
	}
	return strings.TrimSpace(string(out))
}

// CheckForUpdates queries GitHub API for latest commit sha on main branch
func CheckForUpdates(repoPath string) (*VersionInfo, error) {
	currentCommit := GetCurrentCommit(repoPath)

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("GET", "https://api.github.com/repos/rizkykr/space-lxd/commits/main", nil)
	if err != nil {
		return &VersionInfo{CurrentCommit: currentCommit, HasUpdate: false}, nil
	}
	req.Header.Set("User-Agent", "Space-LXD-Updater")

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return &VersionInfo{CurrentCommit: currentCommit, HasUpdate: false}, nil
	}
	defer resp.Body.Close()

	var ghResp GitHubCommitResponse
	if err := json.NewDecoder(resp.Body).Decode(&ghResp); err != nil {
		return &VersionInfo{CurrentCommit: currentCommit, HasUpdate: false}, nil
	}

	latestShaShort := ghResp.Sha
	if len(latestShaShort) > 7 {
		latestShaShort = latestShaShort[:7]
	}

	hasUpdate := false
	if currentCommit != "v1.0.0" && latestShaShort != "" && !strings.HasPrefix(latestShaShort, currentCommit) && !strings.HasPrefix(currentCommit, latestShaShort) {
		hasUpdate = true
	}

	msg := ghResp.Commit.Message
	if idx := strings.Index(msg, "\n"); idx != -1 {
		msg = msg[:idx]
	}

	return &VersionInfo{
		CurrentCommit: currentCommit,
		LatestCommit:  latestShaShort,
		CommitMessage: msg,
		HasUpdate:     hasUpdate,
		CurrentTag:    "v1.0.0",
	}, nil
}

// ApplyUpdate pulls latest code from GitHub main branch and builds project
func ApplyUpdate(repoPath string, logFn func(string)) error {
	if logFn == nil {
		logFn = func(s string) {}
	}

	logFn("🔍 Memeriksa lokasi repositori Space LXD...")
	if repoPath == "" {
		repoPath = "/opt/space-lxd"
	}
	if _, err := os.Stat(repoPath); os.IsNotExist(err) {
		repoPath, _ = os.Getwd()
	}

	// Dynamic PATH discovery
	var extraPaths []string
	extraPaths = append(extraPaths, "/usr/local/go/bin", "/usr/local/bin", "/usr/bin", "/bin", "/snap/bin")

	for _, pattern := range []string{
		"/home/*/.local/share/lerd/bin",
		"/home/*/.nvm/versions/node/*/bin",
		"/root/.local/share/lerd/bin",
		"/root/.nvm/versions/node/*/bin",
		"/opt/node/bin",
	} {
		if matches, err := filepath.Glob(pattern); err == nil {
			extraPaths = append(extraPaths, matches...)
		}
	}

	env := append(os.Environ(), "PATH="+strings.Join(extraPaths, ":")+":"+os.Getenv("PATH"))

	logFn(fmt.Sprintf("📦 Mengunduh update terbaru dari GitHub di %s...", repoPath))

	// Fix directory permissions if needed
	_ = exec.Command("sudo", "chown", "-R", "space-lxd:space-lxd", repoPath).Run()
	_ = exec.Command("sudo", "chmod", "-R", "u+rwX,g+rwX", repoPath).Run()

	fetchCmd := exec.Command("git", "-c", "safe.directory=*", "fetch", "origin", "main")
	fetchCmd.Dir = repoPath
	fetchCmd.Env = env
	if _, err := fetchCmd.CombinedOutput(); err != nil {
		sudoFetch := exec.Command("sudo", "git", "-c", "safe.directory=*", "-C", repoPath, "fetch", "origin", "main")
		sudoFetch.Env = env
		_ = sudoFetch.Run()
	}

	resetCmd := exec.Command("git", "-c", "safe.directory=*", "reset", "--hard", "origin/main")
	resetCmd.Dir = repoPath
	resetCmd.Env = env
	if _, err := resetCmd.CombinedOutput(); err != nil {
		sudoReset := exec.Command("sudo", "git", "-c", "safe.directory=*", "-C", repoPath, "reset", "--hard", "origin/main")
		sudoReset.Env = env
		if out, err := sudoReset.CombinedOutput(); err != nil {
			logFn(fmt.Sprintf("❌ Error git reset: %s", string(out)))
			return fmt.Errorf("git reset failed: %v", err)
		}
	}
	logFn("✅ Source code berhasil diperbarui ke commit terbaru!")

	logFn("🔨 Mengompilasi React UI & Biner Go...")
	buildCmd := exec.Command("/bin/bash", "./scripts/build.sh")
	buildCmd.Dir = repoPath
	buildCmd.Env = env
	if out, err := buildCmd.CombinedOutput(); err != nil {
		logFn(fmt.Sprintf("❌ Error build.sh: %s", string(out)))
		return fmt.Errorf("build failed: %v", err)
	}
	logFn("✅ Kompilasi aset UI & biner Master/Agent berhasil!")

	logFn("🔄 Merefresh daemon service...")
	logFn("🎉 UPDATE SELESAI! Space LXD Dashboard telah diperbarui ke versi terbaru.")

	// Delayed restart so HTTP response finishes clean before daemon restarts
	go func() {
		time.Sleep(1500 * time.Millisecond)
		_ = exec.Command("sudo", "systemctl", "restart", "lxd-manager-master").Run()
		_ = exec.Command("systemctl", "restart", "lxd-manager-master").Run()
		time.Sleep(2 * time.Second)
		os.Exit(0)
	}()

	return nil
}
