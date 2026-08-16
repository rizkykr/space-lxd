import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Input, Select } from '../ui/primitives';
import {
  Sparkles, Check, X, Loader2, CheckCircle2,
  Server, Cpu, HardDrive, Layers, Key, ArrowLeft, ArrowRight, ShieldCheck, Box
} from 'lucide-react';
import { useI18n } from '../../i18n';

export function CreateLXDModal({ nodes, onClose, onRefresh, addToast }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [sshKeys, setSshKeys] = useState([]);
  const [storagePools, setStoragePools] = useState([]);
  const [networks, setNetworks] = useState([]);
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
    template_preset: 'none',
    storage_pool: '',
    network: '',
    privileged: false,
    nesting: true,
    cpu_allowance: '',
    memory_swap: true
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

    fetch('/api/storage-pools')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setStoragePools(data);
          setForm(prev => ({ ...prev, storage_pool: prev.storage_pool || (data[0]?.name || 'default') }));
        }
      })
      .catch(console.error);

    fetch('/api/networks')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setNetworks(data);
          setForm(prev => ({ ...prev, network: prev.network || (data[0]?.name || 'lxdbr0') }));
        }
      })
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
    const timeStr = new Date().toLocaleTimeString([], { hour12: false });
    setDeployLogs(prev => [...prev, { id: Date.now() + Math.random(), text: msg, timestamp: timeStr }]);
  };

  const handleNameChange = (val) => {
    const sanitized = val.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    setForm({ ...form, name: sanitized });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return addToast('error', t('wizard.nameRequired'));

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
        addToast('error', t('wizard.deployFailed'));
        setTimeout(() => setIsDeploying(false), 2000);
      }
    } catch (e) {
      appendLog(`❌ ${t('wizard.networkError', { msg: e.message })}`);
      addToast('error', e.message);
      setTimeout(() => setIsDeploying(false), 2000);
    }
  };

  const imagesList = [
    { id: 'ubuntu:24.04', title: t('img.ubuntu2404'), icon: '🚀', tag: t('img.tagRecommended'), desc: t('img.descUbuntu24') },
    { id: 'ubuntu:22.04', title: t('img.ubuntu2204'), icon: '🐧', tag: t('img.tagStable'), desc: t('img.descUbuntu22') },
    { id: 'images:debian/12', title: t('img.debian12'), icon: '🌀', tag: t('img.tagLightweight'), desc: t('img.descDebian12') },
    { id: 'images:alpine/edge', title: t('img.alpine'), icon: '🏔️', tag: t('img.tagUltraSmall'), desc: t('img.descAlpine') },
    { id: 'images:almalinux/9', title: t('img.almalinux9'), icon: '🔴', tag: t('img.tagRhel'), desc: t('img.descAlmaLinux9') }
  ];

  const appTemplates = [
    { id: 'none', title: t('tpl.clean'), icon: '📦', desc: t('tpl.cleanDesc') },
    { id: 'docker', title: t('tpl.docker'), icon: '🚀', desc: t('tpl.dockerDesc') },
    { id: 'nginx', title: t('tpl.nginx'), icon: '🌐', desc: t('tpl.nginxDesc') },
    { id: 'nodejs', title: t('tpl.nodejs'), icon: '⚡', desc: t('tpl.nodejsDesc') },
    { id: 'python', title: t('tpl.python'), icon: '🐍', desc: t('tpl.pythonDesc') }
  ];

  const stepTitles = {
    1: t('wizard.stepTitle1'),
    2: t('wizard.stepTitle2'),
    3: t('wizard.stepTitle3'),
    4: t('wizard.stepTitle4'),
    5: t('wizard.stepTitle5'),
    6: t('wizard.stepTitle6')
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
            <h3 className="text-xl font-bold text-foreground tracking-tight">{t('wizard.successTitle')} 🎉</h3>
            <p className="text-xs text-muted-foreground">
              {t('wizard.successMsg', { name: createdSuccessData.name, node: createdSuccessData.node_name })}
            </p>
          </div>

          <div className="p-4 bg-background rounded-lg border border-border space-y-2 font-mono text-xs">
            <div className="flex justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted-foreground">{t('wizard.containerName')}</span>
              <span className="text-foreground font-bold">{createdSuccessData.name}</span>
            </div>
            <div className="flex justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted-foreground">{t('wizard.targetNode')}</span>
              <span className="text-foreground">{createdSuccessData.node_name}</span>
            </div>
            <div className="flex justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted-foreground">{t('wizard.osLabel')}</span>
              <span className="text-foreground">{createdSuccessData.image}</span>
            </div>
            <div className="flex justify-between border-b border-border/50 pb-1.5">
              <span className="text-muted-foreground">{t('wizard.hwSpecs')}</span>
              <span className="text-emerald-400 font-bold">
                {createdSuccessData.ram_gb} GB RAM | {createdSuccessData.cpu_cores} Cores | {createdSuccessData.disk_gb} GB Disk
              </span>
            </div>
            {createdSuccessData.template_preset !== 'none' && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('wizard.templatePreset')}</span>
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
              <Layers className="size-4 mr-1.5" />
              <span>{t('wizard.manageDetail')}</span>
            </Button>
            <Button
              onClick={() => {
                onClose();
              }}
            >
              <Check className="size-4 mr-1.5" />
              <span>{t('wizard.doneClose')}</span>
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
                <h3 className="text-base font-bold text-foreground">{t('wizard.deploying')}</h3>
                <p className="text-xs text-muted-foreground">
                  {t('wizard.deployingDesc', { name: form.name, node: targetNodeName })}
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
                <p className="text-[11px] font-mono text-muted-foreground">{t('wizard.wait')}</p>
              </div>
            </div>
          )}

          {/* Wizard Header */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <span>{t('wizard.title')}</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                {t('wizard.stepOf', { current: step, total: 6, title: stepTitles[step] })}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} disabled={isDeploying}><X className="size-5" /></Button>
          </div>

          {/* 6-Step Pill Progress Navigation Bar */}
          <div className="grid grid-cols-6 gap-1.5 font-mono text-[10px]">
            {[
              { num: 1, label: t('wizard.stepNode') },
              { num: 2, label: t('wizard.stepOs') },
              { num: 3, label: t('wizard.stepSpecs') },
              { num: 4, label: t('wizard.stepAccess') },
              { num: 5, label: t('wizard.stepTemplate') },
              { num: 6, label: t('wizard.stepReview') }
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
                  <span>{t('wizard.node')}</span>
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
                        {n.is_master ? <Badge variant="info">{t('common.master')}</Badge> : <Badge variant="outline">{t('common.worker')}</Badge>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-foreground font-semibold">{t('wizard.nodeName')}</label>
                <Input
                  type="text"
                  placeholder={t('wizard.nodeNamePlaceholder')}
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
                <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                  <span>{t('wizard.slug', { slug: form.name || 'web-container' })}</span>
                  <span>{t('wizard.nodeNameHint')}</span>
                </div>
              </div>

              <div className="pt-4 flex justify-end border-t border-border">
                <Button onClick={() => form.name ? setStep(2) : addToast('error', t('wizard.nameRequired'))}>
                  <span>{t('wizard.nextNode')}</span>
                  <ArrowRight className="size-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 2: OPERATING SYSTEM SELECTION ────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4 text-xs font-sans animate-fade-in">
              <div className="space-y-2">
                <label className="block text-foreground font-semibold flex items-center gap-2">
                  <Box className="size-4 text-primary" />
                  <span>{t('wizard.instanceType')}</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { id: 'container', title: t('wizard.container'), icon: '📦', desc: t('wizard.containerDesc') },
                    { id: 'virtual-machine', title: t('wizard.vm'), icon: '🖥️', desc: t('wizard.vmDesc') }
                  ].map(item => (
                    <div
                      key={item.id}
                      onClick={() => setForm({ ...form, type: item.id })}
                      className={`p-3.5 rounded-xl border transition cursor-pointer ${form.type === item.id ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{item.icon}</span>
                        <span className="font-bold text-foreground text-xs">{item.title}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1 font-sans">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <label className="block text-foreground font-semibold flex items-center gap-2">
                <Box className="size-4 text-primary" />
                <span>{t('wizard.os')}</span>
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
                        <p className="text-[11px] text-muted-foreground font-sans">{img.desc}</p>
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
                          <span className="font-bold text-foreground text-xs">{t('wizard.osCustom')}</span>
                          <Badge variant="outline">{t('img.tagAdvanced')}</Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground font-sans">{t('wizard.osCustomDesc')}</p>
                      </div>
                    </div>
                    {!imagesList.some(i => i.id === form.image) && <Check className="size-5 text-primary shrink-0" />}
                  </div>

                  {!imagesList.some(i => i.id === form.image) && (
                    <div className="pt-2 flex items-center gap-2 border-t border-border/50 animate-fade-in">
                      <span className="text-[11px] text-muted-foreground font-mono">{t('wizard.osCustomHint')}</span>
                      <Input
                        type="text"
                        placeholder={t('wizard.imagePlaceholder')}
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
                  <ArrowLeft className="size-4 mr-1.5" />
                  <span>{t('wizard.back')}</span>
                </Button>
                <Button onClick={() => setStep(3)}>
                  <span>{t('wizard.nextHardware')}</span>
                  <ArrowRight className="size-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* ── STEP 3: HARDWARE RESOURCES (CLEAN CUSTOM TOGGLE UX) ───────────────── */}
          {step === 3 && (
            <div className="space-y-4 text-xs font-sans animate-fade-in">
              <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
                {/* Hardware Spec 1: RAM Limit */}
                <div className="space-y-2 bg-background p-3.5 rounded-xl border border-border">
                  <label className="block text-foreground font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="size-4 text-purple-400" />
                      <span>{t('wizard.ramLabel')}</span>
                    </span>
                    <span className="font-mono text-primary font-bold">{t('wizard.ramValue', { n: form.ram_gb })}</span>
                  </label>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
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
                      {t('wizard.custom')}
                    </button>
                  </div>

                  {customRamActive && (
                    <div className="pt-2 flex items-center gap-2 animate-fade-in border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground font-mono">{t('wizard.ramCustom')}</span>
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

                {/* Hardware Spec 2: CPU Cores */}
                <div className="space-y-2 bg-background p-3.5 rounded-xl border border-border">
                  <label className="block text-foreground font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Cpu className="size-4 text-amber-400" />
                      <span>{t('wizard.cpuLabel')}</span>
                    </span>
                    <span className="font-mono text-amber-400 font-bold">{t('wizard.coreValue', { n: form.cpu_cores })}</span>
                  </label>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
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
                      {t('wizard.custom')}
                    </button>
                  </div>

                  {customCpuActive && (
                    <div className="pt-2 flex items-center gap-2 animate-fade-in border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground font-mono">{t('wizard.cpuCustom')}</span>
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

                {/* Hardware Spec 3: Disk Storage Quota */}
                <div className="space-y-2 bg-background p-3.5 rounded-xl border border-border">
                  <label className="block text-foreground font-semibold flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="size-4 text-cyan-400" />
                      <span>{t('wizard.diskLabel')}</span>
                    </span>
                    <span className="font-mono text-cyan-400 font-bold">{t('wizard.diskValue', { n: form.disk_gb })}</span>
                  </label>

                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
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
                      {t('wizard.custom')}
                    </button>
                  </div>

                  {customDiskActive && (
                    <div className="pt-2 flex items-center gap-2 animate-fade-in border-t border-border/50">
                      <span className="text-[11px] text-muted-foreground font-mono">{t('wizard.diskCustom')}</span>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="block text-foreground font-semibold flex items-center gap-1.5">
                    <HardDrive className="size-3.5 text-cyan-400" />
                    <span>{t('wizard.storagePool')}</span>
                  </label>
                  <Select value={form.storage_pool} onChange={(e) => setForm({ ...form, storage_pool: e.target.value })}>
                    {(storagePools.length ? storagePools : [{ name: 'default', driver: 'dir' }]).map(p => (
                      <option key={p.name} value={p.name}>{p.name} ({p.driver})</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-foreground font-semibold flex items-center gap-1.5">
                    <Server className="size-3.5 text-emerald-400" />
                    <span>{t('wizard.networkBridge')}</span>
                  </label>
                  <Select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })}>
                    {(networks.length ? networks : [{ name: 'lxdbr0', type: 'bridge' }]).map(n => (
                      <option key={n.name} value={n.name}>{n.name} ({n.type})</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-border">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="size-4 mr-1.5" />
                  <span>{t('wizard.back')}</span>
                </Button>
                <Button onClick={() => setStep(4)}>
                  <span>{t('wizard.nextAccess')}</span>
                  <ArrowRight className="size-4 ml-1.5" />
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
                  <span>{t('wizard.sshKey')}</span>
                </label>
                <p className="text-xs text-muted-foreground font-sans">
                  {t('wizard.sshKeyDesc')}
                </p>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                <div
                  onClick={() => setForm({ ...form, ssh_key: '' })}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                    form.ssh_key === '' ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                  }`}
                >
                  <span className="font-medium text-foreground">{t('wizard.noSsh')}</span>
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
                  <ArrowLeft className="size-4 mr-1.5" />
                  <span>{t('wizard.back')}</span>
                </Button>
                <Button onClick={() => setStep(5)}>
                  <span>{t('wizard.nextTemplate')}</span>
                  <ArrowRight className="size-4 ml-1.5" />
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
                  <span>{t('wizard.template')}</span>
                </label>
                <p className="text-xs text-muted-foreground font-sans">{t('wizard.templateDesc')}</p>
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
                        <p className="text-[11px] text-muted-foreground font-sans">{tpl.desc}</p>
                      </div>
                    </div>
                    {form.template_preset === tpl.id && <Check className="size-5 text-primary shrink-0" />}
                  </div>
                ))}
              </div>

              <div className="pt-4 flex items-center justify-between border-t border-border">
                <Button variant="outline" onClick={() => setStep(4)}>
                  <ArrowLeft className="size-4 mr-1.5" />
                  <span>{t('wizard.back')}</span>
                </Button>
                <Button onClick={() => setStep(6)}>
                  <span>{t('wizard.nextReview')}</span>
                  <ArrowRight className="size-4 ml-1.5" />
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
                  <span>{t('wizard.review')}</span>
                </h4>
                <p className="text-xs text-muted-foreground font-sans">{t('wizard.reviewDesc')}</p>
              </div>

              <div className="p-4 bg-background rounded-xl border border-border space-y-2.5 font-mono text-xs shadow-inner">
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">{t('wizard.containerName')}</span>
                  <span className="text-primary font-bold text-sm">{form.name}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">{t('wizard.targetNode')}</span>
                  <span className="text-foreground font-bold">{targetNodeName} ({targetNode?.ip || '127.0.0.1'})</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">{t('wizard.osLabel')}</span>
                  <span className="text-foreground">{form.image}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">{t('wizard.instanceTypeLabel')}</span>
                  <span className="text-foreground font-bold">{form.type === 'virtual-machine' ? t('wizard.vm') : t('wizard.container')}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">{t('wizard.storageNetwork')}</span>
                  <span className="text-cyan-400 font-bold">{form.storage_pool || 'default'} / {form.network || 'lxdbr0'}</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">{t('wizard.hwSpecs')}</span>
                  <span className="text-emerald-400 font-bold">{form.ram_gb} GB RAM | {form.cpu_cores} Cores | {form.disk_gb} GB Storage</span>
                </div>
                <div className="flex justify-between border-b border-border/50 pb-1.5">
                  <span className="text-muted-foreground">{t('wizard.templatePreset')}</span>
                  <span className="text-amber-400 font-bold">{form.template_preset.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('wizard.sshAuthorized')}</span>
                  <span className={form.ssh_key ? 'text-cyan-400 font-bold' : 'text-muted-foreground'}>
                    {form.ssh_key ? `${t('wizard.injected')} ✓` : t('wizard.passwordOnly')}
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
                <label htmlFor="chk_wizard_autostart" className="text-xs text-foreground cursor-pointer font-medium font-sans">
                  {t('wizard.autostart')}
                </label>
              </div>

              <div className="p-4 bg-accent/20 rounded-lg border border-border space-y-3 font-sans">
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest font-bold">{t('wizard.advanced')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chk_wizard_nesting"
                    checked={form.nesting}
                    onChange={(e) => setForm({ ...form, nesting: e.target.checked })}
                    className="accent-primary size-4"
                  />
                  <label htmlFor="chk_wizard_nesting" className="text-xs text-foreground cursor-pointer font-medium">
                    {t('wizard.nesting')}
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chk_wizard_privileged"
                    checked={form.privileged}
                    onChange={(e) => setForm({ ...form, privileged: e.target.checked })}
                    className="accent-primary size-4"
                  />
                  <label htmlFor="chk_wizard_privileged" className="text-xs text-foreground cursor-pointer font-medium">
                    {t('wizard.privileged')}
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="chk_wizard_swap"
                    checked={form.memory_swap}
                    onChange={(e) => setForm({ ...form, memory_swap: e.target.checked })}
                    className="accent-primary size-4"
                  />
                  <label htmlFor="chk_wizard_swap" className="text-xs text-foreground cursor-pointer font-medium">
                    {t('wizard.memorySwap')}
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="inp_wizard_cpu_allow" className="text-xs text-foreground font-medium">
                    {t('wizard.cpuAllowance')}
                  </label>
                  <Input
                    id="inp_wizard_cpu_allow"
                    type="text"
                    placeholder={t('wizard.cpuAllowancePlaceholder')}
                    value={form.cpu_allowance}
                    onChange={(e) => setForm({ ...form, cpu_allowance: e.target.value })}
                    className="h-8 w-44 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-border">
                <Button type="button" variant="outline" onClick={() => setStep(5)}>
                  <ArrowLeft className="size-4 mr-1.5" />
                  <span>{t('wizard.back')}</span>
                </Button>
                <Button type="submit" size="lg" disabled={isDeploying} className="font-bold">
                  {isDeploying ? t('wizard.deployingBtn') : `🚀 ${t('wizard.deploy')}`}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}

export default CreateLXDModal;
