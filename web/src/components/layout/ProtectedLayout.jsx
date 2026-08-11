import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { AddNodeModal } from '../modals/AddNodeModal';
import { CreateLXDModal } from '../modals/CreateLXDModal';
import { WelcomeModal } from '../modals/WelcomeModal';
import { AlertCircle, Check } from 'lucide-react';

export function ProtectedLayout({ user, onLogout }) {
  const [nodes, setNodes] = useState([]);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [showCreateLXDModal, setShowCreateLXDModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
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
    const interval = setInterval(fetchNodes, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenAddNode = async () => {
    try {
      const res = await fetch('/api/nodes/join-token', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setJoinTokenData(data);
        setShowAddNodeModal(true);
      } else {
        addToast('error', 'Gagal membangkitkan token Joiner');
      }
    } catch (e) {
      addToast('error', e.message);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar Navigation */}
      <Sidebar nodes={nodes} />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopHeader
          user={user}
          nodesCount={nodes.length}
          onOpenAddNode={handleOpenAddNode}
          onOpenCreateLXD={() => setShowCreateLXDModal(true)}
          onLogout={onLogout}
          onRefresh={fetchNodes}
        />

        <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
          <Outlet context={{ nodes, fetchNodes, addToast, onOpenAddNode: handleOpenAddNode, onOpenCreateLXD: () => setShowCreateLXDModal(true) }} />
        </main>
      </div>

      {/* Floating Toast Notification Stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
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
