import React, { useState } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Input } from '../components/ui/primitives';
import { TerminalModal } from '../components/modals/TerminalModal';
import { NodeHostTerminal } from '../components/terminal/NodeHostTerminal';
import { ConfirmDialog } from '../components/modals/ConfirmDialog';
import { Plus, ChevronRight, Layers, Sliders, Terminal, Square, Play, Trash2, Loader2, Server, Edit2, Check, X } from 'lucide-react';

export function NodeLXDsPage() {
  const { nodeId } = useParams();
  const navigate = useNavigate();
  const { nodes, fetchNodes, addToast, onOpenCreateLXD } = useOutletContext();
  const [activeTab, setActiveTab] = useState('containers');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTerminalTarget, setActiveTerminalTarget] = useState(null);
  const [loadingAction, setLoadingAction] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  // Node Rename State
  const [isEditingName, setIsEditingName] = useState(false);
  const [nodeNewName, setNodeNewName] = useState('');
  const [renamingLoading, setRenamingLoading] = useState(false);

  const targetNode = nodes.find(n => n.id === nodeId) || nodes[0];
  const nodeLXDs = targetNode?.lxds || targetNode?.instances || [];

  const handleRenameNode = async () => {
    const trimmed = nodeNewName.trim();
    if (!trimmed) {
      addToast('error', 'Nama node tidak boleh kosong');
      return;
    }
    setRenamingLoading(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename_node', new_name: trimmed })
      });
      if (res.ok) {
        addToast('success', `Nama node berhasil diperbarui menjadi '${trimmed}'`);
        setIsEditingName(false);
        fetchNodes();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', "Error: " + e.message);
    } finally {
      setRenamingLoading(false);
    }
  };

  const filteredLXDs = nodeLXDs.filter(item => {
    return item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (item.ipv4 && item.ipv4.includes(searchTerm));
  });

  const handleLXDAction = async (action, lxdName) => {
    setLoadingAction(`${action}_${lxdName}`);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name: lxdName })
      });
      if (res.ok) {
        addToast('success', `LXD '${lxdName}' berhasil di-${action}`);
        fetchNodes();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', "Error: " + e.message);
    } finally {
      setLoadingAction('');
      setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
    }
  };

  const promptDeleteLXD = (lxdName) => {
    setConfirmModal({
      isOpen: true,
      title: `Hapus LXD Container '${lxdName}'`,
      message: `Apakah Anda yakin ingin menghapus LXD Container '${lxdName}' di Node ${targetNode?.name || nodeId}? Semua data dan memori di dalam container ini akan dihapus secara permanen.`,
      requireMatchText: lxdName,
      onConfirm: () => handleLXDAction('delete', lxdName)
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
            <span className="cursor-pointer hover:underline text-primary" onClick={() => navigate('/nodes')}>Node Servers</span>
            <ChevronRight className="size-3" />
            <span className="text-foreground font-bold">{targetNode?.name || nodeId}</span>
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-3">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={nodeNewName}
                  onChange={(e) => setNodeNewName(e.target.value)}
                  placeholder="Nama Node Baru..."
                  className="h-8 text-sm font-bold w-56"
                  autoFocus
                />
                <Button size="sm" onClick={handleRenameNode} disabled={renamingLoading} className="h-8 px-2.5">
                  {renamingLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setIsEditingName(false)} disabled={renamingLoading} className="h-8 px-2.5">
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>Node: {targetNode?.name || nodeId}</span>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-primary" title="Ubah Nama Display Node" onClick={() => { setNodeNewName(targetNode?.name || ''); setIsEditingName(true); }}>
                  <Edit2 className="size-3.5" />
                </Button>
              </div>
            )}
            {targetNode?.is_master ? <Badge variant="info">MASTER NODE</Badge> : <Badge variant="secondary">WORKER NODE</Badge>}
            <Badge variant={targetNode?.status === 'online' ? 'success' : 'secondary'}>
              {targetNode?.status?.toUpperCase() || 'ONLINE'}
            </Badge>
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setActiveTab('terminal')}>
            <Server className="size-4" data-icon="inline-start" />
            <span>Host Terminal</span>
          </Button>
          <Button onClick={onOpenCreateLXD}>
            <Plus className="size-4" data-icon="inline-start" />
            <span>Create LXD Container</span>
          </Button>
        </div>
      </div>

      {/* Node Health Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase">IP Address</p>
          <p className="text-base font-bold text-foreground">{targetNode?.ip || '127.0.0.1'}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase">RAM Usage</p>
          <p className="text-base font-bold text-purple-400">
            {targetNode ? `${(targetNode.ram_used_mb / 1024).toFixed(1)} / ${(targetNode.ram_total_mb / 1024).toFixed(1)} GB` : '—'}
          </p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase">Active LXD Containers</p>
          <p className="text-base font-bold text-primary">{nodeLXDs.length} LXDs</p>
        </Card>
      </div>

      {/* Tab Bar */}
      <Card className="p-1 flex border-border bg-card font-medium text-xs">
        <button
          onClick={() => setActiveTab('containers')}
          className={`flex-1 py-2.5 rounded-md transition font-medium text-center flex items-center justify-center gap-1.5 ${activeTab === 'containers' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Layers className="size-3.5" />
          LXD Containers ({nodeLXDs.length})
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex-1 py-2.5 rounded-md transition font-medium text-center flex items-center justify-center gap-1.5 ${activeTab === 'terminal' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Server className="size-3.5" />
          🖥 Host Terminal
        </button>
      </Card>

      {/* Tab: LXD Containers */}
      <div className={activeTab === 'containers' ? 'block space-y-4' : 'hidden'}>
        {/* Search */}
        <Card className="p-3.5 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <span>LXD Containers List ({filteredLXDs.length})</span>
          </h2>
          <Input
            type="text"
            placeholder="Cari container name, IP..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-64"
          />
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-[11px] font-mono text-muted-foreground uppercase tracking-wider bg-background">
                  <th className="py-3.5 px-4">Container Name</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">IPv4 Address</th>
                  <th className="py-3.5 px-4">RAM Allocation</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs font-sans">
                {filteredLXDs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-12 text-muted-foreground font-mono">
                      Belum ada container LXD di Node ini. Klik 'Create LXD Container' untuk menambahkan.
                    </td>
                  </tr>
                ) : (
                  filteredLXDs.map((item, idx) => {
                    const isRunning = item.status.toLowerCase() === 'running';
                    const isItemLoading = loadingAction.endsWith(`_${item.name}`);

                    return (
                      <tr key={`${nodeId}-${item.name}-${idx}`} className="hover:bg-accent/50 transition cursor-pointer" onClick={() => navigate(`/lxds/${nodeId}/${item.name}`)}>
                        <td className="py-3.5 px-4 font-bold text-foreground flex items-center gap-2">
                          <span className={`size-2 rounded-full ${isRunning ? 'bg-emerald-400' : 'bg-muted-foreground'}`}></span>
                          <span className="hover:underline text-primary">{item.name}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono">
                          <span className={isRunning ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}>{item.status}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-foreground">{item.ipv4 || '—'}</td>
                        <td className="py-3.5 px-4 font-mono text-foreground">{item.ram_used_mb ? `${item.ram_used_mb} MB` : '—'}</td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/lxds/${nodeId}/${item.name}`)} title="Inspect Full LXD Detail Page">
                              <Sliders className="size-3.5 text-muted-foreground" />
                            </Button>
                            {isRunning ? (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => setActiveTerminalTarget(item)} title="Terminal Shell">
                                  <Terminal className="size-3.5 text-primary" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleLXDAction('stop', item.name)} disabled={isItemLoading} title="Stop LXD">
                                  {loadingAction === `stop_${item.name}` ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5 text-amber-400" />}
                                </Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="icon" onClick={() => handleLXDAction('start', item.name)} disabled={isItemLoading} title="Start LXD">
                                {loadingAction === `start_${item.name}` ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 text-emerald-400" />}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => promptDeleteLXD(item.name)} disabled={isItemLoading} title="Delete LXD">
                              {loadingAction === `delete_${item.name}` ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 text-destructive" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Tab: Host Terminal (persisted in DOM) */}
      <div className={activeTab === 'terminal' ? 'block' : 'hidden'}>
        <Card className="h-[580px] overflow-hidden flex flex-col border-border">
          <div className="bg-background px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1.5">
                <span className="size-3 rounded-full bg-red-500/70"></span>
                <span className="size-3 rounded-full bg-yellow-500/70"></span>
                <span className="size-3 rounded-full bg-emerald-500/70"></span>
              </div>
              <Server className="size-4 text-amber-400 ml-1" />
              <span className="font-mono text-xs text-foreground font-bold">
                {targetNode?.name || nodeId}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                ({targetNode?.ip || 'localhost'}) — Host Shell
              </span>
              {targetNode?.is_master && (
                <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded">
                  MASTER
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">
              /ws/node-terminal
            </div>
          </div>
          <NodeHostTerminal nodeId={nodeId} nodeName={targetNode?.name} />
        </Card>
      </div>

      {/* LXD Container Terminal Modal */}
      {activeTerminalTarget && (
        <TerminalModal target={{ ...activeTerminalTarget, node_name: targetNode?.name || nodeId }} onClose={() => setActiveTerminalTarget(null)} />
      )}

      <ConfirmDialog
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        requireMatchText={confirmModal.requireMatchText}
        loading={!!loadingAction}
        onConfirm={confirmModal.onConfirm}
        onClose={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
      />
    </div>
  );
}
