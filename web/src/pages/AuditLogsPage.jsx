import React, { useState, useEffect } from 'react';
import { Card, Badge, Select } from '../components/ui/primitives';
import { useI18n } from '../i18n';

export function AuditLogsPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState([]);
  const [filterAction, setFilterAction] = useState('ALL');

  useEffect(() => {
    fetch('/api/logs')
      .then(r => r.json())
      .then(data => Array.isArray(data) && setLogs(data))
      .catch(console.error);
  }, []);

  const uniqueActions = ['ALL', ...Array.from(new Set(logs.map(l => l.action)))];
  const filteredLogs = filterAction === 'ALL' ? logs : logs.filter(l => l.action === filterAction);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">{t('logs.title')}</h1>
          <p className="text-xs text-muted-foreground">{t('logs.subtitle')}</p>
        </div>

        <Select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="w-full sm:w-auto"
        >
          {uniqueActions.map(act => (
            <option key={act} value={act}>
              {act === 'ALL' ? `🌐 ${t('logs.allActions', { n: logs.length })}` : act}
            </option>
          ))}
        </Select>
      </div>

      <Card className="overflow-hidden font-mono text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider bg-background">
                <th className="py-3 px-4">{t('logs.id')}</th>
                <th className="py-3 px-4">{t('logs.action')}</th>
                <th className="py-3 px-4">{t('logs.target')}</th>
                <th className="py-3 px-4">{t('logs.detail')}</th>
                <th className="py-3 px-4">{t('logs.timestamp')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-muted-foreground">
                    {t('logs.empty')}
                  </td>
                </tr>
              ) : (
                filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-accent/50 transition">
                    <td className="py-3 px-4 text-muted-foreground">#{log.id}</td>
                    <td className="py-3 px-4">
                      <Badge variant="secondary">{log.action}</Badge>
                    </td>
                    <td className="py-3 px-4 font-bold text-foreground">{log.target}</td>
                    <td className="py-3 px-4 text-muted-foreground">{log.detail}</td>
                    <td className="py-3 px-4 text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default AuditLogsPage;
