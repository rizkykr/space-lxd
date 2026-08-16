import React, { useState } from 'react';
import { Card, Button, Input } from '../components/ui/primitives';
import { useI18n } from '../i18n';
import { useTheme } from '../theme';
import { AlertCircle, Loader2, Globe, Sun, Moon, Monitor } from 'lucide-react';

export function LoginPage({ onLoginSuccess }) {
  const { lang, setLanguage, t } = useI18n();
  const { theme, setTheme } = useTheme();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        const data = await res.json();
        onLoginSuccess(data.token, data.user);
      } else {
        const errText = await res.text();
        setError(errText || t('auth.login.incorrect'));
      }
    } catch (e) {
      setError(t('auth.login.errConn', { msg: e.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl border-border relative">
        {/* Language & Theme switcher top right */}
        <div className="absolute top-4 right-4 flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border border-border">
            <button
              type="button"
              onClick={() => setLanguage('en')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
                lang === 'en'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLanguage('id')}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${
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
              onClick={() => setTheme('system')}
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
              onClick={() => setTheme('dark')}
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
              onClick={() => setTheme('light')}
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

        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-primary/10 border border-primary/20 text-primary text-2xl shadow">
            🪐
          </div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">
            {t('auth.login.title')}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t('auth.login.subtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs font-mono">
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-foreground font-medium mb-1">
              {t('auth.login.username')}
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
              {t('auth.login.password')}
            </label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" className="w-full font-semibold" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                <span>{t('common.loading')}</span>
              </>
            ) : (
              <span>{t('auth.login.signIn')}</span>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default LoginPage;
