import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Select, Input } from '../components/ui/primitives';
import { Globe, Sliders, Server, Save, AlertTriangle, CheckCircle2, Languages } from 'lucide-react';
import { useI18n } from '../i18n';

export function SettingsPage() {
  const { addToast } = useOutletContext();
  const { lang, setLanguage, t } = useI18n();
  const [activeTab, setActiveTab] = useState('system');
  const [loading, setLoading] = useState(false);

  const [settings, setSettings] = useState({
    master_public_url: window.location.origin,
    global_timezone: 'Asia/Jakarta',
    default_ram_gb: '2',
    default_cpu_cores: '2',
    default_disk_gb: '20',
    language: lang || 'en'
  });

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(prev => ({
          ...prev,
          ...data,
          master_public_url: data.master_public_url || window.location.origin,
          language: data.language || lang || 'en'
        }));
        if (data.language && data.language !== lang) {
          setLanguage(data.language);
        }
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
        addToast('success', t('settings.saved'));
        if (settings.language && settings.language !== lang) {
          setLanguage(settings.language);
        }
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
          <span>{t('settings.title')}</span>
          <Badge variant="success">{t('settings.engineOnline')}</Badge>
        </h1>
        <p className="text-xs text-muted-foreground">{t('settings.subtitle')}</p>
      </div>

      {/* Domain Match Warning Banner */}
      {!isDomainMatching && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-xs flex items-start gap-3 shadow-md">
          <AlertTriangle className="size-5 shrink-0 text-amber-400 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-200">⚠️ {t('settings.domainWarning')}</p>
            <p className="text-[11px] text-amber-300/80 font-sans">
              {t('settings.domainMismatch', { origin: currentOrigin, url: settings.master_public_url })}
            </p>
            <div className="pt-1 flex items-center gap-2 font-sans">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] border-amber-500/40 hover:bg-amber-500/20 text-amber-200"
                onClick={() => setSettings({ ...settings, master_public_url: currentOrigin })}
              >
                {t('settings.useCurrent', { url: currentOrigin })}
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
            <span>{t('settings.tabSystem')}</span>
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
            <span>{t('settings.tabTimezone')}</span>
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
            <span>{t('settings.tabResources')}</span>
          </button>

          <button
            onClick={() => setActiveTab('language')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-all ${
              activeTab === 'language'
                ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
            }`}
          >
            <Languages className="size-4 shrink-0 text-emerald-400" />
            <span>{t('settings.languageTitle')}</span>
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
                  <span>{t('settings.systemTitle')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t('settings.systemDesc')}
                </p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-5 text-xs font-sans">
                <div className="space-y-1.5 max-w-lg">
                  <label className="block text-foreground font-semibold">{t('settings.systemUrl')}</label>
                  <Input
                    type="url"
                    placeholder={t('settings.systemPlaceholder')}
                    value={settings.master_public_url}
                    onChange={e => setSettings({ ...settings, master_public_url: e.target.value })}
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t('settings.systemNote')}
                  </p>
                </div>

                {/* Live Domain Validation Card */}
                <div className={`p-4 rounded-lg border font-mono text-xs space-y-2 ${isDomainMatching ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'}`}>
                  <div className="flex items-center gap-2">
                    {isDomainMatching ? (
                      <>
                        <CheckCircle2 className="size-4 text-emerald-400" />
                        <span className="font-bold text-emerald-200">{t('settings.domainSuccess')}</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="size-4 text-amber-400" />
                        <span className="font-bold text-amber-200">{t('settings.domainWarning')}</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] font-sans opacity-90">
                    {isDomainMatching
                      ? t('settings.domainMatch', { origin: currentOrigin })
                      : t('settings.domainMismatch', { origin: currentOrigin, url: settings.master_public_url })}
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={loading}>
                    <Save className="size-4 mr-1.5" />
                    <span>{t('settings.saveEndpoint')}</span>
                  </Button>
                </div>
              </form>

              {/* System Architecture Info */}
              <div className="pt-4 border-t border-border space-y-3">
                <h3 className="text-xs font-bold text-muted-foreground uppercase font-mono tracking-wider">{t('settings.sysArch')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
                  <div className="p-3 bg-background rounded-lg border border-border space-y-1">
                    <p className="text-[11px] text-muted-foreground uppercase">{t('settings.dbEngine')}</p>
                    <p className="text-sm font-bold text-emerald-400">{t('settings.dbValue')}</p>
                  </div>
                  <div className="p-3 bg-background rounded-lg border border-border space-y-1">
                    <p className="text-[11px] text-muted-foreground uppercase">{t('settings.agentTunnel')}</p>
                    <p className="text-sm font-bold text-cyan-400">{t('settings.tunnelValue')}</p>
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
                  <span>{t('settings.timezoneTitle')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t('settings.timezoneDesc')}
                </p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-5 text-xs font-sans">
                <div className="space-y-1.5 max-w-md">
                  <label className="block text-foreground font-semibold">{t('settings.timezoneLabel')}</label>
                  <Select
                    value={settings.global_timezone}
                    onChange={e => setSettings({ ...settings, global_timezone: e.target.value })}
                  >
                    {timezoneOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {t('settings.timezoneCurrent', { tz: settings.global_timezone })}
                  </p>
                </div>

                <div className="p-4 bg-background border border-border rounded-lg space-y-2 font-mono text-xs">
                  <p className="text-foreground font-bold flex items-center gap-2">
                    <span>💡 {t('settings.timezoneNote')}</span>
                  </p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-1 font-sans text-[11px]">
                    <li>{t('settings.timezoneNote1', { tz: settings.global_timezone })}</li>
                    <li>{t('settings.timezoneNote2', { tz: settings.global_timezone })}</li>
                    <li>{t('settings.timezoneNote3')}</li>
                  </ul>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={loading}>
                    <Save className="size-4 mr-1.5" />
                    <span>{t('settings.saveTimezone')}</span>
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
                  <span>{t('settings.resourcesTitle')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{t('settings.resourcesDesc')}</p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4 text-xs font-sans max-w-md">
                <div>
                  <label className="block text-foreground font-medium mb-1">{t('settings.ramLabel')}</label>
                  <Select
                    value={settings.default_ram_gb}
                    onChange={e => setSettings({ ...settings, default_ram_gb: e.target.value })}
                  >
                    <option value="1">1 GB RAM</option>
                    <option value="2">2 GB RAM</option>
                    <option value="4">4 GB RAM</option>
                    <option value="8">8 GB RAM</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-foreground font-medium mb-1">{t('settings.cpuLabel')}</label>
                  <Select
                    value={settings.default_cpu_cores}
                    onChange={e => setSettings({ ...settings, default_cpu_cores: e.target.value })}
                  >
                    <option value="1">1 Core CPU</option>
                    <option value="2">2 Cores CPU</option>
                    <option value="4">4 Cores CPU</option>
                  </Select>
                </div>

                <div>
                  <label className="block text-foreground font-medium mb-1">{t('settings.diskLabel')}</label>
                  <Select
                    value={settings.default_disk_gb}
                    onChange={e => setSettings({ ...settings, default_disk_gb: e.target.value })}
                  >
                    <option value="10">10 GB Storage</option>
                    <option value="20">20 GB Storage</option>
                    <option value="50">50 GB Storage</option>
                    <option value="100">100 GB Storage</option>
                  </Select>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={loading}>
                    <Save className="size-4 mr-1.5" />
                    <span>{t('settings.saveResources')}</span>
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* TAB 4: LANGUAGE & LOCALIZATION */}
          {activeTab === 'language' && (
            <Card className="p-6 space-y-5">
              <div className="border-b border-border pb-4">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Languages className="size-5 text-emerald-400" />
                  <span>{t('settings.languageTitle')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{t('setup.language.desc')}</p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4 text-xs font-sans max-w-md">
                <div className="space-y-3">
                  <div
                    onClick={() => {
                      setSettings({ ...settings, language: 'en' });
                      setLanguage('en');
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      (settings.language || lang) === 'en'
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🇬🇧</span>
                      <div>
                        <div className="font-bold text-foreground">{t('setup.language.english')}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">English (Default)</div>
                      </div>
                    </div>
                    {(settings.language || lang) === 'en' && <Badge variant="info">Active</Badge>}
                  </div>

                  <div
                    onClick={() => {
                      setSettings({ ...settings, language: 'id' });
                      setLanguage('id');
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      (settings.language || lang) === 'id'
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary'
                        : 'border-border bg-background hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🇮🇩</span>
                      <div>
                        <div className="font-bold text-foreground">{t('setup.language.indonesian')}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">Bahasa Indonesia</div>
                      </div>
                    </div>
                    {(settings.language || lang) === 'id' && <Badge variant="info">Active</Badge>}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button type="submit" disabled={loading}>
                    <Save className="size-4 mr-1.5" />
                    <span>{t('common.save')}</span>
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

export default SettingsPage;
