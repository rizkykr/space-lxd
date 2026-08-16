import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Badge } from '../ui/primitives';
import {
  LogOut, ArrowUpCircle, CheckCircle2, Loader2, X,
  Sun, Moon, Monitor, Menu, ChevronDown, Check
} from 'lucide-react';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme';

export function TopHeader({ user, nodesCount = 0, onLogout, onToggleMobileNav }) {
  const { t } = useI18n();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const location = useLocation();

  const [versionInfo, setVersionInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateLogs, setUpdateLogs] = useState([]);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  // Theme dropdown open/close state
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const themeRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (themeRef.current && !themeRef.current.contains(e.target)) {
        setThemeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetchVersionInfo();
    const interval = setInterval(fetchVersionInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchVersionInfo = async () => {
    try {
      const res = await fetch('/api/system/version');
      if (res.ok) {
        const data = await res.json();
        setVersionInfo(data);
      }
    } catch (e) {
      console.error('Failed to check version:', e);
    }
  };

  const handleStartUpdate = async () => {
    setUpdating(true);
    setUpdateLogs([t('header.commence')]);
    setUpdateSuccess(false);

    try {
      const res = await fetch('/api/system/update', { method: 'POST' });
      if (!res.body) {
        setUpdateLogs((prev) => [...prev, `❌ ${t('header.failedStream')}`]);
        setUpdating(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let hasError = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            if (trimmed.startsWith('❌') || trimmed.includes('Error:') || trimmed.includes('failed:')) {
              hasError = true;
            }
            setUpdateLogs((prev) => [...prev, trimmed]);
          }
        }
      }
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('❌') || trimmed.includes('Error:') || trimmed.includes('failed:')) {
          hasError = true;
        }
        setUpdateLogs((prev) => [...prev, trimmed]);
      }

      if (!hasError) {
        setUpdateSuccess(true);
        setTimeout(() => {
          window.location.href = window.location.pathname + '?_t=' + Date.now();
        }, 3500);
      } else {
        setUpdateSuccess(false);
      }
    } catch (e) {
      setUpdateLogs((prev) => [...prev, `❌ Error: ${e.message}`]);
      setUpdateSuccess(false);
    } finally {
      setUpdating(false);
    }
  };

  // Determine dynamic page title
  const getPageTitle = () => {
    const p = location.pathname;
    if (p === '/') return t('nav.dashboard');
    if (p === '/monitoring') return t('nav.monitoring');
    if (p === '/nodes') return t('nav.nodes');
    if (p.startsWith('/nodes/')) return t('nav.nodes');
    if (p.startsWith('/lxds/')) return 'LXD Container';
    if (p === '/templates') return t('nav.templates');
    if (p === '/logs') return t('nav.logs');
    if (p === '/profile') return t('nav.profile');
    if (p === '/settings') return t('nav.settings');
    return 'Space LXD';
  };

  return (
    <>
      <header className="h-16 px-4 sm:px-6 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-20">
        {/* Left Side: Mobile Menu Button & Current Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileNav}
            className="md:hidden p-2 rounded-lg border border-border text-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Toggle navigation drawer"
          >
            <Menu className="size-4" />
          </button>

          <div className="flex items-center gap-2 truncate">
            <span className="font-bold text-sm sm:text-base text-foreground tracking-tight truncate">
              {getPageTitle()}
            </span>
          </div>

          {versionInfo?.has_update && (
            <button
              onClick={() => setShowUpdateModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full hover:bg-amber-500/20 transition-all animate-pulse truncate shrink-0 ml-2"
            >
              <ArrowUpCircle className="size-3.5 shrink-0" />
              <span>{t('header.updateAvailable', { v: versionInfo.latest_commit })}</span>
            </button>
          )}
        </div>

        {/* Right Side: Theme Dropdown, Refresh, User & Logout */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {versionInfo?.has_update && (
            <button
              onClick={() => setShowUpdateModal(true)}
              className="sm:hidden p-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg hover:bg-amber-500/20 transition-all animate-pulse"
              title={t('header.updateAvailable', { v: versionInfo.latest_commit })}
            >
              <ArrowUpCircle className="size-4" />
            </button>
          )}

          {/* Theme Switcher: Sleek Single Dropdown */}
          <div className="relative" ref={themeRef}>
            <button
              type="button"
              onClick={() => setThemeDropdownOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-secondary/50 hover:bg-secondary text-foreground text-xs font-medium transition-colors"
              title={t('theme.switch')}
            >
              {theme === 'dark' ? (
                <Moon className="size-3.5 text-primary" />
              ) : theme === 'light' ? (
                <Sun className="size-3.5 text-amber-400" />
              ) : (
                <Monitor className="size-3.5 text-cyan-400" />
              )}
              <span className="hidden sm:inline capitalize font-sans text-xs">
                {theme === 'system' ? 'Auto' : theme}
              </span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>

            {themeDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-36 rounded-lg border border-border bg-card p-1 shadow-xl z-50 animate-fade-in text-xs font-sans">
                <button
                  type="button"
                  onClick={() => { setTheme('system'); setThemeDropdownOpen(false); }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                    theme === 'system' ? 'bg-secondary text-primary font-bold' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Monitor className="size-3.5 text-cyan-400" />
                    <span>{t('theme.system')}</span>
                  </div>
                  {theme === 'system' && <Check className="size-3 text-primary" />}
                </button>

                <button
                  type="button"
                  onClick={() => { setTheme('dark'); setThemeDropdownOpen(false); }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                    theme === 'dark' ? 'bg-secondary text-primary font-bold' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Moon className="size-3.5 text-primary" />
                    <span>{t('theme.dark')}</span>
                  </div>
                  {theme === 'dark' && <Check className="size-3 text-primary" />}
                </button>

                <button
                  type="button"
                  onClick={() => { setTheme('light'); setThemeDropdownOpen(false); }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors ${
                    theme === 'light' ? 'bg-secondary text-primary font-bold' : 'text-foreground hover:bg-accent'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="size-3.5 text-amber-400" />
                    <span>{t('theme.light')}</span>
                  </div>
                  {theme === 'light' && <Check className="size-3 text-primary" />}
                </button>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-border mx-0.5 hidden sm:block"></div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-mono text-foreground font-bold hidden sm:inline">{user?.username || 'admin'}</span>
            <Button variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground hover:text-destructive" onClick={onLogout} title={t('header.logout')}>
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Auto-Update Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl relative animate-fade-in">
            <button
              onClick={() => !updating && setShowUpdateModal(false)}
              disabled={updating}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <ArrowUpCircle className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-lg text-foreground">{t('header.autoUpdate')}</h3>
                <p className="text-xs text-muted-foreground font-mono">
                  {t('header.latestCommit', { v: versionInfo?.latest_commit || 'main' })}
                </p>
              </div>
            </div>

            {versionInfo?.commit_message && (
              <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-xs font-mono text-muted-foreground">
                <span className="text-foreground font-semibold">{t('header.releaseNote')}: </span>
                {versionInfo.commit_message}
              </div>
            )}

            {updateLogs.length > 0 && (
              <div className="bg-black/80 rounded-lg p-3 border border-border font-mono text-xs h-40 overflow-y-auto space-y-1 text-zinc-300">
                {updateLogs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {log}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowUpdateModal(false)}
                disabled={updating}
              >
                {t('header.close')}
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={handleStartUpdate}
                disabled={updating || updateSuccess}
                className="bg-amber-500 hover:bg-amber-600 text-black font-semibold"
              >
                {updating ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    <span>{t('header.updating')}</span>
                  </>
                ) : updateSuccess ? (
                  <>
                    <CheckCircle2 className="size-3.5 mr-1.5 text-emerald-950" />
                    <span>{t('header.reloading')}</span>
                  </>
                ) : (
                  <>
                    <ArrowUpCircle className="size-3.5 mr-1.5" />
                    <span>{t('header.updateNow')}</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default TopHeader;
