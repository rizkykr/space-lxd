import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { useI18n } from './i18n';
import { useTheme } from './theme';

// Layout (static, needed for routing shell)
import { ProtectedLayout } from './components/layout/ProtectedLayout';

// Lazy-loaded pages (code-split for faster initial load)
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const MonitoringPage = lazy(() => import('./pages/MonitoringPage'));
const NodesPage = lazy(() => import('./pages/NodesPage'));
const NodeLXDsPage = lazy(() => import('./pages/NodeLXDsPage'));
const LXDDetailPage = lazy(() => import('./pages/LXDDetailPage'));
const SSHKeysAndTemplatesPage = lazy(() => import('./pages/SSHKeysAndTemplatesPage'));
const AuditLogsPage = lazy(() => import('./pages/AuditLogsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SetupPage = lazy(() => import('./pages/SetupPage'));

function PageLoader() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground font-mono text-xs">
      <div className="flex items-center gap-3">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading...</span>
      </div>
    </div>
  );
}

// ── APP ROOT ROUTER ────────────────────────────────────────────────────────────
export default function App() {
  const { setLanguage } = useI18n();
  const { setTheme } = useTheme();
  const [setupRequired, setSetupRequired] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('lxd_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('lxd_user') || 'null'));
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        if (!data.setup_completed) setSetupRequired(true);
        if (data.language && !localStorage.getItem('lxd_lang')) {
          setLanguage(data.language);
        }
        if (data.theme && !localStorage.getItem('lxd_theme')) {
          setTheme(data.theme);
        }
      })
      .catch(console.error)
      .finally(() => setAuthLoading(false));
  }, [setLanguage, setTheme]);

  const handleLoginSuccess = (newToken, newUser) => {
    setSetupRequired(false);
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('lxd_token', newToken);
    localStorage.setItem('lxd_user', JSON.stringify(newUser));
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('lxd_token');
    localStorage.removeItem('lxd_user');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground font-mono text-xs">
        <div className="flex items-center gap-3">
          <RefreshCw className="size-5 animate-spin text-primary" />
          <span>Initializing Space LXD Engine...</span>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/setup" element={setupRequired ? <SetupPage onSetupComplete={handleLoginSuccess} /> : <Navigate to="/" replace />} />
        <Route path="/login" element={!token ? <LoginPage onLoginSuccess={handleLoginSuccess} /> : <Navigate to="/" replace />} />

        {/* Protected Dashboard Layout */}
        <Route
          path="/"
          element={
            setupRequired ? (
              <Navigate to="/setup" replace />
            ) : !token ? (
              <Navigate to="/login" replace />
            ) : (
              <ProtectedLayout user={user} onLogout={handleLogout} />
            )
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="monitoring" element={<MonitoringPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="nodes/:nodeId" element={<NodeLXDsPage />} />
          <Route path="lxds" element={<Navigate to="/nodes" replace />} />
          <Route path="lxds/:nodeId/:lxdName" element={<LXDDetailPage />} />
          <Route path="templates" element={<SSHKeysAndTemplatesPage />} />
          <Route path="logs" element={<AuditLogsPage />} />
          <Route path="profile" element={<ProfilePage user={user} />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
