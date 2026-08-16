import React, { useState, useEffect } from 'react';
import { Button, Badge } from '../ui/primitives';
import { Plus, Server, LogOut, RefreshCw, ArrowUpCircle, CheckCircle2, Loader2, X, Globe } from 'lucide-react';
import { useI18n } from '../../i18n';

export function TopHeader({ user, nodesCount = 0, onOpenAddNode, onOpenCreateLXD, onLogout, onRefresh }) {
  const { lang, setLanguage, t } = useI18n();
  const [versionInfo, setVersionInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateLogs, setUpdateLogs] = useState([]);
  const [updateSuccess, setUpdateSuccess] = useState(false);

  useEffect(() => {
    fetchVersionInfo();
    const interval = setInterval(fetchVersionInfo, 30000); // Auto check version every 30 seconds
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

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) {
            setUpdateLogs((prev) => [...prev, line.trim()]);
          }
        }
      }
      if (buffer.trim()) {
        setUpdateLogs((prev) => [...prev, buffer.trim()]);
      }

      setUpdateSuccess(true);
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (e) {
      setUpdateLogs((prev) => [...prev, `❌ Error: ${e.message}`]);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <header className="h-16 px-6 border-b border-border bg-card/60 backdrop-blur flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold text-foreground">{t('header.master')}</span>
            <Badge variant="outline" className="ml-1">
              {t('header.nodes', { n: nodesCount })}
            </Badge>
          </div>

          {versionInfo?.has_update && (
            <button
              onClick={() => setShowUpdateModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full hover:bg-amber-500/20 transition-all animate-pulse"
            >
              <ArrowUpCircle className="size-3.5" />
              <span>{t('header.updateAvailable', { v: versionInfo.latest_commit })}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {/* Language Switcher */}
          <div className="flex items-center gap-1 bg-secondary/60 p-1 rounded-lg border border-border">
            <Globe className="size-3 text-muted-foreground ml-1" />
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

          <Button variant="outline" size="sm" onClick={onRefresh} title={t('header.refresh')}>
            <RefreshCw className="size-3.5 text-muted-foreground" />
          </Button>

          <Button variant="outline" size="sm" onClick={onOpenAddNode}>
            <Server className="size-3.5 text-cyan-400" />
            <span>{t('header.addNode')}</span>
          </Button>

          <Button variant="default" size="sm" onClick={onOpenCreateLXD}>
            <Plus className="size-3.5" />
            <span>{t('header.createLxd')}</span>
          </Button>

          <div className="h-4 w-px bg-border mx-1"></div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-foreground font-bold">{user?.username || 'admin'}</span>
            <Button variant="ghost" size="icon" onClick={onLogout} title={t('header.logout')}>
              <LogOut className="size-4 text-destructive" />
            </Button>
          </div>
        </div>
      </header>

      {/* Auto-Update Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full space-y-4 shadow-2xl relative">
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
