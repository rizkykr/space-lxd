import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { AddNodeModal } from '../modals/AddNodeModal';
import { CreateLXDModal } from '../modals/CreateLXDModal';
import { WelcomeModal } from '../modals/WelcomeModal';
import { AlertCircle, Check } from 'lucide-react';
import { wsUrl } from '../../utils/api';
import { useI18n } from '../../i18n';

export function ProtectedLayout({ user, onLogout }) {
  const { t } = useI18n();
  const [nodes, setNodes] = useState([]);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showCreateLXDModal, setShowCreateLXDModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [joinTokenData, setJoinTokenData] = useState(null);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('space_lxd_welcome_seen');
    if (!hasSeenWelcome) {
      setShowWelcomeModal(true);
    }
  }, []);

  const addToast = (type, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const fetchNodes = async () => {
    try {
      const res = await fetch('/api/nodes');
      if (res.ok) {
        const data = await res.json();
        setNodes(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch nodes:', err);
    }
  };

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 10000); // Poll fallback (WS primary)
    return () => clearInterval(interval);
  }, []);

  // Realtime cluster state push from master WebSocket (best-effort, no-op on failure)
  useEffect(() => {
    let socket;
    let retryTimer;
    let closed = false;

    const connect = () => {
      socket = new WebSocket(wsUrl('/ws/dashboard'));
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data)) setNodes(data);
        } catch (e) {}
      };
      socket.onclose = () => {
        if (!closed) retryTimer = setTimeout(connect, 5000);
      };
      socket.onerror = () => socket && socket.close();
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  const handleOpenAddNode = async () => {
    try {
      const res = await fetch('/api/nodes/join-token', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setJoinTokenData(data);
        setShowAddNodeModal(true);
      } else {
        addToast('error', t('addnode.joinFailed'));
      }
    } catch (e) {
      addToast('error', e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop Persistent Sidebar Navigation */}
      <Sidebar nodes={nodes} className="hidden md:flex" />

      {/* Mobile Off-Canvas Canvas Sidebar Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-fade-in">
          {/* Backdrop Blur Overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileNavOpen(false)}
          />

          {/* Sliding Canvas Drawer */}
          <div className="relative flex-1 flex flex-col max-w-[280px] w-full bg-card border-r border-border shadow-2xl z-50 animate-slide-right">
            <Sidebar
              nodes={nodes}
              onNavigate={() => setMobileNavOpen(false)}
              onClose={() => setMobileNavOpen(false)}
              isMobile
            />
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          user={user}
          nodesCount={nodes.length}
          onLogout={onLogout}
          onRefresh={fetchNodes}
          onToggleMobileNav={() => setMobileNavOpen(prev => !prev)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          <Outlet context={{ nodes, fetchNodes, addToast, onOpenAddNode: handleOpenAddNode, onOpenCreateLXD: () => setShowCreateLXDModal(true) }} />
        </main>
      </div>

      {/* Floating Toast Notification Stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none max-w-sm w-full px-4 sm:px-0">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-lg border shadow-lg flex items-center gap-3 font-mono text-xs animate-slide-up ${
              toast.type === 'error'
                ? 'bg-destructive/90 text-destructive-foreground border-destructive/50'
                : 'bg-emerald-500/90 text-white border-emerald-400/50'
            }`}
          >
            {toast.type === 'error' ? <AlertCircle className="size-4 shrink-0" /> : <Check className="size-4 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Modals */}
      {showWelcomeModal && (
        <WelcomeModal onClose={() => setShowWelcomeModal(false)} />
      )}

      {showAddNodeModal && joinTokenData && (
        <AddNodeModal joinTokenData={joinTokenData} onClose={() => setShowAddNodeModal(false)} />
      )}

      {showCreateLXDModal && (
        <CreateLXDModal nodes={nodes} onClose={() => setShowCreateLXDModal(false)} onRefresh={fetchNodes} addToast={addToast} />
      )}
    </div>
  );
}

export default ProtectedLayout;
