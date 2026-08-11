import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Select, Input } from '../components/ui/primitives';
import { Globe, Sliders, Server, Save, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function SettingsPage() {
  const { addToast } = useOutletContext();
  const [activeTab, setActiveTab] = useState('timezone');
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState({
    master_public_url: window.location.origin,
    global_timezone: 'Asia/Jakarta',
    default_ram_gb: '2',
    default_cpu_cores: '2',
    default_disk_gb: '20'
  });

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({
          ...prev,
          ...data,
          master_public_url: data.master_public_url || window.location.origin
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const currentOrigin = window.location.origin;
  const isDomainMatching = !settings.master_public_url ||
    settings.master_public_url.replace(/\/$/, '') === currentOrigin.replace(/\/$/, '');

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        addToast('success', 'Konfigurasi global kluster Space LXD berhasil disimpan!');
        fetchSettings();
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const timezoneOptions = [
    { value: 'Asia/Jakarta', label: '🇮🇩 Asia/Jakarta (WIB - UTC+7)' },
    { value: 'Asia/Makassar', label: '🇮🇩 Asia/Makassar (WITA - UTC+8)' },
    { value: 'Asia/Jayapura', label: '🇮🇩 Asia/Jayapura (WIT - UTC+9)' },
    { value: 'Asia/Singapore', label: '🇸🇬 Asia/Singapore (SGT - UTC+8)' },
    { value: 'Asia/Tokyo', label: '🇯🇵 Asia/Tokyo (JST - UTC+9)' },
    { value: 'UTC', label: '🌐 UTC (Coordinated Universal Time)' },
    { value: 'Europe/London', label: '🇬🇧 Europe/London (GMT/BST)' },
    { value: 'America/New_York', label: '🇺🇸 America/New_York (EST - UTC-5)' },
    { value: 'America/Los_Angeles', label: '🇺🇸 America/Los_Angeles (PST - UTC-8)' }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-3">
          <span>Global Cluster Settings</span>
          <Badge variant="success">Engine Online</Badge>
        </h1>
        <p className="text-xs text-muted-foreground">Pengaturan sistem global kluster Space LXD, endpoint master, timezone, dan alokasi resource bawaan</p>
      </div>

      {/* Domain Match Warning Banner */}
      {!isDomainMatching && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs flex items-start gap-3 shadow-md">
          <AlertTriangle className="size-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-200">⚠️ Perhatian: Terdeteksi Akses Domain Tidak Sesuai (Domain Mismatch)</p>
            <p className="text-[11px] text-amber-300/80 font-sans">
              Dashboard ini sedang diakses melalui URL <span className="font-mono font-bold underline">{currentOrigin}</span>, namun <strong>Master Public Endpoint URL</strong> diatur ke <span className="font-mono font-bold underline">{settings.master_public_url}</span>.
            </p>
            <div className="pt-1 flex items-center gap-2 font-sans">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-amber-500/40 hover:bg-amber-500/20 text-amber-200"
                onClick={() => setSettings({ ...settings, master_public_url: currentOrigin })}
              >
                Gunakan URL Saat Ini ({currentOrigin})
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Vertical Tabs Layout Structure */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
        {/* Left Vertical Tabs Navigation */}
        <Card className="p-2 space-y-1 font-sans text-xs">
          <button
            onClick={() => setActiveTab('system')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-all ${
              activeTab === 'system'
                ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            <Server className="size-4 shrink-0 text-cyan-400" />
            <span>Master Public Endpoint</span>
          </button>

          <button
            onClick={() => setActiveTab('timezone')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md font-medium text-left transition-all ${
              activeTab === 'timezone'
                ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            <Globe className="size-4 shrink-0 text-primary" />
            <span>Timezone & Region</span>
          </button>

          <button
            onClick={() => setActiveTab('resources')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-all ${
              activeTab === 'resources'
                ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            <Sliders className="size-4 shrink-0 text-amber-400" />
            <span>Default LXD Resources</span>
          </button>
        </Card>

        {/* Right Tab Content Panel */}
        <div className="md:col-span-3">
          {/* TAB 1: MASTER PUBLIC ENDPOINT & DOMAIN CHECKER */}
          {activeTab === 'system' && (
            <Card className="p-6 space-y-5">
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Server className="size-5 text-cyan-400" />
                  <span>Master Public Endpoint & Domain Validation</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Alamat URL publik Master Control Plane yang digunakan oleh Worker Node dan skrip pendaftaran otomatis.
                </p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-5 text-xs font-sans">
                <div className="space-y-1.5 max-w-lg">
                  <label className="block text-foreground font-semibold">Master Public Endpoint URL</label>
                  <Input
                    type="url"
                    placeholder="https://lxd.yourdomain.com atau http://192.168.1.100:9090"
                    value={settings.master_public_url}
                    onChange={e => setSettings({ ...settings, master_public_url: e.target.value })}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Format: <span className="font-mono text-primary font-bold">http://DOMAIN_ATAU_IP:PORT</span> (tanpa trailing slash)
                  </p>
                </div>

                {/* Live Domain Validation Card */}
                <div className={`p-4 rounded-lg border font-mono text-xs space-y-2 ${isDomainMatching ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
                  <div className="flex items-center gap-2">
                    {isDomainMatching ? (
                      <>
                        <CheckCircle2 className="size-4 text-emerald-400" />
                        <span className="font-bold text-emerald-200">Domain Verification Success</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-4 text-amber-400" />
                        <span className="font-bold text-amber-200">Domain Mismatch Warning</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] font-sans opacity-90">
                    {isDomainMatching
                      ? `Dashboard saat ini diakses melalui domain sah '${currentOrigin}' yang 100% cocok dengan Master Endpoint!`
                      : `Dashboard diakses melalui '${currentOrigin}', padahal Master Endpoint terdaftar sebagai '${settings.master_public_url}'.`}
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={loading}>
                    <Save className="size-4" data-icon="inline-start" />
                    <span>Simpan Master Endpoint URL</span>
                  </Button>
                </div>
              </form>

              {/* System Architecture Info */}
              <div className="pt-4 border-t border-border space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase font-mono tracking-wider">System Architecture Info</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
                  <div className="p-3 bg-background rounded-lg border border-border space-y-1">
                    <p className="text-[11px] text-muted-foreground uppercase">Database Storage Engine</p>
                    <p className="text-sm font-bold text-emerald-400">SQLite 3 (PRAGMA WAL Mode Active)</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg border border-border space-y-1">
                    <p className="text-[11px] text-muted-foreground uppercase">Agent Tunnel Communication</p>
                    <p className="text-sm font-bold text-cyan-400">Bidirectional WebSocket RPC</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 2: TIMEZONE & REGION CONFIGURATION */}
          {activeTab === 'timezone' && (
            <Card className="p-6 space-y-5">
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Globe className="size-5 text-primary" />
                  <span>Global Timezone Configuration</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  Konfigurasi timezone global kluster. Setiap container LXD baru yang dibuat di node mana pun akan otomatis mewarisi timezone ini (`environment.TZ`).
                </p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-5 text-xs font-sans">
                <div className="space-y-1.5 max-w-md">
                  <label className="block text-foreground font-semibold">Pilih Timezone Global Kluster</label>
                  <Select
                    value={settings.global_timezone}
                    onChange={e => setSettings({ ...settings, global_timezone: e.target.value })}
                  >
                    {timezoneOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Timezone aktif saat ini: <span className="font-mono text-primary font-bold">{settings.global_timezone}</span>
                  </p>
                </div>

                <div className="p-4 bg-background border border-border rounded-lg space-y-2 font-mono text-xs">
                  <p className="text-foreground font-bold flex items-center gap-2">
                    <span>💡 Efek Pengaturan Timezone:</span>
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 font-sans text-[11px]">
                    <li>Disuntikkan ke variabel lingkungan container: <span className="font-mono text-primary">environment.TZ={settings.global_timezone}</span>.</li>
                    <li>Disuntikkan ke konfigurasi Cloud-Init: <span className="font-mono text-primary">timezone: {settings.global_timezone}</span>.</li>
                    <li>Mengkoreksi otomatis file <span className="font-mono text-foreground">/etc/localtime</span> & <span className="font-mono text-foreground">/etc/timezone</span> di dalam container.</li>
                  </ul>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={loading}>
                    <Save className="size-4" data-icon="inline-start" />
                    <span>Simpan Konfigurasi Timezone</span>
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 3: DEFAULT CONTAINER RESOURCES */}
          {activeTab === 'resources' && (
            <Card className="p-6 space-y-5">
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Sliders className="size-5 text-amber-400" />
                  <span>Default LXD Resource Allocation</span>
                </h2>
                <p className="text-xs text-muted-foreground">Tentukan alokasi resource bawaan saat membuka Wizard Pembuatan Container LXD Baru</p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4 text-xs font-sans max-w-md">
                <div>
                  <label className="block text-foreground font-medium mb-1">Default RAM Memory Limit</label>
                  <Select
                    value={settings.default_ram_gb}
                    onChange={e => setSettings({ ...settings, default_ram_gb: e.target.value })}
                  >
                    <option value="1">1 GB RAM</option>
                    <option value="2">2 GB RAM (Rekomendasi Standar)</option>
                    <option value="4">4 GB RAM</option>
                    <option value="8">8 GB RAM</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-foreground font-medium mb-1">Default CPU Cores Allowance</label>
                  <Select
                    value={settings.default_cpu_cores}
                    onChange={e => setSettings({ ...settings, default_cpu_cores: e.target.value })}
                  >
                    <option value="1">1 Core CPU</option>
                    <option value="2">2 Cores CPU (Rekomendasi Standar)</option>
                    <option value="4">4 Cores CPU</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-foreground font-medium mb-1">Default Disk Storage Quota</label>
                  <Select
                    value={settings.default_disk_gb}
                    onChange={e => setSettings({ ...settings, default_disk_gb: e.target.value })}
                  >
                    <option value="10">10 GB Storage</option>
                    <option value="20">20 GB Storage (Rekomendasi Standar)</option>
                    <option value="50">50 GB Storage</option>
                    <option value="100">100 GB Storage</option>
                  </Select>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={loading}>
                    <Save className="size-4" data-icon="inline-start" />
                    <span>Simpan Resource Defaults</span>
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
