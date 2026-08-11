import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';

// Layout & Pages
import { ProtectedLayout } from './components/layout/ProtectedLayout';
import { DashboardPage } from './pages/DashboardPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { NodesPage } from './pages/NodesPage';
import { NodeLXDsPage } from './pages/NodeLXDsPage';
import { LXDDetailPage } from './pages/LXDDetailPage';
import { SSHKeysAndTemplatesPage } from './pages/SSHKeysAndTemplatesPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { LoginPage } from './pages/LoginPage';
import { SetupPage } from './pages/SetupPage';

// ── APP ROOT ROUTER ────────────────────────────────────────────────────────────
export default function App() {
  const [setupRequired, setSetupRequired] = useState(false);
  const [token, setToken] = useState(localStorage.getItem('lxd_token') || '');
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('lxd_user') || 'null'));
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/status')
      .then(res => res.json())
      .then(data => {
        if (!data.setup_completed) setSetupRequired(true);
      })
      .catch(console.error)
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLoginSuccess = (newToken, newUser) => {
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
  );
}
