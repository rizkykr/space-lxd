import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input, Select, Badge } from '../components/ui/primitives';
import { useI18n } from '../i18n';
import { useTheme } from '../theme';
import {
  Globe,
  User,
  Server,
  Clock,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Check,
  Palette,
  Sun,
  Moon,
  Monitor
} from 'lucide-react';

const TIMEZONE_OPTIONS = [
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

export function SetupPage({ onSetupComplete }) {
  const navigate = useNavigate();
  const { lang, setLanguage, t } = useI18n();
  const { theme, setTheme } = useTheme();

  const [step, setStep] = useState(1);
  const totalSteps = 6;

  const [form, setForm] = useState({
    username: 'admin',
    password: '',
    confirmPassword: '',
    master_public: window.location.origin,
    language: lang || 'en',
    theme: theme || 'system',
    timezone: 'Asia/Jakarta',
    default_ram_gb: '2',
    default_cpu_cores: '2',
    default_disk_gb: '20'
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const currentOrigin = window.location.origin;

  const handleLanguageChange = (newLang) => {
    setLanguage(newLang);
    setForm((prev) => ({ ...prev, language: newLang }));
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    setForm((prev) => ({ ...prev, theme: newTheme }));
  };

  const validateStep = () => {
    setErrorMsg('');
    if (step === 2) {
      if (!form.username.trim()) {
        setErrorMsg(t('setup.account.username') + ' is required');
        return false;
      }
      if (!form.password) {
        setErrorMsg(t('setup.account.password') + ' is required');
        return false;
      }
      if (form.password !== form.confirmPassword) {
        setErrorMsg(t('setup.account.passwordMismatch'));
        return false;
      }
    }
    if (step === 3) {
      if (!form.master_public.trim()) {
        setErrorMsg(t('setup.endpoint.url') + ' is required');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      if (step < totalSteps) {
        setStep(step + 1);
      }
    }
  };

  const handleBack = () => {
    setErrorMsg('');
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!validateStep()) return;

    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        username: form.username.trim(),
        password: form.password,
        master_public: form.master_public.trim().replace(/\/$/, ''),
        language: form.language || lang,
        theme: form.theme || theme,
        timezone: form.timezone,
        default_ram_gb: form.default_ram_gb,
        default_cpu_cores: form.default_cpu_cores,
        default_disk_gb: form.default_disk_gb
      };

      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(t('setup.success'));
        setTimeout(() => {
          onSetupComplete(data.token, data.user);
          navigate('/', { replace: true });
        }, 1000);
      } else {
        const errText = await res.text();
        setErrorMsg(errText || t('setup.errCreate'));
      }
    } catch (e) {
      setErrorMsg(t('setup.errConn', { msg: e.message }));
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = [
    t('setup.step.language'),
    t('setup.step.account'),
    t('setup.step.endpoint'),
    t('setup.step.timezone'),
    t('setup.step.resources'),
    t('setup.step.review')
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 sm:p-6">
      <Card className="max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border-border">
        {/* Wizard Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/50 pb-5">
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-2xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-xl shadow-xs shrink-0">
              🪐
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">
                {t('setup.wizard.title')}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t('setup.wizard.subtitle')}
              </p>
            </div>
          </div>

          {/* Language & Theme Quick Switcher */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  lang === 'en'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('id')}
                className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                  lang === 'id'
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ID
              </button>
            </div>

            <div className="flex items-center bg-secondary/50 p-1 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => handleThemeChange('system')}
                title={t('theme.system')}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-all flex items-center justify-center ${
                  theme === 'system'
                    ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Monitor className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                title={t('theme.dark')}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-all flex items-center justify-center ${
                  theme === 'dark'
                    ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Moon className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                title={t('theme.light')}
                className={`px-1.5 py-0.5 rounded text-[10px] transition-all flex items-center justify-center ${
                  theme === 'light'
                    ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sun className="size-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Stepper Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-primary font-bold">
              {t('setup.stepIndicator', { current: step, total: totalSteps })}
            </span>
            <span className="text-muted-foreground">{stepTitles[step - 1]}</span>
          </div>

          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden flex">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-full flex-1 transition-all duration-300 ${
                  i + 1 <= step ? 'bg-primary' : 'bg-transparent'
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-6 gap-1 pt-1 font-mono">
            {stepTitles.map((title, i) => {
              const stepNum = i + 1;
              const isCompleted = stepNum < step;
              const isCurrent = stepNum === step;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (stepNum < step) setStep(stepNum);
                  }}
                  disabled={stepNum > step}
                  className={`text-center py-1 rounded text-[10px] truncate transition-colors ${
                    isCurrent
                      ? 'text-primary font-bold bg-primary/10'
                      : isCompleted
                      ? 'text-foreground/80 hover:text-primary cursor-pointer'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                  }`}
                  title={title}
                >
                  {isCompleted ? `✓ ${stepNum}` : stepNum}. {title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Alert Messages */}
        {errorMsg && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-mono flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Step Content */}
        <div className="min-h-[220px] flex flex-col justify-center">
          {/* STEP 1: LANGUAGE & THEME */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Globe className="size-4 text-primary" />
                  <span>{t('setup.language.title')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{t('setup.language.desc')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleLanguageChange('en')}
                  className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                    lang === 'en'
                      ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary'
                      : 'bg-card border-border hover:bg-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🇬🇧</span>
                    <div>
                      <div className="text-xs font-bold text-foreground flex items-center gap-2">
                        <span>{t('setup.language.english')}</span>
                        <Badge variant="outline" className="text-[10px] py-0">Default</Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">English (United States)</div>
                    </div>
                  </div>
                  {lang === 'en' && <Check className="size-5 text-primary shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => handleLanguageChange('id')}
                  className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between ${
                    lang === 'id'
                      ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary'
                      : 'bg-card border-border hover:bg-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🇮🇩</span>
                    <div>
                      <div className="text-xs font-bold text-foreground">
                        {t('setup.language.indonesian')}
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono">Bahasa Indonesia</div>
                    </div>
                  </div>
                  {lang === 'id' && <Check className="size-5 text-primary shrink-0" />}
                </button>
              </div>

              {/* Theme Selector in Step 1 */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <Palette className="size-3.5 text-purple-400" />
                  <span>{t('theme.title')}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleThemeChange('system')}
                    className={`p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1.5 ${
                      theme === 'system'
                        ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary'
                        : 'bg-card border-border hover:bg-accent/50'
                    }`}
                  >
                    <Monitor className="size-4 text-primary" />
                    <span className="text-[11px] font-bold text-foreground">{t('theme.system')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange('dark')}
                    className={`p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1.5 ${
                      theme === 'dark'
                        ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary'
                        : 'bg-card border-border hover:bg-accent/50'
                    }`}
                  >
                    <Moon className="size-4 text-yellow-400" />
                    <span className="text-[11px] font-bold text-foreground">{t('theme.dark')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleThemeChange('light')}
                    className={`p-2.5 rounded-lg border text-center transition-all flex flex-col items-center gap-1.5 ${
                      theme === 'light'
                        ? 'bg-primary/10 border-primary shadow-xs ring-1 ring-primary'
                        : 'bg-card border-border hover:bg-accent/50'
                    }`}
                  >
                    <Sun className="size-4 text-amber-500" />
                    <span className="text-[11px] font-bold text-foreground">{t('theme.light')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: ADMIN ACCOUNT */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <User className="size-4 text-primary" />
                  <span>{t('setup.account.title')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{t('setup.account.desc')}</p>
              </div>

              <div className="space-y-3 font-mono text-xs pt-2">
                <div>
                  <label className="block text-foreground font-medium mb-1">
                    {t('setup.account.username')}
                  </label>
                  <Input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="admin"
                    required
                  />
                </div>
                <div>
                  <label className="block text-foreground font-medium mb-1">
                    {t('setup.account.password')}
                  </label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div>
                  <label className="block text-foreground font-medium mb-1">
                    {t('setup.account.confirmPassword')}
                  </label>
                  <Input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: MASTER PUBLIC ENDPOINT */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Server className="size-4 text-primary" />
                  <span>{t('setup.endpoint.title')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{t('setup.endpoint.desc')}</p>
              </div>

              <div className="space-y-3 font-mono text-xs pt-2">
                <div>
                  <label className="block text-foreground font-medium mb-1">
                    {t('setup.endpoint.url')}
                  </label>
                  <Input
                    type="url"
                    value={form.master_public}
                    onChange={(e) => setForm({ ...form, master_public: e.target.value })}
                    placeholder="http://192.168.1.100:9090 or https://lxd.domain.com"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground mt-1 font-sans">
                    {t('setup.endpoint.urlHelp')}
                  </p>
                </div>

                <div className="pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm({ ...form, master_public: currentOrigin })}
                    className="text-xs"
                  >
                    {t('setup.endpoint.useCurrent')} ({currentOrigin})
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: GLOBAL TIMEZONE */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  <span>{t('setup.timezone.title')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{t('setup.timezone.desc')}</p>
              </div>

              <div className="space-y-3 font-mono text-xs pt-2">
                <div>
                  <label className="block text-foreground font-medium mb-1">
                    {t('setup.timezone.select')}
                  </label>
                  <Select
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  >
                    {TIMEZONE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                  <p className="text-[11px] text-muted-foreground mt-1 font-sans">
                    {t('setup.timezone.note')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: DEFAULT LXD RESOURCES */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Sliders className="size-4 text-primary" />
                  <span>{t('setup.resources.title')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{t('setup.resources.desc')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs pt-2">
                <div>
                  <label className="block text-foreground font-medium mb-1">
                    {t('setup.resources.ram')}
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={form.default_ram_gb}
                    onChange={(e) => setForm({ ...form, default_ram_gb: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-foreground font-medium mb-1">
                    {t('setup.resources.cpu')}
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={form.default_cpu_cores}
                    onChange={(e) => setForm({ ...form, default_cpu_cores: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-foreground font-medium mb-1">
                    {t('setup.resources.disk')}
                  </label>
                  <Input
                    type="number"
                    min="5"
                    value={form.default_disk_gb}
                    onChange={(e) => setForm({ ...form, default_disk_gb: e.target.value })}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: REVIEW & FINISH */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="size-4 text-primary" />
                  <span>{t('setup.review.title')}</span>
                </h2>
                <p className="text-xs text-muted-foreground">{t('setup.review.desc')}</p>
              </div>

              <div className="p-4 rounded-xl bg-secondary/40 border border-border space-y-3 font-mono text-xs">
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-muted-foreground">{t('setup.review.language')}:</span>
                  <span className="font-semibold text-foreground uppercase">{form.language}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-muted-foreground">{t('theme.title')}:</span>
                  <span className="font-semibold text-foreground uppercase">{form.theme || theme}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-muted-foreground">{t('setup.review.admin')}:</span>
                  <span className="font-semibold text-foreground">{form.username}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-muted-foreground">{t('setup.review.endpoint')}:</span>
                  <span className="font-semibold text-foreground break-all text-right">{form.master_public}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-muted-foreground">{t('setup.review.timezone')}:</span>
                  <span className="font-semibold text-foreground">{form.timezone}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-muted-foreground">{t('setup.review.resources')}:</span>
                  <span className="font-semibold text-foreground">
                    {form.default_ram_gb} GB RAM / {form.default_cpu_cores} Cores / {form.default_disk_gb} GB Disk
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Wizard Footer Controls */}
        <div className="flex items-center justify-between pt-4 border-t border-border/50">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              disabled={loading}
              className="text-xs font-semibold"
            >
              <ArrowLeft className="size-3.5 mr-1.5" />
              <span>{t('setup.back')}</span>
            </Button>
          ) : (
            <div />
          )}

          {step < totalSteps ? (
            <Button
              type="button"
              onClick={handleNext}
              className="text-xs font-semibold"
            >
              <span>{t('setup.next')}</span>
              <ArrowRight className="size-3.5 ml-1.5" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  <span>{t('setup.finishing')}</span>
                </>
              ) : (
                <>
                  <Check className="size-4 mr-2" />
                  <span>{t('setup.finishBtn')}</span>
                </>
              )}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

export default SetupPage;
