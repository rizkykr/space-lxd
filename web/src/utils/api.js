// API helpers: auto-attach the JWT to every fetch and WebSocket URL.

export function getToken() {
  return localStorage.getItem('lxd_token') || '';
}

// Build a WebSocket URL for a pathname, appending the auth token query param.
export function wsUrl(pathname) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const sep = pathname.includes('?') ? '&' : '?';
  return `${protocol}//${window.location.host}${pathname}${sep}token=${encodeURIComponent(getToken())}`;
}

// Global fetch interceptor: attach the Bearer token and redirect to /login on 401.
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const urlStr = String(url);
  const token = getToken();

  const opts = { ...options };
  if (token && !urlStr.startsWith('/api/auth/')) {
    opts.headers = { ...(opts.headers || {}), Authorization: `Bearer ${token}` };
  }

  const res = await originalFetch(url, opts);

  if (res.status === 401 && !urlStr.startsWith('/api/auth/')) {
    localStorage.removeItem('lxd_token');
    localStorage.removeItem('lxd_user');
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
  }

  return res;
};
