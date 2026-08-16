package auth

import (
	"net/http"
	"strings"
)

// publicPrefixes are routes reachable without a JWT (bootstrap, agents, joins).
var publicPrefixes = []string{
	"/api/auth/",        // status, setup, login
	"/api/nodes/register", // agent self-registration (gated by join token)
	"/api/nodes/endpoints", // worker join auto-discovery
	"/join.sh",
	"/downloads/",
	"/download/",
	"/ws/agent", // agent control channel (auth via secret token)
}

func isPublicPath(path string) bool {
	for _, p := range publicPrefixes {
		if strings.HasPrefix(path, p) {
			return true
		}
	}
	return false
}

// JWTMiddleware protects the REST /api/* endpoints and the dashboard/terminal
// WebSockets. REST tokens come from the `Authorization: Bearer` header, while
// WebSocket clients pass their token as a `?token=` query parameter.
func JWTMiddleware(secret string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Static assets & SPA shell are served by the catch-all "/" handler.
		if !strings.HasPrefix(path, "/api/") && !strings.HasPrefix(path, "/ws/") {
			next.ServeHTTP(w, r)
			return
		}

		if isPublicPath(path) {
			next.ServeHTTP(w, r)
			return
		}

		token := ""
		if strings.HasPrefix(path, "/ws/") {
			token = r.URL.Query().Get("token")
		} else {
			h := r.Header.Get("Authorization")
			if strings.HasPrefix(h, "Bearer ") {
				token = strings.TrimPrefix(h, "Bearer ")
			}
		}

		if token == "" {
			writeUnauthorized(w)
			return
		}
		if _, err := ValidateToken(token, secret); err != nil {
			writeUnauthorized(w)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeUnauthorized(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
}
