import React, { useState } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Input } from '../components/ui/primitives';
import { TerminalModal } from '../components/modals/TerminalModal';
import { NodeHostTerminal } from '../components/terminal/NodeHostTerminal';
import { ConfirmDialog } from '../components/modals/ConfirmDialog';
import { Plus, ChevronRight, Layers, Sliders, Terminal, Square, Play, Trash2, Loader2, Server, Edit2, Check, X } from 'lucide-react';
import { useI18n } from '../i18n';

export function NodeLXDsPage() {
  const { nodeId } = useParams();
  const navigate = useNavigate();
  const { nodes, fetchNodes, addToast, onOpenCreateLXD } = useOutletContext();
  const { t } = useI18n();

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
      addToast('error', t('nodes.nameRequired'));
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
        addToast('success', t('nodes.renameSuccess', { name: trimmed }));
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
        addToast('success', t('node.actionDone', { name: lxdName, action }));
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
      title: `${t('node.deleteLxdTitle')} '${lxdName}'`,
      message: t('node.deleteLxdMsg', { name: lxdName }),
      requireMatchText: lxdName,
      onConfirm: () => handleLXDAction('delete', lxdName)
    });
  };

  const handleDeleteNode = async () => {
    setLoadingAction('delete_node');
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_node' })
      });
      if (res.ok) {
        addToast('success', t('node.deleteNodeSuccess', { name: targetNode?.name || nodeId }));
        fetchNodes();
        navigate('/nodes');
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

  const promptDeleteNode = () => {
    const nameMatch = targetNode?.name || nodeId;
    setConfirmModal({
      isOpen: true,
      title: `⚠️ ${t('node.deleteNodeTitle')} '${nameMatch}'`,
      message: t('node.deleteNodeMsg', { name: nameMatch }),
      requireMatchText: nameMatch,
      onConfirm: handleDeleteNode
    });
  };

  // Custom Domain / IP State
  const [isEditingDomain, setIsEditingDomain] = useState(false);
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [domainLoading, setDomainLoading] = useState(false);

  const handleUpdateDomain = async () => {
    setDomainLoading(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_node_domain', custom_ip_domain: customDomainInput.trim() })
      });
      if (res.ok) {
        addToast('success', t('node.customDomainUpdated'));
        setIsEditingDomain(false);
        fetchNodes();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', "Error: " + e.message);
    } finally {
      setDomainLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
            <span className="cursor-pointer hover:underline text-primary" onClick={() => navigate('/nodes')}>
              {t('nodes.title')}
            </span>
            <ChevronRight className="size-3" />
            <span className="text-foreground font-semibold">{targetNode?.name || nodeId}</span>
          </div>

          <div className="flex items-center gap-3">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={nodeNewName}
                  onChange={(e) => setNodeNewName(e.target.value)}
                  placeholder={t('node.renamePlaceholder')}
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
                <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
                  <span className={`size-2.5 rounded-full ${targetNode?.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`}></span>
                  <span>{targetNode?.name || nodeId}</span>
                </h1>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground hover:text-primary"
                  title={t('nodes.renameNode')}
                  onClick={() => { setNodeNewName(targetNode?.name || ''); setIsEditingName(true); }}
                >
                  <Edit2 className="size-3.5" />
                </Button>
              </div>
            )}
            <Badge variant={targetNode?.is_master ? 'info' : 'secondary'} className="text-[10px]">
              {targetNode?.is_master ? t('common.master') : t('common.worker')}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setActiveTab('terminal')}>
            <Server className="size-4 mr-1.5" />
            <span>{t('node.hostTerminal')}</span>
          </Button>
          <Button variant="destructive" size="sm" onClick={promptDeleteNode} title={t('node.deleteNode')}>
            <Trash2 className="size-4 mr-1.5" />
            <span>{t('node.deleteNode')}</span>
          </Button>
          <Button size="sm" onClick={onOpenCreateLXD}>
            <Plus className="size-4 mr-1.5" />
            <span>{t('node.createLxd')}</span>
          </Button>
        </div>
      </div>

      {/* Node Health Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase">{t('node.internalIp')}</p>
          <p className="text-base font-bold text-foreground">{targetNode?.ip || '127.0.0.1'}</p>
          <p className="text-[10px] text-muted-foreground">{t('node.wireguardSubnet')}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase">{t('node.ramUsage')}</p>
          <p className="text-base font-bold text-purple-400">
            {targetNode?.ram_used_mb || 0} / {targetNode?.ram_total_mb || 0} MB
          </p>
          <p className="text-[10px] text-muted-foreground">{t('node.memorySub')}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase">{t('node.uptime')}</p>
          <p className="text-base font-bold text-foreground">{targetNode?.uptime || '0m'}</p>
          <p className="text-[10px] text-muted-foreground">{t('node.lastPing', { time: targetNode?.last_ping ? new Date(targetNode.last_ping).toLocaleTimeString() : 'N/A' })}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground uppercase">{t('node.activeContainers')}</p>
          <p className="text-base font-bold text-emerald-400">{nodeLXDs.length} Instances</p>
          <p className="text-[10px] text-muted-foreground">{t('node.containersSub')}</p>
        </Card>
      </div>

      {/* Custom IP / Public Domain Override Card */}
      <Card className="p-4 space-y-3 bg-secondary/20 border-border">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
              <span>🌐 {t('node.customDomainTitle')}</span>
              {targetNode?.custom_ip_domain && <Badge variant="success" className="text-[10px] py-0">{t('node.customDomainActive')}</Badge>}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t('node.customDomainDesc')}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Input
              type="text"
              placeholder={t('node.customDomainPlaceholder')}
              value={customDomainInput}
              onChange={(e) => setCustomDomainInput(e.target.value)}
              className="h-8 text-xs font-mono w-full sm:w-64"
            />
            <Button size="sm" className="h-8 text-xs" onClick={handleUpdateDomain} disabled={domainLoading}>
              {domainLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5 mr-1" />}
              <span>{t('common.save')}</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Tabs Navigation */}
      <Card className="p-1.5 flex gap-1 font-sans text-xs bg-background/50 border-border">
        <button
          onClick={() => setActiveTab('containers')}
          className={`flex-1 py-2.5 rounded-md transition font-medium text-center flex items-center justify-center gap-1.5 ${activeTab === 'containers' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Layers className="size-3.5" />
          <span>{t('node.lxdContainers', { n: nodeLXDs.length })}</span>
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex-1 py-2.5 rounded-md transition font-medium text-center flex items-center justify-center gap-1.5 ${activeTab === 'terminal' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Server className="size-3.5" />
          <span>🖥 {t('node.hostTerminal')}</span>
        </button>
      </Card>

      {/* Tab: LXD Containers */}
      <div className={activeTab === 'containers' ? 'block space-y-4' : 'hidden'}>
        {/* Search */}
        <Card className="p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <span>{t('node.lxdContainers', { n: filteredLXDs.length })}</span>
          </h2>
          <Input
            type="text"
            placeholder={t('node.search')}
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
                  <th className="py-3.5 px-4">{t('node.containerName')}</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">{t('node.ipv4')}</th>
                  <th className="py-3.5 px-4">{t('node.ramAllocation')}</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-xs font-sans">
                {filteredLXDs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-12 text-muted-foreground font-mono">
                      {t('node.noContainers')}
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
                          <span className={isRunning ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}>
                            {isRunning ? t('common.running') : item.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-foreground">{item.ipv4 || '—'}</td>
                        <td className="py-3.5 px-4 font-mono text-foreground">{item.ram_used_mb ? `${item.ram_used_mb} MB` : '—'}</td>
                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button variant="ghost" size="icon" onClick={() => navigate(`/lxds/${nodeId}/${item.name}`)} title={t('node.inspectDetail')}>
                              <Sliders className="size-3.5 text-muted-foreground" />
                            </Button>
                            {isRunning ? (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => setActiveTerminalTarget(item)} title={t('node.terminalShell')}>
                                  <Terminal className="size-3.5 text-primary" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleLXDAction('stop', item.name)} disabled={isItemLoading} title="Stop">
                                  {loadingAction === `stop_${item.name}` ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5 text-amber-400" />}
                                </Button>
                              </>
                            ) : (
                              <Button variant="ghost" size="icon" onClick={() => handleLXDAction('start', item.name)} disabled={isItemLoading} title="Start">
                                {loadingAction === `start_${item.name}` ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5 text-emerald-400" />}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => promptDeleteLXD(item.name)} disabled={isItemLoading} title={t('common.delete')}>
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

      {/* Tab: Host Terminal */}
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
                  {t('common.master')}
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

export default NodeLXDsPage;
