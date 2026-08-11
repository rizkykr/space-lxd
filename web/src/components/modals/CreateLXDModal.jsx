import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Input, Select } from '../ui/primitives';
import {
  Sparkles, ChevronRight, Check, X, Loader2, CheckCircle2,
  Server, Cpu, HardDrive, Layers, Key, ArrowLeft, ArrowRight, ShieldCheck, Box
} from 'lucide-react';

export function CreateLXDModal({ nodes, onClose, onRefresh, addToast }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [sshKeys, setSshKeys] = useState([]);
  const [form, setForm] = useState({
    node_id: nodes[0]?.id || 'local-master',
    name: '',
    type: 'container',
    image: 'ubuntu:24.04',
    ram_gb: 2,
    cpu_cores: 2,
    disk_gb: 20,
    autostart: true,
    ssh_key: '',
    template_preset: 'none'
  });

  // Custom Input Toggles
  const [customRamActive, setCustomRamActive] = useState(false);
  const [customCpuActive, setCustomCpuActive] = useState(false);
  const [customDiskActive, setCustomDiskActive] = useState(false);

  const [isDeploying, setIsDeploying] = useState(false);
  const [deployLogs, setDeployLogs] = useState([]);
  const [createdSuccessData, setCreatedSuccessData] = useState(null);

  useEffect(() => {
    fetch('/api/ssh-keys')
      .then(r => r.json())
      .then(data => Array.isArray(data) && setSshKeys(data))
      .catch(console.error);

    fetch('/api/settings')
      .then(r => r.json())
      .then(settings => {
        if (settings) {
          setForm(prev => ({
            ...prev,
            ram_gb: settings.default_ram_gb ? parseInt(settings.default_ram_gb) || prev.ram_gb : prev.ram_gb,
            cpu_cores: settings.default_cpu_cores ? parseInt(settings.default_cpu_cores) || prev.cpu_cores : prev.cpu_cores,
            disk_gb: settings.default_disk_gb ? parseInt(settings.default_disk_gb) || prev.disk_gb : prev.disk_gb,
          }));
        }
      })
      .catch(console.error);
  }, []);

  const targetNode = nodes.find(n => n.id === form.node_id) || nodes[0];
  const targetNodeName = targetNode?.name || form.node_id;

  const appendLog = (msg) => {
    const timeStr = new Date().toLocaleTimeString('id-ID', { hour12: false });
    setDeployLogs(prev => [...prev, { id: Date.now() + Math.random(), text: msg, timestamp: timeStr }]);
  };

  const handleNameChange = (val) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    setForm({ ...form, name: sanitized });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return addToast('error', 'Nama container wajib diisi!');

    setIsDeploying(true);
    setDeployLogs([]);

    try {
      const res = await fetch(`/api/nodes/${form.node_id}/action?stream=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'launch', ...form })
      });

      let isSuccess = false;

      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine) {
              appendLog(cleanLine);
              if (cleanLine.includes('✅ SUCCESS')) {
                isSuccess = true;
              }
            }
          }
        }

        if (buffer.trim()) {
          const cleanBuf = buffer.trim();
          appendLog(cleanBuf);
          if (cleanBuf.includes('✅ SUCCESS')) isSuccess = true;
        }
      }

      if (res.ok || isSuccess) {
        setTimeout(() => {
          setIsDeploying(false);
          setCreatedSuccessData({
            name: form.name,
            node_id: form.node_id,
            node_name: targetNodeName,
            image: form.image,
            ram_gb: form.ram_gb,
            cpu_cores: form.cpu_cores,
            disk_gb: form.disk_gb,
            template_preset: form.template_preset,
            ssh_key: !!form.ssh_key
          });
          onRefresh();
        }, 1000);
      } else {
        addToast('error', 'Deployment gagal. Periksa log terminal!');
        setTimeout(() => setIsDeploying(false), 2000);
      }
    } catch (e) {
      appendLog(`❌ Network Error: ${e.message}`);
      addToast('error', e.message);
      setTimeout(() => setIsDeploying(false), 2000);
    }
  };

  const imagesList = [
    { id: 'ubuntu:24.04', title: 'Ubuntu 24.04 LTS', icon: '🚀', tag: 'Recommended', desc: 'Rilis LTS terbaru, sangat direkomendasikan' },
    { id: 'ubuntu:22.04', title: 'Ubuntu 22.04 LTS', icon: '🐧', tag: 'Stable', desc: 'Versi LTS populer, stabil untuk aplikasi umum' },
    { id: 'images:debian/12', title: 'Debian 12 Bookworm', icon: '🌀', tag: 'Lightweight', desc: 'Ringan, stabil, hemat pemakaian RAM' },
    { id: 'images:alpine/edge', title: 'Alpine Linux (Latest)', icon: '🏔️', tag: 'Ultra Small', desc: 'Ukuran footprint sangat mini (~3MB - 5MB RAM)' },
    { id: 'images:almalinux/9', title: 'AlmaLinux 9 Enterprise', icon: '🔴', tag: 'RHEL Compatible', desc: 'Enterprise Linux stabil pengganti CentOS' }
  ];

  const appTemplates = [
    { id: 'none', title: 'Clean OS', icon: '📦', desc: 'Sistem operasi murni tanpa aplikasi tambahan' },
    { id: 'docker', title: 'Docker Host', icon: '🚀', desc: 'Pre-installed Docker Engine & Docker Compose' },
    { id: 'nginx', title: 'Nginx Web Server', icon: '🌐', desc: 'Pre-installed Nginx HTTP/2 webserver' },
    { id: 'nodejs', title: 'Node.js & PM2', icon: '⚡', desc: 'Node.js 22 LTS & PM2 Process Manager' },
    { id: 'python', title: 'Python 3 Environment', icon: '🐍', desc: 'Python 3, virtualenv, & pip package manager' }
  ];

  const stepTitles = {
    1: 'Target Node & Instance Name',
    2: 'Operating System Selection',
    3: 'Hardware Resource Limits',
    4: 'Access & SSH Key Injection',
    5: 'App Bootstrap Template',
    6: 'Summary Review & Deployment'
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-md flex items-center justify-center p-4 sm:p-6">
      {/* ── SUCCESS DIALOG SCREEN ──────────────────────────────────────────────── */}
      {createdSuccessData ? (
        <Card className="max-w-xl w-full p-6 space-y-6 shadow-2xl relative border-emerald-500/40 bg-card font-sans animate-slide-up">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center size-14 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="size-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-foreground tracking-tight">LXD Container Berhasil Dideploy! 🎉</h3>
            <p className="text-xs text-muted-foreground">
              Container <span className="font-mono text-primary font-bold">{createdSuccessData.name}</span> telah aktif berjalan di Node Server <span className="font-mono text-foreground font-bold">{createdSuccessData.node_name}</span>.
            </p>
          </div>

          <div className="p-4 bg-background rounded-lg border border-border space-y-2 font-mono text-xs">
            <div className="flex justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted-foreground">Nama Instance:</span>
              <span className="text-foreground font-bold">{createdSuccessData.name}</span>
            </div>
            <div className="flex justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted-foreground">Target Node:</span>
              <span className="text-foreground">{createdSuccessData.node_name}</span>
            </div>
            <div className="flex justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted-foreground">OS Image:</span>
              <span className="text-foreground">{createdSuccessData.image}</span>
            </div>
            <div className="flex justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted-foreground">Spesifikasi Resource:</span>
              <span className="text-emerald-400 font-bold">{createdSuccessData.ram_gb} GB RAM | {createdSuccessData.cpu_cores} Cores | {createdSuccessData.disk_gb} GB Disk</span>
            </div>
            {createdSuccessData.template_preset !== 'none' && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Template App:</span>
                <span className="text-amber-400 font-bold">{createdSuccessData.template_preset.toUpperCase()}</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                navigate(`/lxds/${createdSuccessData.node_id}/${createdSuccessData.name}`);
              }}
            >
              <Layers className="size-4" data-icon="inline-start" />
              <span>Kelola LXD Detail</span>
            </Button>
            <Button
              onClick={() => {
                onClose();
              }}
            >
              <Check className="size-4" data-icon="inline-start" />
              <span>Selesai & Tutup</span>
            </Button>
          </div>
        </Card>
      ) : (
        /* ── 6-STEP WIZARD MODAL DIALOG ────────────────────────────────────────── */
        <Card className="max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative border-border overflow-hidden">
          {/* COMPACT PROCESSING OVERLAY WITH LIVE STEP LOGS */}
          {isDeploying && (
            <div className="absolute inset-0 z-30 bg-card/95 backdrop-blur-sm p-6 flex flex-col justify-center space-y-4 font-sans animate-fade-in">
              <div className="space-y-2 text-center">
                <div className="inline-flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary border border-primary/20">
                  <Loader2 className="size-7 animate-spin text-primary" />
                </div>
                <h3 className="text-base font-bold text-foreground">Memproses Deployment LXD Container...</h3>
                <p className="text-xs text-muted-foreground">
                  Container <span className="font-mono text-primary font-bold">{form.name}</span> sedang disiapkan di Node <span className="font-mono text-foreground">{targetNodeName}</span>
                </p>
              </div>

              {/* Compact Console Log Terminal Box */}
              <div className="bg-[#090d16] border border-border rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-1.5 text-emerald-400 max-h-48 shadow-inner">
                {deployLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-2 text-[11px] leading-tight animate-fade-in">
                    <span className="text-muted-foreground shrink-0 font-sans">[{log.timestamp}]</span>
                    <span>{log.text}</span>
                  </div>
                ))}
              </div>

              <div className="text-center">
                <p className="text-[11px] font-mono text-muted-foreground">Harap tunggu, proses ini membutuhkan waktu beberapa detik...</p>
              </div>
            </div>
          )}

          {/* Wizard Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <span>Create LXD Container Wizard</span>
              </h3>
              <p className="text-xs text-muted-foreground">Langkah {step} dari 6: <span className="font-semibold text-foreground">{stepTitles[step]}</span></p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} disabled={isDeploying}><X className="size-5" /></Button>
          </div>

          {/* 6-Step Pill Progress Navigation Bar */}
          <div className="grid grid-cols-6 gap-1.5 font-mono text-[10px]">
            {[
              { num: 1, label: 'Node' },
              { num: 2, label: 'OS' },
              { num: 3, label: 'Specs' },
              { num: 4, label: 'Access' },
              { num: 5, label: 'Template' },
              { num: 6, label: 'Review' }
            ].map(s => (
              <div
                key={s.num}
                onClick={() => {
                  if (s.num < step || (s.num > step && form.name)) setStep(s.num);
                }}
                className={`py-2 px-1 rounded-lg border text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                  step === s.num
                    ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                    : step > s.num
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold'
                    : 'border-border bg-background text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="size-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[9px]">{s.num}</span>
                <span className="truncate max-w-full">{s.label}</span>
              </div>
            ))}
          </div>

          {/* ── STEP 1: TARGET NODE & INSTANCE NAME ───────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5 text-xs font-sans animate-fade-in">
              <div className="space-y-2">
                <label className="block text-foreground font-semibold flex items-center gap-2">
                  <Server className="size-4 text-cyan-400" />
                  <span>Pilih Target Node Server</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-1">
                  {nodes.map(n => {
                    const isSelected = form.node_id === n.id;
                    const lxdsCount = (n.lxds || n.instances || []).length;
                    return (
                      <div
                        key={n.id}
                        onClick={() => setForm({ ...form, node_id: n.id })}
                        className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                          isSelected ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="size-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="font-bold text-foreground font-mono text-xs">{n.name}</span>
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground">IP: {n.ip || '127.0.0.1'} | {lxdsCount} LXDs Active</p>
                        </div>
                        {n.is_master ? <Badge variant="info">MASTER</Badge> : <Badge variant="outline">WORKER</Badge>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-foreground font-semibold">Nama Container LXD</label>
                <Input
                  type="text"
                  placeholder="misal: web-app-prod"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <span>Slug otomatis: <span className="text-primary font-bold">{form.name || 'web-container'}</span></span>
                  <span>Huruf kecil, angka, dash (-)</span>
                </div>
              </div>

              <div className="pt-4 flex justify-end border-t border-border">
                <Button onClick={() => form.name ? setStep(2) : addToast('error', 'Nama container wajib diisi!')}>
                  <span>Lanjut: Pilih OS Image</span>
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: OPERATING SYSTEM SELECTION ────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4 text-xs font-sans animate-fade-in">
              <label className="block text-foreground font-semibold flex items-center gap-2">
                <Box className="size-4 text-primary" />
                <span>Pilih Sistem Operasi (OS Image)</span>
              </label>
              <div className="grid grid-cols-1 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                {imagesList.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => {
                      setForm({ ...form, image: img.id });
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      form.image === img.id ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-background border border-border flex items-center justify-center text-xl shrink-0">
                        {img.icon}
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground text-xs">{img.title}</span>
                          <Badge variant={form.image === img.id ? 'info' : 'outline'}>{img.tag}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{img.desc}</p>
                      </div>
                    </div>
                    {form.image === img.id && <Check className="size-5 text-primary shrink-0" />}
                  </div>
                ))}

                {/* Custom OS Image Input Card */}
                <div
                  className={`p-3.5 rounded-xl border transition space-y-2 ${
                    !imagesList.some(i => i.id === form.image) ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background'
                  }`}
                >
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setForm({ ...form, image: 'images:rockylinux/9' })}>
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-lg bg-background border border-border flex items-center justify-center text-xl shrink-0">
                        ✨
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground text-xs">Custom OS Image Alias / Remote</span>
                          <Badge variant="outline">Advanced</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Ketik alias image LXD bebas dari remote images: atau ubuntu:</p>
                      </div>
                    </div>
                    {!imagesList.some(i => i.id === form.image) && <Check className="size-5 text-primary shrink-0" />}
                  </div>

                  {!imagesList.some(i => i.id === form.image) && (
                    <div className="pt-2 flex items-center gap-2 border-t border-border/50 animate-fade-in">
                      <span className="text-[11px] text-muted-foreground font-mono">Image String:</span>
                      <Input
                        type="text"
                        placeholder="misal: images:rockylinux/9 atau images:archlinux"
                        value={form.image}
                        onChange={(e) => setForm({ ...form, image: e.target.value })}
                        className="h-8 text-xs font-mono flex-1"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-border">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="size-4" data-icon="inline-start" />
                  <span>Kembali</span>
                </Button>
                <Button onClick={() => setStep(3)}>
                  <span>Lanjut: Hardware Specs</span>
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: HARDWARE RESOURCES (CLEAN CUSTOM TOGGLE UX) ───────────────── */}
          {step === 3 && (
            <div className="space-y-4 text-xs font-sans animate-fade-in">
              <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
                {/* Hardware Spec 1: RAM Limit with Clean Custom Toggle */}
                <div className="space-y-2 bg-background p-3.5 rounded-xl border border-border">
                  <label className="block text-foreground font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="size-4 text-purple-400" />
                      <span>RAM Memory Limit</span>
                    </span>
                    <span className="font-mono text-primary font-bold">{form.ram_gb} GB RAM</span>
                  </label>

                  <div className="grid grid-cols-6 gap-1.5">
                    {[1, 2, 4, 8, 16].map(ram => (
                      <button
                        key={ram}
                        type="button"
                        onClick={() => {
                          setForm({ ...form, ram_gb: ram });
                          setCustomRamActive(false);
                        }}
                        className={`py-2 rounded-lg font-mono text-xs transition border ${
                          !customRamActive && form.ram_gb === ram
                            ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs'
                            : 'bg-card text-foreground border-border hover:bg-accent'
                        }`}
                      >
                        {ram} GB
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCustomRamActive(!customRamActive)}
                      className={`py-2 rounded-lg font-mono text-xs transition border ${
                        customRamActive
                          ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs'
                          : 'bg-card text-muted-foreground border-border hover:bg-accent'
                      }`}
                    >
                      Custom...
                    </button>
                  </div>

                  {customRamActive && (
                    <div className="pt-2 flex items-center gap-2 animate-fade-in border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground font-mono">Ketik RAM kustom:</span>
                      <Input
                        type="number"
                        min="1"
                        max="128"
                        value={form.ram_gb}
                        onChange={e => setForm({ ...form, ram_gb: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="h-8 w-32 text-xs font-mono"
                        autoFocus
                      />
                      <span className="text-[11px] font-mono text-muted-foreground">GB</span>
                    </div>
                  )}
                </div>

                {/* Hardware Spec 2: CPU Cores with Clean Custom Toggle */}
                <div className="space-y-2 bg-background p-3.5 rounded-xl border border-border">
                  <label className="block text-foreground font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="size-4 text-amber-400" />
                      <span>CPU Cores Allowance</span>
                    </span>
                    <span className="font-mono text-amber-400 font-bold">{form.cpu_cores} Cores</span>
                  </label>

                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 2, 4, 8].map(core => (
                      <button
                        key={core}
                        type="button"
                        onClick={() => {
                          setForm({ ...form, cpu_cores: core });
                          setCustomCpuActive(false);
                        }}
                        className={`py-2 rounded-lg font-mono text-xs transition border ${
                          !customCpuActive && form.cpu_cores === core
                            ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs'
                            : 'bg-card text-foreground border-border hover:bg-accent'
                        }`}
                      >
                        {core} Core
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCustomCpuActive(!customCpuActive)}
                      className={`py-2 rounded-lg font-mono text-xs transition border ${
                        customCpuActive
                          ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs'
                          : 'bg-card text-muted-foreground border-border hover:bg-accent'
                      }`}
                    >
                      Custom...
                    </button>
                  </div>

                  {customCpuActive && (
                    <div className="pt-2 flex items-center gap-2 animate-fade-in border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground font-mono">Ketik CPU Cores kustom:</span>
                      <Input
                        type="number"
                        min="1"
                        max="64"
                        value={form.cpu_cores}
                        onChange={e => setForm({ ...form, cpu_cores: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="h-8 w-32 text-xs font-mono"
                        autoFocus
                      />
                      <span className="text-[11px] font-mono text-muted-foreground">Cores</span>
                    </div>
                  )}
                </div>

                {/* Hardware Spec 3: Disk Storage Quota with Clean Custom Toggle */}
                <div className="space-y-2 bg-background p-3.5 rounded-xl border border-border">
                  <label className="block text-foreground font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="size-4 text-cyan-400" />
                      <span>Disk Storage Quota</span>
                    </span>
                    <span className="font-mono text-cyan-400 font-bold">{form.disk_gb} GB Storage</span>
                  </label>

                  <div className="grid grid-cols-5 gap-1.5">
                    {[10, 20, 50, 100].map(disk => (
                      <button
                        key={disk}
                        type="button"
                        onClick={() => {
                          setForm({ ...form, disk_gb: disk });
                          setCustomDiskActive(false);
                        }}
                        className={`py-2 rounded-lg font-mono text-xs transition border ${
                          !customDiskActive && form.disk_gb === disk
                            ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs'
                            : 'bg-card text-foreground border-border hover:bg-accent'
                        }`}
                      >
                        {disk} GB
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setCustomDiskActive(!customDiskActive)}
                      className={`py-2 rounded-lg font-mono text-xs transition border ${
                        customDiskActive
                          ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs'
                          : 'bg-card text-muted-foreground border-border hover:bg-accent'
                      }`}
                    >
                      Custom...
                    </button>
                  </div>

                  {customDiskActive && (
                    <div className="pt-2 flex items-center gap-2 animate-fade-in border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground font-mono">Ketik Storage kustom:</span>
                      <Input
                        type="number"
                        min="5"
                        max="2000"
                        value={form.disk_gb}
                        onChange={e => setForm({ ...form, disk_gb: Math.max(5, parseInt(e.target.value) || 5) })}
                        className="h-8 w-32 text-xs font-mono"
                        autoFocus
                      />
                      <span className="text-[11px] font-mono text-muted-foreground">GB</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-border">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="size-4" data-icon="inline-start" />
                  <span>Kembali</span>
                </Button>
                <Button onClick={() => setStep(4)}>
                  <span>Lanjut: Access & SSH</span>
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 4: ACCESS & SSH KEY INJECTION ────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5 text-xs font-sans animate-fade-in">
              <div className="space-y-2">
                <label className="block text-foreground font-semibold flex items-center gap-2">
                  <Key className="size-4 text-amber-400" />
                  <span>Pilih SSH Public Key (Injeksi Login Otomatis)</span>
                </label>
                <p className="text-xs text-muted-foreground">
                  Pilih kunci SSH publik terdaftar untuk otomatis diautorisasi di <span className="font-mono text-foreground">/root/.ssh/authorized_keys</span> saat container pertama kali menyala.
                </p>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                <div
                  onClick={() => setForm({ ...form, ssh_key: '' })}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                    form.ssh_key === '' ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <span className="font-medium text-foreground">-- Tanpa Injeksi SSH Key (Login Password Biasa) --</span>
                  {form.ssh_key === '' && <Check className="size-4 text-primary shrink-0" />}
                </div>

                {sshKeys.map(k => (
                  <div
                    key={k.id}
                    onClick={() => setForm({ ...form, ssh_key: k.public_key })}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      form.ssh_key === k.public_key ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <p className="font-bold text-foreground font-mono flex items-center gap-2">
                        <span>🔑 {k.name}</span>
                      </p>
                      <p className="text-[10px] font-mono text-muted-foreground truncate max-w-xs">{k.public_key}</p>
                    </div>
                    {form.ssh_key === k.public_key && <Check className="size-4 text-primary shrink-0" />}
                  </div>
                ))}
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-border">
                <Button variant="outline" onClick={() => setStep(3)}>
                  <ArrowLeft className="size-4" data-icon="inline-start" />
                  <span>Kembali</span>
                </Button>
                <Button onClick={() => setStep(5)}>
                  <span>Lanjut: App Template</span>
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 5: APPLICATION BOOTSTRAP TEMPLATE PRESET ────────────────── */}
          {step === 5 && (
            <div className="space-y-4 text-xs font-sans animate-fade-in">
              <div className="space-y-1">
                <label className="block text-foreground font-semibold flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span>Pilih Preset Template Aplikasi (Cloud-Init Auto Install)</span>
                </label>
                <p className="text-xs text-muted-foreground">Otomatis mendownload dan mengonfigurasi stack aplikasi siap pakai saat booting pertama.</p>
              </div>

              <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
                {appTemplates.map(tpl => (
                  <div
                    key={tpl.id}
                    onClick={() => setForm({ ...form, template_preset: tpl.id })}
                    className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      form.template_preset === tpl.id ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-lg bg-background border border-border flex items-center justify-center text-lg shrink-0">
                        {tpl.icon}
                      </div>
                      <div className="space-y-0.5">
                        <span className="font-bold text-foreground text-xs">{tpl.title}</span>
                        <p className="text-[11px] text-muted-foreground">{tpl.desc}</p>
                      </div>
                    </div>
                    {form.template_preset === tpl.id && <Check className="size-5 text-primary shrink-0" />}
                  </div>
                ))}
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-border">
                <Button variant="outline" onClick={() => setStep(4)}>
                  <ArrowLeft className="size-4" data-icon="inline-start" />
                  <span>Kembali</span>
                </Button>
                <Button onClick={() => setStep(6)}>
                  <span>Lanjut: Review Summary</span>
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 6: SUMMARY REVIEW & DEPLOYMENT CONFIRMATION ──────────────── */}
          {step === 6 && (
            <form onSubmit={handleSubmit} className="space-y-5 text-xs font-sans animate-fade-in">
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-4 text-emerald-400" />
                  <span>Konfirmasi Ringkasan Deployment Container</span>
                </h4>
                <p className="text-xs text-muted-foreground">Periksa seluruh konfigurasi sebelum meluncurkan container LXD ke kluster.</p>
              </div>

              <div className="p-4 bg-background rounded-xl border border-border space-y-2.5 font-mono text-xs shadow-inner">
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">Nama Container LXD:</span>
                  <span className="text-primary font-bold text-sm">{form.name}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">Target Node Server:</span>
                  <span className="text-foreground font-bold">{targetNodeName} ({targetNode?.ip || '127.0.0.1'})</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">Sistem Operasi (OS):</span>
                  <span className="text-foreground">{form.image}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">Alokasi Hardware Specs:</span>
                  <span className="text-emerald-400 font-bold">{form.ram_gb} GB RAM | {form.cpu_cores} Cores | {form.disk_gb} GB Storage</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">Preset App Template:</span>
                  <span className="text-amber-400 font-bold">{form.template_preset.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SSH Key Authorized:</span>
                  <span className={form.ssh_key ? 'text-cyan-400 font-bold' : 'text-muted-foreground'}>
                    {form.ssh_key ? 'Injected ✓' : 'Password Login Only'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="chk_wizard_autostart"
                  checked={form.autostart}
                  onChange={(e) => setForm({ ...form, autostart: e.target.checked })}
                  className="accent-primary size-4"
                />
                <label htmlFor="chk_wizard_autostart" className="text-xs text-foreground cursor-pointer font-medium">
                  Nyalakan otomatis saat host server di-reboot (Autostart Boot)
                </label>
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-border">
                <Button type="button" variant="outline" onClick={() => setStep(5)}>
                  <ArrowLeft className="size-4" data-icon="inline-start" />
                  <span>Kembali</span>
                </Button>
                <Button type="submit" size="lg" disabled={isDeploying} className="font-bold">
                  {isDeploying ? 'Deploying Container...' : '🚀 Launch & Deploy LXD Container'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
