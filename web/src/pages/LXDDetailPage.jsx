import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Input, Select } from '../components/ui/primitives';
import { SVGSparklineChart } from '../utils/SVGSparklineChart';
import { EmbeddedTerminal } from '../components/terminal/EmbeddedTerminal';
import { ConfirmDialog } from '../components/modals/ConfirmDialog';
import { ChevronRight, Play, Square, RotateCcw, Trash2, Terminal, Loader2, Save } from 'lucide-react';
import { useI18n } from '../i18n';

export function LXDDetailPage() {
  const { nodeId, lxdName } = useParams();
  const navigate = useNavigate();
  const { nodes, fetchNodes, addToast } = useOutletContext();
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('overview');
  const [loadingAction, setLoadingAction] = useState('');
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: null });

  const targetNode = nodes.find(n => n.id === nodeId) || nodes[0];
  const lxds = targetNode?.lxds || targetNode?.instances || [];
  const lxdItem = lxds.find(i => i.name === lxdName) || {
    name: lxdName,
    status: 'Running',
    ipv4: '10.171.68.45',
    ram_used_mb: 145,
    ram_limit_mb: 2048,
    cpu_cores: 2,
    autostart: true,
    node_name: targetNode?.name || nodeId
  };

  const isRunning = lxdItem.status.toLowerCase() === 'running';
  const isFrozen = lxdItem.status.toLowerCase() === 'frozen';

  const [configForm, setConfigForm] = useState({
    ram_gb: lxdItem.ram_limit_mb ? Math.max(1, Math.round(lxdItem.ram_limit_mb / 1024)) : 2,
    cpu_cores: lxdItem.cpu_cores || 2,
    autostart: lxdItem.autostart !== false
  });

  const [snapConfig, setSnapConfig] = useState({
    enabled: false,
    schedule_cron: '0 0 * * *',
    retention_days: 7
  });
  const [snapshots, setSnapshots] = useState([
    { name: 'snap-backup-init', created_at: '2026-08-09 20:00' }
  ]);
  const [newSnapName, setNewSnapName] = useState('');

  const fetchSnapshotsData = async () => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_snapshots', name: lxdName })
      });
      if (res.ok) {
        const data = await res.json();
        setSnapConfig({
          enabled: !!data.enabled,
          schedule_cron: data.schedule_cron || '0 0 * * *',
          retention_days: data.retention_days || 7
        });
        if (Array.isArray(data.snapshots)) {
          setSnapshots(data.snapshots.map(s => ({
            name: s.name,
            created_at: s.created_at ? new Date(s.created_at).toLocaleString() : 'Recent'
          })));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSnapshotsData();
  }, [nodeId, lxdName]);

  const handleAction = async (action) => {
    setLoadingAction(action);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name: lxdName })
      });
      if (res.ok) {
        addToast('success', t('detail.actionSuccess', { action, name: lxdName }));
        if (action === 'delete') {
          navigate(`/nodes/${nodeId}`);
        } else {
          fetchNodes();
        }
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    } finally {
      setLoadingAction('');
      setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
    }
  };

  const promptDeleteLXD = () => {
    setConfirmModal({
      isOpen: true,
      title: `${t('detail.deleteLxdTitle')} '${lxdName}'`,
      message: t('detail.deleteLxdMsg', { name: lxdName, node: targetNode?.name || nodeId }),
      requireMatchText: lxdName,
      onConfirm: () => handleAction('delete')
    });
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setLoadingAction('save_config');
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_config',
          name: lxdName,
          ram_gb: configForm.ram_gb,
          cpu_cores: configForm.cpu_cores,
          autostart: configForm.autostart
        })
      });
      if (res.ok) {
        addToast('success', t('detail.configSaved', { name: lxdName }));
        fetchNodes();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    } finally {
      setLoadingAction('');
    }
  };

  const handleSaveSnapSchedule = async (e) => {
    e.preventDefault();
    setLoadingAction('save_snap_schedule');
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_snapshot_schedule',
          name: lxdName,
          snap_enabled: snapConfig.enabled,
          snap_cron: snapConfig.schedule_cron,
          retention_days: snapConfig.retention_days
        })
      });
      if (res.ok) {
        addToast('success', t('detail.scheduleSaved', { name: lxdName }));
        fetchSnapshotsData();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    } finally {
      setLoadingAction('');
    }
  };

  const handleCreateSnapshot = async (e) => {
    e.preventDefault();
    const snapName = newSnapName.trim() || `snap-${Date.now().toString().slice(-6)}`;
    setLoadingAction('create_snapshot');
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_snapshot', name: lxdName, snap_name: snapName })
      });
      if (res.ok) {
        addToast('success', t('detail.snapshotCreated', { name: snapName }));
        setNewSnapName('');
        fetchSnapshotsData();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    } finally {
      setLoadingAction('');
    }
  };

  const handleRestoreSnapshot = async (snapName) => {
    setLoadingAction(`restore_${snapName}`);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore_snapshot', name: lxdName, snap_name: snapName })
      });
      if (res.ok) {
        addToast('success', t('detail.restored', { name: lxdName, snap: snapName }));
        fetchNodes();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    } finally {
      setLoadingAction('');
      setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
    }
  };

  const promptRestoreSnapshot = (snapName) => {
    setConfirmModal({
      isOpen: true,
      title: `${t('detail.restoreTitle')} '${snapName}'`,
      message: t('detail.restoreMsg', { container: lxdName, name: snapName }),
      onConfirm: () => handleRestoreSnapshot(snapName)
    });
  };

  const handleDeleteSnapshot = async (snapName) => {
    setLoadingAction(`delete_${snapName}`);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_snapshot', name: lxdName, snap_name: snapName })
      });
      if (res.ok) {
        addToast('success', t('detail.snapshotDeleted', { name: snapName }));
        fetchSnapshotsData();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    } finally {
      setLoadingAction('');
      setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
    }
  };

  const promptDeleteSnapshot = (snapName) => {
    setConfirmModal({
      isOpen: true,
      title: `${t('detail.snapDeleteTitle')} '${snapName}'`,
      message: t('detail.snapDeleteMsg', { name: snapName, container: lxdName }),
      onConfirm: () => handleDeleteSnapshot(snapName)
    });
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
            <span className="cursor-pointer hover:underline text-primary" onClick={() => navigate('/nodes')}>
              {t('detail.breadcrumbNodes')}
            </span>
            <ChevronRight className="size-3" />
            <span className="cursor-pointer hover:underline text-primary" onClick={() => navigate(`/nodes/${nodeId}`)}>
              {targetNode?.name || nodeId}
            </span>
            <ChevronRight className="size-3" />
            <span className="text-foreground font-semibold">{lxdName}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : isFrozen ? 'bg-amber-400' : 'bg-muted-foreground'}`}></span>
              <span>{lxdName}</span>
            </h1>
            <Badge variant={isRunning ? 'success' : isFrozen ? 'warning' : 'secondary'} className="text-[10px]">
              {lxdItem.status.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isRunning ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 sm:px-3 text-xs"
                onClick={() => handleAction('stop')}
                disabled={!!loadingAction}
                title="Stop Container"
              >
                {loadingAction === 'stop' ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5 text-amber-400 sm:mr-1.5" />}
                <span className="hidden sm:inline">{t('detail.stop')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 sm:px-3 text-xs"
                onClick={() => handleAction('restart')}
                disabled={!!loadingAction}
                title="Restart Container"
              >
                {loadingAction === 'restart' ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5 text-cyan-400 sm:mr-1.5" />}
                <span className="hidden sm:inline">{t('detail.restart')}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 sm:px-3 text-xs"
                onClick={() => handleAction('pause')}
                disabled={!!loadingAction}
                title="Freeze/Pause Container"
              >
                {loadingAction === 'pause' ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5 text-purple-400 sm:mr-1.5" />}
                <span className="hidden sm:inline">{t('detail.freeze')}</span>
              </Button>
            </>
          ) : isFrozen ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 sm:px-3 text-xs"
              onClick={() => handleAction('resume')}
              disabled={!!loadingAction}
            >
              {loadingAction === 'resume' ? <Loader2 className="size-3.5 animate-spin text-emerald-400" /> : <Play className="size-3.5 text-emerald-400 sm:mr-1.5" />}
              <span className="hidden sm:inline">{t('detail.resume')}</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 sm:px-3 text-xs"
              onClick={() => handleAction('start')}
              disabled={!!loadingAction}
            >
              {loadingAction === 'start' ? <Loader2 className="size-3.5 animate-spin text-emerald-400" /> : <Play className="size-3.5 text-emerald-400 sm:mr-1.5" />}
              <span className="hidden sm:inline">{t('detail.start')}</span>
            </Button>
          )}

          <Button
            variant="destructive"
            size="sm"
            className="h-8 px-2.5 sm:px-3 text-xs"
            onClick={promptDeleteLXD}
            disabled={!!loadingAction}
            title="Delete Container"
          >
            {loadingAction === 'delete' ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5 sm:mr-1.5" />}
            <span className="hidden sm:inline">{t('detail.delete')}</span>
          </Button>
        </div>
      </div>

      {/* Tabs Navigation Header */}
      <Card className="p-1 flex border-border bg-card font-medium text-xs overflow-x-auto scrollbar-none gap-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2.5 px-3 rounded-md transition font-medium text-center whitespace-nowrap shrink-0 ${activeTab === 'overview' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          📊 {t('detail.tabOverview')}
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-2.5 px-3 rounded-md transition font-medium text-center whitespace-nowrap shrink-0 ${activeTab === 'config' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          ⚙️ {t('detail.tabConfig')}
        </button>
        <button
          onClick={() => setActiveTab('snapshots')}
          className={`flex-1 py-2.5 px-3 rounded-md transition font-medium text-center whitespace-nowrap shrink-0 ${activeTab === 'snapshots' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          📸 {t('detail.tabSnapshots', { n: snapshots.length })}
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex-1 py-2.5 px-3 rounded-md transition font-medium text-center whitespace-nowrap shrink-0 ${activeTab === 'terminal' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          🖥 {t('detail.tabTerminal')}
        </button>
      </Card>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t('detail.ipv4')}</p>
              <p className="text-xl font-bold font-mono text-foreground">{lxdItem.ipv4 || '—'}</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t('detail.ramLimit')}</p>
              <p className="text-xl font-bold font-mono text-purple-400">{lxdItem.ram_limit_mb || 2048} MB</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t('detail.cpuAllocation')}</p>
              <p className="text-xl font-bold font-mono text-amber-400">{lxdItem.cpu_cores || 2} Cores</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t('detail.autostart')}</p>
              <p className="text-xl font-bold font-mono text-emerald-400">{configForm.autostart ? t('common.enabled') : t('common.disabled')}</p>
            </Card>
          </div>

          {/* Creation Specs & OS Environment Metadata Card */}
          <Card className="p-5 space-y-4">
            <div className="border-b border-border pb-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>📦 {t('detail.specsTitle')}</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('detail.specsDesc')}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.baseImage')}</span>
                <p className="text-foreground font-bold truncate" title={lxdItem.os_image || 'ubuntu:24.04'}>
                  {lxdItem.os_image || 'ubuntu:24.04'}
                </p>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.architecture')}</span>
                <p className="text-foreground font-bold">{lxdItem.os_architecture || 'x86_64'}</p>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.diskQuota')}</span>
                <p className="text-foreground font-bold">{lxdItem.disk_gb ? `${lxdItem.disk_gb} GB` : 'Dynamic / Pool'}</p>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.storagePool')}</span>
                <p className="text-foreground font-bold">{lxdItem.storage_pool || 'default'}</p>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.networkBridge')}</span>
                <p className="text-foreground font-bold">{lxdItem.network || 'lxdbr0'}</p>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.preset')}</span>
                <p className="text-primary font-bold capitalize">{lxdItem.template_preset || 'Standard Base'}</p>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.timezone')}</span>
                <p className="text-foreground font-bold">{lxdItem.timezone || 'UTC'}</p>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.nesting')}</span>
                <p className="text-emerald-400 font-bold">{lxdItem.nesting !== false ? 'Enabled' : 'Disabled'}</p>
              </div>

              <div className="p-3 bg-secondary/30 rounded-lg border border-border space-y-1">
                <span className="text-[11px] text-muted-foreground uppercase">{t('detail.createdAt')}</span>
                <p className="text-foreground font-bold">
                  {lxdItem.created_at ? new Date(lxdItem.created_at).toLocaleString() : 'Recent'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">{t('detail.telemetry')}</h3>
            <SVGSparklineChart points={[12, 18, 25, 20, 32, 28, 35]} color="#a855f7" max={100} height={120} />
          </Card>
        </div>
      )}

      {/* Tab 2: Configuration */}
      {activeTab === 'config' && (
        <Card className="p-6 max-w-xl space-y-4">
          <h3 className="text-sm font-bold text-foreground">{t('detail.updateConfig')}</h3>
          <form onSubmit={handleSaveConfig} className="space-y-4 text-xs font-sans">
            <div>
              <label className="block text-muted-foreground mb-1">{t('detail.ramLabel')}</label>
              <Input
                type="number"
                min="1"
                max="64"
                value={configForm.ram_gb}
                onChange={e => setConfigForm({ ...configForm, ram_gb: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1">{t('detail.cpuLabel')}</label>
              <Input
                type="number"
                min="1"
                max="32"
                value={configForm.cpu_cores}
                onChange={e => setConfigForm({ ...configForm, cpu_cores: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="autostart_chk"
                checked={configForm.autostart}
                onChange={e => setConfigForm({ ...configForm, autostart: e.target.checked })}
                className="accent-primary"
              />
              <label htmlFor="autostart_chk" className="text-xs text-foreground cursor-pointer font-medium">
                {t('detail.autostartLabel')}
              </label>
            </div>
            <Button type="submit" disabled={loadingAction === 'save_config'}>
              {loadingAction === 'save_config' && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
              <span>{loadingAction === 'save_config' ? t('detail.saving') : t('detail.saveConfig')}</span>
            </Button>
          </form>
        </Card>
      )}

      {/* Tab 3: Automated Snapshots Schedule & Easy Restore */}
      {activeTab === 'snapshots' && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <RotateCcw className="size-4 text-primary" />
                  <span>{t('detail.snapSchedule')}</span>
                </h3>
                <p className="text-xs text-muted-foreground">{t('detail.snapScheduleDesc')}</p>
              </div>
              <Badge variant={snapConfig.enabled ? 'success' : 'outline'}>
                {snapConfig.enabled ? t('detail.scheduleActive') : t('detail.scheduleDisabled')}
              </Badge>
            </div>

            <form onSubmit={handleSaveSnapSchedule} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans items-end">
              <div className="space-y-1">
                <label className="block text-foreground font-medium">{t('detail.snapAuto')}</label>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="chk_snap_sched_enable"
                    checked={snapConfig.enabled}
                    onChange={e => setSnapConfig({ ...snapConfig, enabled: e.target.checked })}
                    className="accent-primary size-4"
                  />
                  <label htmlFor="chk_snap_sched_enable" className="text-xs text-foreground cursor-pointer font-bold">
                    {t('detail.enableSchedule')}
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-foreground font-medium">{t('detail.snapFreq')}</label>
                <Select
                  value={snapConfig.schedule_cron}
                  onChange={e => setSnapConfig({ ...snapConfig, schedule_cron: e.target.value })}
                  disabled={!snapConfig.enabled}
                >
                  <option value="0 * * * *">⏱️ {t('detail.hourly')}</option>
                  <option value="0 0 * * *">🌙 {t('detail.daily')}</option>
                  <option value="0 0 * * 0">📅 {t('detail.weekly')}</option>
                  <option value="0 0 1 * *">🗓️ {t('detail.monthly')}</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-foreground font-medium">{t('detail.snapRetention')}</label>
                <Select
                  value={snapConfig.retention_days}
                  onChange={e => setSnapConfig({ ...snapConfig, retention_days: parseInt(e.target.value) || 7 })}
                  disabled={!snapConfig.enabled}
                >
                  <option value={3}>{t('detail.retention3')}</option>
                  <option value={7}>{t('detail.retention7')}</option>
                  <option value={14}>{t('detail.retention14')}</option>
                  <option value={30}>{t('detail.retention30')}</option>
                </Select>
              </div>

              <div className="sm:col-span-3 pt-2 flex justify-end">
                <Button type="submit" disabled={loadingAction === 'save_snap_schedule'}>
                  {loadingAction === 'save_snap_schedule' ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Save className="size-3.5 mr-1.5" />}
                  <span>{loadingAction === 'save_snap_schedule' ? t('detail.saving') : t('detail.saveSchedule')}</span>
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">{t('detail.manualSnapshot')}</h3>
                <p className="text-xs text-muted-foreground">{t('detail.manualSnapshotDesc')}</p>
              </div>

              <form onSubmit={handleCreateSnapshot} className="flex gap-2 w-full sm:w-auto">
                <Input
                  type="text"
                  placeholder={t('detail.snapPlaceholder')}
                  value={newSnapName}
                  onChange={e => setNewSnapName(e.target.value)}
                  className="w-48 text-xs font-mono"
                />
                <Button type="submit" size="sm" disabled={loadingAction === 'create_snapshot'}>
                  {loadingAction === 'create_snapshot' && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                  <span>{loadingAction === 'create_snapshot' ? t('detail.snapCreating') : `📸 ${t('detail.snapNow')}`}</span>
                </Button>
              </form>
            </div>

            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">
                {t('detail.snapList', { n: snapshots.length })}
              </h4>

              {snapshots.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono text-muted-foreground border border-dashed border-border rounded-lg">
                  {t('detail.noSnapshots')}
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
                  {snapshots.map((s, i) => (
                    <div key={i} className="p-3.5 bg-card hover:bg-accent/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
                      <div className="space-y-0.5">
                        <p className="text-foreground font-bold flex items-center gap-2">
                          <span>📸 {s.name}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">{t('detail.snapCreated', { date: s.created_at })}</p>
                      </div>

                      <div className="flex items-center gap-2 font-sans shrink-0">
                        <Button size="sm" variant="outline" onClick={() => promptRestoreSnapshot(s.name)} disabled={!!loadingAction}>
                          {loadingAction === `restore_${s.name}` ? <Loader2 className="size-3.5 animate-spin text-emerald-400 mr-1.5" /> : <RotateCcw className="size-3.5 text-emerald-400 mr-1.5" />}
                          <span>{loadingAction === `restore_${s.name}` ? 'Restoring...' : t('detail.restore')}</span>
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => promptDeleteSnapshot(s.name)} disabled={!!loadingAction}>
                          {loadingAction === `delete_${s.name}` ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : <Trash2 className="size-3.5 mr-1.5" />}
                          <span>{loadingAction === `delete_${s.name}` ? 'Deleting...' : t('common.delete')}</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Terminal Shell Console (Persisted in DOM for continuous PTY session) */}
      <div className={activeTab === 'terminal' ? 'block' : 'hidden'}>
        <Card className="h-[550px] overflow-hidden flex flex-col border-border">
          <div className="bg-background px-4 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-primary" />
              <span className="font-mono text-xs text-foreground font-bold">{lxdName}</span>
              <span className="text-[10px] font-mono text-muted-foreground">({targetNode?.name || nodeId})</span>
            </div>
          </div>
          <EmbeddedTerminal name={lxdName} nodeId={nodeId} />
        </Card>
      </div>

      {/* Confirmation Modal */}
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

export default LXDDetailPage;
