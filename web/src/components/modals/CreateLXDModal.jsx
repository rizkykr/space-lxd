import React, { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Badge, Input, Select } from '../ui/primitives';
import {
  Sparkles, Check, X, Loader2, CheckCircle2, ArrowLeft, ArrowRight,
  Server, Cpu, HardDrive, Layers, Key, ShieldCheck, Box, Rocket, Settings2, Network, Gauge
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
        if (Array.isArray(data) && data.length) {
          setNetworks(data);
          const preferred = data.find(n => n.name === 'lxdbr0') || data[0];
          setForm(prev => ({ ...prev, network: prev.network || preferred.name }));
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

  const goTo = (n) => {
    if (n === step) return;
    if (n < step || (n > step && form.name)) setStep(n);
  };

  const handleNext = () => {
    if (step === 1 && !form.name.trim()) return addToast('error', t('wizard.nameRequired'));
    setStep(Math.min(6, step + 1));
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

  const steps = [
    { num: 1, label: t('wizard.stepNode') },
    { num: 2, label: t('wizard.stepOs') },
    { num: 3, label: t('wizard.stepSpecs') },
    { num: 4, label: t('wizard.stepAccess') },
    { num: 5, label: t('wizard.stepTemplate') },
    { num: 6, label: t('wizard.stepReview') }
  ];

  const nextLabels = {
    1: t('wizard.nextNode'),
    2: t('wizard.nextHardware'),
    3: t('wizard.nextAccess'),
    4: t('wizard.nextTemplate'),
    5: t('wizard.nextReview')
  };

  const AdvancedToggle = ({ id, checked, onChange, label, desc }) => (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-background p-3.5 hover:border-primary/40 transition">
      <input id={id} type="checkbox" checked={checked} onChange={onChange} className="accent-primary size-4 mt-0.5 shrink-0" />
      <span className="space-y-1">
        <span className="block text-xs font-semibold text-foreground">{label}</span>
        <span className="block text-[11px] text-muted-foreground leading-relaxed">{desc}</span>
      </span>
    </label>
  );

  const SectionLabel = ({ icon, children }) => (
    <label className="block text-foreground font-bold text-sm flex items-center gap-2">
      <span className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">{icon}</span>
      <span>{children}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* DEPLOYING OVERLAY */}
      {isDeploying && (
        <div className="absolute inset-0 z-40 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 font-sans animate-fade-in">
          <div className="w-full max-w-2xl space-y-5">
            <div className="space-y-2 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-primary/10 text-primary border border-primary/20">
                <Loader2 className="size-7 animate-spin text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">{t('wizard.deploying')}</h3>
              <p className="text-xs text-muted-foreground">
                {t('wizard.deployingDesc', { name: form.name, node: targetNodeName })}
              </p>
            </div>

            <div className="bg-[#090d16] border border-border rounded-xl p-4 font-mono text-xs overflow-y-auto space-y-1.5 text-emerald-400 max-h-72 shadow-inner">
              {deployLogs.length === 0 && <div className="text-muted-foreground animate-pulse">▌</div>}
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
        </div>
      )}

      {/* SUCCESS SCREEN */}
      {createdSuccessData ? (
        <div className="flex-1 flex items-center justify-center p-6 animate-fade-in">
          <Card className="max-w-xl w-full p-8 space-y-6 shadow-2xl relative border-emerald-500/40 bg-card font-sans">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center size-16 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mx-auto">
                <CheckCircle2 className="size-9 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-foreground tracking-tight">{t('wizard.successTitle')} 🎉</h3>
              <p className="text-sm text-muted-foreground">
                {t('wizard.successMsg', { name: createdSuccessData.name, node: createdSuccessData.node_name })}
              </p>
            </div>

            <div className="p-5 bg-background rounded-xl border border-border space-y-2.5 font-mono text-xs">
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

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  onClose();
                  navigate(`/lxds/${createdSuccessData.node_id}/${createdSuccessData.name}`);
                }}
              >
                <Layers className="size-4 mr-1.5" />
                <span>{t('wizard.manageDetail')}</span>
              </Button>
              <Button size="lg" onClick={onClose}>
                <Check className="size-4 mr-1.5" />
                <span>{t('wizard.doneClose')}</span>
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <>
          {/* ── HEADER ─────────────────────────────────────────────────────────────── */}
          <header className="shrink-0 h-16 border-b border-border bg-card/70 backdrop-blur px-4 sm:px-8 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shadow-xs">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-foreground tracking-tight leading-tight">{t('wizard.title')}</h2>
                <p className="text-[11px] font-mono text-muted-foreground leading-tight">{stepTitles[step]}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} disabled={isDeploying} className="text-muted-foreground hover:text-foreground">
              <X className="size-5" />
            </Button>
          </header>

          {/* ── STEPPER ─────────────────────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-border bg-card/40 px-4 sm:px-8 py-3">
            <div className="mx-auto w-full max-w-4xl flex items-center">
              {steps.map((s, idx) => (
                <Fragment key={s.num}>
                  {idx > 0 && <div className={`mx-1 h-0.5 flex-1 rounded transition-colors ${s.num <= step ? 'bg-primary/50' : 'bg-border'}`} />}
                  <button
                    onClick={() => goTo(s.num)}
                    disabled={isDeploying}
                    title={stepTitles[s.num]}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-all ${
                      step === s.num
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/30 font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className={`size-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors ${
                      s.num < step
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : step === s.num
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-border text-muted-foreground'
                    }`}>
                      {s.num < step ? <Check className="size-3.5" /> : s.num}
                    </span>
                    <span className="hidden md:block text-xs font-medium">{s.label}</span>
                  </button>
                </Fragment>
              ))}
            </div>
          </div>

          {/* ── CONTENT ─────────────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6">
            <div className="mx-auto w-full max-w-4xl space-y-6">
              {/* STEP 1: NODE & NAME */}
              {step === 1 && (
                <div className="space-y-6 text-sm font-sans animate-fade-in">
                  <div className="space-y-3">
                    <SectionLabel icon={<Server className="size-4 text-cyan-400" />}>{t('wizard.node')}</SectionLabel>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {nodes.map(n => {
                        const isSelected = form.node_id === n.id;
                        const lxdsCount = (n.lxds || n.instances || []).length;
                        return (
                          <div
                            key={n.id}
                            onClick={() => setForm({ ...form, node_id: n.id })}
                            className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                              isSelected ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`size-2.5 rounded-full ${n.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`}></span>
                                <span className="font-bold text-foreground font-mono text-xs">{n.name}</span>
                              </div>
                              <p className="text-[11px] font-mono text-muted-foreground">
                                IP: {n.ip || '127.0.0.1'} · {lxdsCount} LXD
                              </p>
                            </div>
                            {n.is_master ? <Badge variant="info">{t('common.master')}</Badge> : <Badge variant="outline">{t('common.worker')}</Badge>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <SectionLabel icon={<Box className="size-4 text-primary" />}>{t('wizard.nodeName')}</SectionLabel>
                    <Input
                      type="text"
                      placeholder={t('wizard.nodeNamePlaceholder')}
                      value={form.name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      className="h-11 text-sm"
                      required
                      autoFocus
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground font-mono">
                      <span>{t('wizard.slug', { slug: form.name || 'web-container' })}</span>
                      <span>{t('wizard.nodeNameHint')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: OS & TYPE */}
              {step === 2 && (
                <div className="space-y-6 text-sm font-sans animate-fade-in">
                  <div className="space-y-3">
                    <SectionLabel icon={<Box className="size-4 text-primary" />}>{t('wizard.instanceType')}</SectionLabel>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        { id: 'container', title: t('wizard.container'), icon: '📦', desc: t('wizard.containerDesc') },
                        { id: 'virtual-machine', title: t('wizard.vm'), icon: '🖥️', desc: t('wizard.vmDesc') }
                      ].map(item => (
                        <div
                          key={item.id}
                          onClick={() => setForm({ ...form, type: item.id })}
                          className={`p-4 rounded-2xl border transition cursor-pointer flex items-center gap-3 ${
                            form.type === item.id ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                          }`}
                        >
                          <div className="size-11 rounded-xl bg-background border border-border flex items-center justify-center text-xl shrink-0">{item.icon}</div>
                          <div className="space-y-0.5">
                            <p className="font-bold text-foreground text-sm">{item.title}</p>
                            <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                          </div>
                          {form.type === item.id && <Check className="size-5 text-primary shrink-0 ml-auto" />}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <SectionLabel icon={<Rocket className="size-4 text-primary" />}>{t('wizard.os')}</SectionLabel>
                    <div className="grid grid-cols-1 gap-2.5">
                      {imagesList.map((img) => (
                        <div
                          key={img.id}
                          onClick={() => setForm({ ...form, image: img.id })}
                          className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                            form.image === img.id ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-11 rounded-xl bg-background border border-border flex items-center justify-center text-xl shrink-0">{img.icon}</div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground text-sm">{img.title}</span>
                                <Badge variant={form.image === img.id ? 'info' : 'outline'}>{img.tag}</Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{img.desc}</p>
                            </div>
                          </div>
                          {form.image === img.id && <Check className="size-5 text-primary shrink-0" />}
                        </div>
                      ))}

                      {/* Custom image */}
                      <div className={`p-4 rounded-2xl border transition space-y-3 ${!imagesList.some(i => i.id === form.image) ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'border-border bg-background'}`}>
                        <div className="flex items-center justify-between cursor-pointer" onClick={() => setForm({ ...form, image: 'images:rockylinux/9' })}>
                          <div className="flex items-center gap-3">
                            <div className="size-11 rounded-xl bg-background border border-border flex items-center justify-center text-xl shrink-0">✨</div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-foreground text-sm">{t('wizard.osCustom')}</span>
                                <Badge variant="outline">{t('img.tagAdvanced')}</Badge>
                              </div>
                              <p className="text-[11px] text-muted-foreground">{t('wizard.osCustomDesc')}</p>
                            </div>
                          </div>
                          {!imagesList.some(i => i.id === form.image) && <Check className="size-5 text-primary shrink-0" />}
                        </div>
                        {!imagesList.some(i => i.id === form.image) && (
                          <div className="pt-3 flex items-center gap-2 border-t border-border/50 animate-fade-in">
                            <span className="text-[11px] text-muted-foreground font-mono">{t('wizard.osCustomHint')}</span>
                            <Input
                              type="text"
                              placeholder={t('wizard.imagePlaceholder')}
                              value={form.image}
                              onChange={(e) => setForm({ ...form, image: e.target.value })}
                              className="h-9 text-xs font-mono flex-1"
                              autoFocus
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: HARDWARE + STORAGE/NETWORK */}
              {step === 3 && (
                <div className="space-y-5 text-sm font-sans animate-fade-in">
                  {/* RAM */}
                  <div className="space-y-3 bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-bold text-foreground">
                        <Cpu className="size-4 text-purple-400" />
                        {t('wizard.ramLabel')}
                      </span>
                      <span className="font-mono text-primary font-bold">{t('wizard.ramValue', { n: form.ram_gb })}</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {[1, 2, 4, 8, 16].map(ram => (
                        <button
                          key={ram}
                          type="button"
                          onClick={() => { setForm({ ...form, ram_gb: ram }); setCustomRamActive(false); }}
                          className={`py-2.5 rounded-lg font-mono text-xs transition border ${
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
                        className={`py-2.5 rounded-lg font-mono text-xs transition border ${
                          customRamActive ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs' : 'bg-card text-muted-foreground border-border hover:bg-accent'
                        }`}
                      >
                        {t('wizard.custom')}
                      </button>
                    </div>
                    {customRamActive && (
                      <div className="pt-2 flex items-center gap-2 border-t border-border/50 animate-fade-in">
                        <span className="text-[11px] text-muted-foreground font-mono">{t('wizard.ramCustom')}</span>
                        <Input type="number" min="1" max="128" value={form.ram_gb} onChange={e => setForm({ ...form, ram_gb: Math.max(1, parseInt(e.target.value) || 1) })} className="h-8 w-32 text-xs font-mono" autoFocus />
                        <span className="text-[11px] font-mono text-muted-foreground">GB</span>
                      </div>
                    )}
                  </div>

                  {/* CPU */}
                  <div className="space-y-3 bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-bold text-foreground">
                        <Cpu className="size-4 text-amber-400" />
                        {t('wizard.cpuLabel')}
                      </span>
                      <span className="font-mono text-amber-400 font-bold">{t('wizard.coreValue', { n: form.cpu_cores })}</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {[1, 2, 4, 8].map(core => (
                        <button
                          key={core}
                          type="button"
                          onClick={() => { setForm({ ...form, cpu_cores: core }); setCustomCpuActive(false); }}
                          className={`py-2.5 rounded-lg font-mono text-xs transition border ${
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
                        className={`py-2.5 rounded-lg font-mono text-xs transition border ${
                          customCpuActive ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs' : 'bg-card text-muted-foreground border-border hover:bg-accent'
                        }`}
                      >
                        {t('wizard.custom')}
                      </button>
                    </div>
                    {customCpuActive && (
                      <div className="pt-2 flex items-center gap-2 border-t border-border/50 animate-fade-in">
                        <span className="text-[11px] text-muted-foreground font-mono">{t('wizard.cpuCustom')}</span>
                        <Input type="number" min="1" max="64" value={form.cpu_cores} onChange={e => setForm({ ...form, cpu_cores: Math.max(1, parseInt(e.target.value) || 1) })} className="h-8 w-32 text-xs font-mono" autoFocus />
                        <span className="text-[11px] font-mono text-muted-foreground">Cores</span>
                      </div>
                    )}
                  </div>

                  {/* DISK */}
                  <div className="space-y-3 bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2 font-bold text-foreground">
                        <HardDrive className="size-4 text-cyan-400" />
                        {t('wizard.diskLabel')}
                      </span>
                      <span className="font-mono text-cyan-400 font-bold">{t('wizard.diskValue', { n: form.disk_gb })}</span>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                      {[10, 20, 50, 100].map(disk => (
                        <button
                          key={disk}
                          type="button"
                          onClick={() => { setForm({ ...form, disk_gb: disk }); setCustomDiskActive(false); }}
                          className={`py-2.5 rounded-lg font-mono text-xs transition border ${
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
                        className={`py-2.5 rounded-lg font-mono text-xs transition border ${
                          customDiskActive ? 'bg-primary text-primary-foreground font-bold border-primary shadow-xs' : 'bg-card text-muted-foreground border-border hover:bg-accent'
                        }`}
                      >
                        {t('wizard.custom')}
                      </button>
                    </div>
                    {customDiskActive && (
                      <div className="pt-2 flex items-center gap-2 border-t border-border/50 animate-fade-in">
                        <span className="text-[11px] text-muted-foreground font-mono">{t('wizard.diskCustom')}</span>
                        <Input type="number" min="5" max="2000" value={form.disk_gb} onChange={e => setForm({ ...form, disk_gb: Math.max(5, parseInt(e.target.value) || 5) })} className="h-8 w-32 text-xs font-mono" autoFocus />
                        <span className="text-[11px] font-mono text-muted-foreground">GB</span>
                      </div>
                    )}
                  </div>

                  {/* STORAGE / NETWORK */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2 bg-card border border-border rounded-2xl p-4">
                      <label className="block text-foreground font-bold flex items-center gap-2">
                        <HardDrive className="size-4 text-cyan-400" />
                        {t('wizard.storagePool')}
                      </label>
                      <Select value={form.storage_pool} onChange={(e) => setForm({ ...form, storage_pool: e.target.value })} className="h-9">
                        {(storagePools.length ? storagePools : [{ name: 'default', driver: 'dir' }]).map(p => (
                          <option key={p.name} value={p.name}>{p.name} ({p.driver})</option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2 bg-card border border-border rounded-2xl p-4">
                      <label className="block text-foreground font-bold flex items-center gap-2">
                        <Network className="size-4 text-emerald-400" />
                        {t('wizard.networkBridge')}
                      </label>
                      <Select value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value })} className="h-9">
                        {(networks.length ? networks : [{ name: 'lxdbr0', type: 'bridge' }]).map(n => (
                          <option key={n.name} value={n.name}>{n.name} ({n.type})</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: SSH KEYS */}
              {step === 4 && (
                <div className="space-y-5 text-sm font-sans animate-fade-in">
                  <div className="space-y-1">
                    <SectionLabel icon={<Key className="size-4 text-amber-400" />}>{t('wizard.sshKey')}</SectionLabel>
                    <p className="text-xs text-muted-foreground">{t('wizard.sshKeyDesc')}</p>
                  </div>

                  <div className="space-y-2.5 max-h-[50vh] overflow-y-auto pr-1">
                    <div
                      onClick={() => setForm({ ...form, ssh_key: '' })}
                      className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
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
                        className={`p-4 rounded-2xl border transition cursor-pointer flex items-center justify-between ${
                          form.ssh_key === k.public_key ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                        }`}
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="font-bold text-foreground font-mono flex items-center gap-2">
                            <span>🔑 {k.name}</span>
                          </p>
                          <p className="text-[11px] font-mono text-muted-foreground truncate">{k.public_key}</p>
                        </div>
                        {form.ssh_key === k.public_key && <Check className="size-4 text-primary shrink-0" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 5: TEMPLATES */}
              {step === 5 && (
                <div className="space-y-5 text-sm font-sans animate-fade-in">
                  <div className="space-y-1">
                    <SectionLabel icon={<Sparkles className="size-4 text-primary" />}>{t('wizard.template')}</SectionLabel>
                    <p className="text-xs text-muted-foreground">{t('wizard.templateDesc')}</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {appTemplates.map(tpl => (
                      <div
                        key={tpl.id}
                        onClick={() => setForm({ ...form, template_preset: tpl.id })}
                        className={`p-4 rounded-2xl border transition cursor-pointer flex items-center gap-3 ${
                          form.template_preset === tpl.id ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary' : 'border-border bg-background hover:bg-accent'
                        }`}
                      >
                        <div className="size-11 rounded-xl bg-background border border-border flex items-center justify-center text-xl shrink-0">{tpl.icon}</div>
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-bold text-foreground text-sm">{tpl.title}</p>
                          <p className="text-[11px] text-muted-foreground">{tpl.desc}</p>
                        </div>
                        {form.template_preset === tpl.id && <Check className="size-5 text-primary shrink-0 ml-auto" />}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 6: REVIEW + ADVANCED */}
              {step === 6 && (
                <form id="create-lxd-form" onSubmit={handleSubmit} className="space-y-6 text-sm font-sans animate-fade-in">
                  <div className="space-y-1">
                    <SectionLabel icon={<ShieldCheck className="size-4 text-emerald-400" />}>{t('wizard.review')}</SectionLabel>
                    <p className="text-xs text-muted-foreground">{t('wizard.reviewDesc')}</p>
                  </div>

                  <div className="p-5 bg-card rounded-2xl border border-border space-y-2.5 font-mono text-xs shadow-inner">
                    <div className="flex justify-between border-b border-border/50 pb-2">
                      <span className="text-muted-foreground">{t('wizard.containerName')}</span>
                      <span className="text-primary font-bold text-sm">{form.name}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-2">
                      <span className="text-muted-foreground">{t('wizard.targetNode')}</span>
                      <span className="text-foreground font-bold">{targetNodeName} ({targetNode?.ip || '127.0.0.1'})</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-2">
                      <span className="text-muted-foreground">{t('wizard.osLabel')}</span>
                      <span className="text-foreground">{form.image}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-2">
                      <span className="text-muted-foreground">{t('wizard.instanceTypeLabel')}</span>
                      <span className="text-foreground font-bold">{form.type === 'virtual-machine' ? t('wizard.vm') : t('wizard.container')}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-2">
                      <span className="text-muted-foreground">{t('wizard.storageNetwork')}</span>
                      <span className="text-cyan-400 font-bold">{form.storage_pool || 'default'} / {form.network || 'lxdbr0'}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-2">
                      <span className="text-muted-foreground">{t('wizard.hwSpecs')}</span>
                      <span className="text-emerald-400 font-bold">{form.ram_gb} GB RAM | {form.cpu_cores} Cores | {form.disk_gb} GB Storage</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 py-2">
                      <span className="text-muted-foreground">{t('wizard.templatePreset')}</span>
                      <span className="text-amber-400 font-bold">{form.template_preset.toUpperCase()}</span>
                    </div>
                    <div className="flex justify-between pt-2">
                      <span className="text-muted-foreground">{t('wizard.sshAuthorized')}</span>
                      <span className={form.ssh_key ? 'text-cyan-400 font-bold' : 'text-muted-foreground'}>
                        {form.ssh_key ? `${t('wizard.injected')} ✓` : t('wizard.passwordOnly')}
                      </span>
                    </div>
                  </div>

                  {/* Autostart */}
                  <div className="space-y-3 bg-card border border-border rounded-2xl p-4">
                    <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest font-bold flex items-center gap-2">
                      <Rocket className="size-3.5" /> {t('wizard.autostart')}
                    </p>
                    <label htmlFor="chk_wizard_autostart" className="flex items-start gap-3 cursor-pointer">
                      <input id="chk_wizard_autostart" type="checkbox" checked={form.autostart} onChange={(e) => setForm({ ...form, autostart: e.target.checked })} className="accent-primary size-4 mt-0.5 shrink-0" />
                      <span className="space-y-1">
                        <span className="block text-xs font-semibold text-foreground">{t('wizard.autostart')}</span>
                        <span className="block text-[11px] text-muted-foreground leading-relaxed">{t('wizard.autostartHint')}</span>
                      </span>
                    </label>
                  </div>

                  {/* Advanced Options */}
                  <div className="space-y-3 bg-card border border-border rounded-2xl p-4">
                    <div className="flex items-center gap-2">
                      <Settings2 className="size-4 text-muted-foreground" />
                      <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-widest font-bold">{t('wizard.advanced')}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{t('wizard.advancedDesc')}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <AdvancedToggle
                        id="chk_wizard_nesting"
                        checked={form.nesting}
                        onChange={(e) => setForm({ ...form, nesting: e.target.checked })}
                        label={t('wizard.nesting')}
                        desc={t('wizard.nestingDesc')}
                      />
                      <AdvancedToggle
                        id="chk_wizard_privileged"
                        checked={form.privileged}
                        onChange={(e) => setForm({ ...form, privileged: e.target.checked })}
                        label={t('wizard.privileged')}
                        desc={t('wizard.privilegedDesc')}
                      />
                      <AdvancedToggle
                        id="chk_wizard_swap"
                        checked={form.memory_swap}
                        onChange={(e) => setForm({ ...form, memory_swap: e.target.checked })}
                        label={t('wizard.memorySwap')}
                        desc={t('wizard.memorySwapDesc')}
                      />
                      <div className="rounded-xl border border-border bg-background p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="inp_wizard_cpu_allow" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <Gauge className="size-3.5 text-muted-foreground" /> {t('wizard.cpuAllowance')}
                          </label>
                          {form.cpu_allowance && <Badge variant="success">{form.cpu_allowance}</Badge>}
                        </div>
                        <Input
                          id="inp_wizard_cpu_allow"
                          type="text"
                          placeholder={t('wizard.cpuAllowancePlaceholder')}
                          value={form.cpu_allowance}
                          onChange={(e) => setForm({ ...form, cpu_allowance: e.target.value })}
                          className="h-8 text-xs font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{t('wizard.cpuAllowanceDesc')}</p>
                      </div>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* ── FOOTER ─────────────────────────────────────────────────────────────── */}
          <footer className="shrink-0 border-t border-border bg-card/70 backdrop-blur px-4 sm:px-8 py-4 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => (step > 1 ? setStep(step - 1) : onClose())} disabled={isDeploying}>
              <ArrowLeft className="size-4 mr-1.5" />
              {step > 1 ? t('wizard.back') : t('common.cancel')}
            </Button>

            <div className="hidden sm:block text-[11px] font-mono text-muted-foreground text-center">
              {t('wizard.stepOf', { current: step, total: 6, title: stepTitles[step] })}
            </div>

            {step < 6 ? (
              <Button onClick={handleNext} disabled={isDeploying} size="lg">
                <span>{nextLabels[step]}</span>
                <ArrowRight className="size-4 ml-1.5" />
              </Button>
            ) : (
              <Button type="submit" form="create-lxd-form" size="lg" disabled={isDeploying} className="font-bold">
                {isDeploying ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <Rocket className="size-4 mr-1.5" />}
                {isDeploying ? t('wizard.deployingBtn') : t('wizard.deploy')}
              </Button>
            )}
          </footer>
        </>
      )}
    </div>
  );
}

export default CreateLXDModal;
