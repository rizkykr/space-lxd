import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Input, Select } from '../components/ui/primitives';
import { SVGSparklineChart } from '../utils/SVGSparklineChart';
import { EmbeddedTerminal } from '../components/terminal/EmbeddedTerminal';
import { ConfirmDialog } from '../components/modals/ConfirmDialog';
import { ChevronRight, Play, Square, RotateCcw, Trash2, Terminal, Loader2, Save } from 'lucide-react';

export function LXDDetailPage() {
  const { nodeId, lxdName } = useParams();
  const navigate = useNavigate();
  const { nodes, fetchNodes, addToast } = useOutletContext();
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
            created_at: s.created_at ? new Date(s.created_at).toLocaleString() : 'Baru saja'
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
        addToast('success', `Aksi '${action}' berhasil dieksekusi untuk ${lxdName}`);
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
      title: `Hapus LXD Container '${lxdName}'`,
      message: `Apakah Anda yakin ingin menghapus LXD Container '${lxdName}' di Node ${targetNode?.name || nodeId}? Semua file, data, dan snapshot di dalam container ini akan dihapus secara permanen.`,
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
        addToast('success', `Konfigurasi container '${lxdName}' berhasil diperbarui!`);
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
        addToast('success', `Jadwal snapshot container '${lxdName}' berhasil disimpan!`);
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
        addToast('success', `Snapshot '${snapName}' berhasil dibuat!`);
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
        addToast('success', `Container '${lxdName}' berhasil di-restore ke snapshot '${snapName}'!`);
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
      title: `Restore Snapshot '${snapName}'`,
      message: `Apakah Anda yakin ingin mengembalikan kondisi container '${lxdName}' ke Snapshot '${snapName}'? Seluruh perubahan data yang dibuat setelah tanggal snapshot ini diciptakan akan hilang!`,
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
        addToast('success', `Snapshot '${snapName}' telah dihapus.`);
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
      title: `Hapus Snapshot '${snapName}'`,
      message: `Apakah Anda yakin ingin menghapus snapshot '${snapName}' milik container '${lxdName}'?`,
      onConfirm: () => handleDeleteSnapshot(snapName)
    });
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground mb-1">
            <span className="cursor-pointer hover:underline text-primary" onClick={() => navigate('/nodes')}>Node Servers</span>
            <ChevronRight className="size-3" />
            <span className="cursor-pointer hover:underline text-primary" onClick={() => navigate(`/nodes/${nodeId}`)}>Node: {targetNode?.name || nodeId}</span>
            <ChevronRight className="size-3" />
            <span className="text-foreground font-bold">{lxdName}</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-3">
            <span>{lxdName}</span>
            <Badge variant={isRunning ? 'success' : isFrozen ? 'warning' : 'secondary'}>
              {lxdItem.status.toUpperCase()}
            </Badge>
            <Badge variant="info">LXC Container</Badge>
          </h1>
        </div>

        {/* Action Toolbar with Loading Spinners */}
        <div className="flex flex-wrap items-center gap-2">
          {isRunning ? (
            <>
              <Button variant="outline" onClick={() => handleAction('stop')} disabled={!!loadingAction}>
                {loadingAction === 'stop' ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Square className="size-3.5 text-amber-400" data-icon="inline-start" />}
                <span>{loadingAction === 'stop' ? 'Stopping...' : 'Stop'}</span>
              </Button>
              <Button variant="outline" onClick={() => handleAction('restart')} disabled={!!loadingAction}>
                {loadingAction === 'restart' ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <RotateCcw className="size-3.5 text-cyan-400" data-icon="inline-start" />}
                <span>{loadingAction === 'restart' ? 'Restarting...' : 'Restart'}</span>
              </Button>
              <Button variant="outline" onClick={() => handleAction('pause')} disabled={!!loadingAction}>
                {loadingAction === 'pause' ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Square className="size-3.5 text-purple-400" data-icon="inline-start" />}
                <span>{loadingAction === 'pause' ? 'Freezing...' : 'Freeze / Pause'}</span>
              </Button>
            </>
          ) : isFrozen ? (
            <Button variant="outline" onClick={() => handleAction('resume')} disabled={!!loadingAction}>
              {loadingAction === 'resume' ? <Loader2 className="size-3.5 animate-spin text-emerald-400" data-icon="inline-start" /> : <Play className="size-3.5 text-emerald-400" data-icon="inline-start" />}
              <span>{loadingAction === 'resume' ? 'Resuming...' : 'Unfreeze / Resume'}</span>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => handleAction('start')} disabled={!!loadingAction}>
              {loadingAction === 'start' ? <Loader2 className="size-3.5 animate-spin text-emerald-400" data-icon="inline-start" /> : <Play className="size-3.5 text-emerald-400" data-icon="inline-start" />}
              <span>{loadingAction === 'start' ? 'Starting...' : 'Start'}</span>
            </Button>
          )}

          <Button variant="destructive" onClick={promptDeleteLXD} disabled={!!loadingAction}>
            {loadingAction === 'delete' ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Trash2 className="size-3.5" data-icon="inline-start" />}
            <span>{loadingAction === 'delete' ? 'Deleting...' : 'Delete'}</span>
          </Button>
        </div>
      </div>

      {/* Tabs Navigation Header */}
      <Card className="p-1 flex border-border bg-card font-medium text-xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2.5 rounded-md transition font-medium text-center ${activeTab === 'overview' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          📊 Overview & Telemetry
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`flex-1 py-2.5 rounded-md transition font-medium text-center ${activeTab === 'config' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          ⚙️ Configuration & Limits
        </button>
        <button
          onClick={() => setActiveTab('snapshots')}
          className={`flex-1 py-2.5 rounded-md transition font-medium text-center ${activeTab === 'snapshots' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          📸 Snapshots ({snapshots.length})
        </button>
        <button
          onClick={() => setActiveTab('terminal')}
          className={`flex-1 py-2.5 rounded-md transition font-medium text-center ${activeTab === 'terminal' ? 'bg-secondary text-secondary-foreground shadow-sm font-bold' : 'text-muted-foreground hover:text-foreground'}`}
        >
          🖥 Terminal Shell Console
        </button>
      </Card>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">IPv4 Address</p>
              <p className="text-xl font-bold font-mono text-foreground">{lxdItem.ipv4 || '—'}</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">RAM Memory Limit</p>
              <p className="text-xl font-bold font-mono text-purple-400">{lxdItem.ram_limit_mb || 2048} MB</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">CPU Allocation</p>
              <p className="text-xl font-bold font-mono text-amber-400">{lxdItem.cpu_cores || 2} Cores</p>
            </Card>
            <Card className="p-4 space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">Autostart Boot</p>
              <p className="text-xl font-bold font-mono text-emerald-400">{configForm.autostart ? 'Enabled' : 'Disabled'}</p>
            </Card>
          </div>

          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">Realtime Telemetry Chart</h3>
            <SVGSparklineChart points={[12, 18, 25, 20, 32, 28, 35]} color="#a855f7" max={100} height={120} />
          </Card>
        </div>
      )}

      {/* Tab 2: Configuration */}
      {activeTab === 'config' && (
        <Card className="p-6 max-w-xl space-y-4">
          <h3 className="text-sm font-bold text-foreground">Update Container Resource Limits</h3>
          <form onSubmit={handleSaveConfig} className="space-y-4 text-xs font-sans">
            <div>
              <label className="block text-muted-foreground mb-1">RAM Memory Limit (GB)</label>
              <Input
                type="number"
                min="1"
                max="64"
                value={configForm.ram_gb}
                onChange={e => setConfigForm({ ...configForm, ram_gb: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <label className="block text-muted-foreground mb-1">CPU Cores Allowance</label>
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
                Boot Autostart (Otomatis nyalakan saat host server restart)
              </label>
            </div>
            <Button type="submit" disabled={loadingAction === 'save_config'}>
              {loadingAction === 'save_config' && <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />}
              <span>{loadingAction === 'save_config' ? 'Menyimpan...' : 'Simpan Konfigurasi Container'}</span>
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
                  <span>Automated Scheduled Snapshots Configuration</span>
                </h3>
                <p className="text-xs text-muted-foreground">Aktifkan pembackupan snapshot otomatis berkala dengan retensi waktu terukur</p>
              </div>
              <Badge variant={snapConfig.enabled ? 'success' : 'outline'}>
                {snapConfig.enabled ? 'SCHEDULE ACTIVE' : 'SCHEDULE DISABLED'}
              </Badge>
            </div>

            <form onSubmit={handleSaveSnapSchedule} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans items-end">
              <div className="space-y-1">
                <label className="block text-foreground font-medium">Status Otomatisasi</label>
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="chk_snap_sched_enable"
                    checked={snapConfig.enabled}
                    onChange={e => setSnapConfig({ ...snapConfig, enabled: e.target.checked })}
                    className="accent-primary size-4"
                  />
                  <label htmlFor="chk_snap_sched_enable" className="text-xs text-foreground cursor-pointer font-bold">
                    Enable Snapshot Schedule
                  </label>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-foreground font-medium">Frekuensi Backup (Cron Schedule)</label>
                <Select
                  value={snapConfig.schedule_cron}
                  onChange={e => setSnapConfig({ ...snapConfig, schedule_cron: e.target.value })}
                  disabled={!snapConfig.enabled}
                >
                  <option value="0 * * * *">⏱️ Setiap Jam (Hourly)</option>
                  <option value="0 0 * * *">🌙 Setiap Hari (Daily at 00:00)</option>
                  <option value="0 0 * * 0">📅 Setiap Minggu (Weekly on Sunday)</option>
                  <option value="0 0 1 * *">🗓️ Setiap Bulan (Monthly 1st)</option>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="block text-foreground font-medium">Masa Simpan (Retention Expiry)</label>
                <Select
                  value={snapConfig.retention_days}
                  onChange={e => setSnapConfig({ ...snapConfig, retention_days: parseInt(e.target.value) || 7 })}
                  disabled={!snapConfig.enabled}
                >
                  <option value={3}>3 Hari (Hapus otomatis setelah 3 hari)</option>
                  <option value={7}>7 Hari (Hapus otomatis setelah 1 minggu)</option>
                  <option value={14}>14 Hari (Hapus otomatis setelah 2 minggu)</option>
                  <option value={30}>30 Hari (Hapus otomatis setelah 1 bulan)</option>
                </Select>
              </div>

              <div className="sm:col-span-3 pt-2 flex justify-end">
                <Button type="submit" disabled={loadingAction === 'save_snap_schedule'}>
                  {loadingAction === 'save_snap_schedule' ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Save className="size-3.5" data-icon="inline-start" />}
                  <span>{loadingAction === 'save_snap_schedule' ? 'Menyimpan...' : 'Simpan Pengaturan Jadwal Snapshot'}</span>
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-foreground">Manual Instant Snapshot & Restoration</h3>
                <p className="text-xs text-muted-foreground">Buat snapshot instan sewaktu-waktu atau restore kondisi container dengan 1 klik</p>
              </div>

              <form onSubmit={handleCreateSnapshot} className="flex gap-2 w-full sm:w-auto">
                <Input
                  type="text"
                  placeholder="Nama snapshot (misal: pre-update-v1)"
                  value={newSnapName}
                  onChange={e => setNewSnapName(e.target.value)}
                  className="w-48 text-xs font-mono"
                />
                <Button type="submit" size="sm" disabled={loadingAction === 'create_snapshot'}>
                  {loadingAction === 'create_snapshot' && <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />}
                  <span>{loadingAction === 'create_snapshot' ? 'Membuat...' : '📸 Take Snapshot Now'}</span>
                </Button>
              </form>
            </div>

            <div className="space-y-2 pt-1">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">
                Daftar Snapshot Container ({snapshots.length})
              </h4>

              {snapshots.length === 0 ? (
                <div className="p-8 text-center text-xs font-mono text-muted-foreground border border-dashed border-border rounded-lg">
                  Belum ada snapshot yang tersimpan. Klik 'Take Snapshot Now' di atas untuk membuat backup instan.
                </div>
              ) : (
                <div className="divide-y divide-border border border-border rounded-md overflow-hidden">
                  {snapshots.map((s, i) => (
                    <div key={i} className="p-3.5 bg-card hover:bg-accent/40 transition flex items-center justify-between font-mono text-xs">
                      <div className="space-y-0.5">
                        <p className="text-foreground font-bold flex items-center gap-2">
                          <span>📸 {s.name}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">Dibuat pada: {s.created_at}</p>
                      </div>

                      <div className="flex items-center gap-2 font-sans">
                        <Button size="sm" variant="outline" onClick={() => promptRestoreSnapshot(s.name)} disabled={!!loadingAction}>
                          {loadingAction === `restore_${s.name}` ? <Loader2 className="size-3.5 animate-spin text-emerald-400" data-icon="inline-start" /> : <RotateCcw className="size-3.5 text-emerald-400" data-icon="inline-start" />}
                          <span>{loadingAction === `restore_${s.name}` ? 'Restoring...' : 'Restore'}</span>
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => promptDeleteSnapshot(s.name)} disabled={!!loadingAction}>
                          {loadingAction === `delete_${s.name}` ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Trash2 className="size-3.5" data-icon="inline-start" />}
                          <span>{loadingAction === `delete_${s.name}` ? 'Deleting...' : 'Delete'}</span>
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

      {/* Custom Shadcn Confirmation Modal */}
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
