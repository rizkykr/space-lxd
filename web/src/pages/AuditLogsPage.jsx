import React, { useState, useEffect } from 'react';
import { Card, Badge, Select } from '../components/ui/primitives';

export function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [filterAction, setFilterAction] = useState('ALL');

  useEffect(() => {
    fetch('/api/logs')
      .then(r => r.json())
      .then(data => Array.isArray(data) && setLogs(data))
      .catch(console.error);
  }, []);

  const filteredLogs = filterAction === 'ALL' ? logs : logs.filter(l => l.action === filterAction);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Cluster Audit & Event Logs</h1>
          <p className="text-xs text-muted-foreground">Jejak audit otomatis seluruh aktivitas kluster, pembuatan node, dan manajemen LXD</p>
        </div>

        <Select
          value={filterAction}
          onChange={e => setFilterAction(e.target.value)}
          className="w-auto"
        >
          <option value="ALL">🌐 All Event Actions ({logs.length})</option>
          <option value="USER_SETUP">USER_SETUP</option>
          <option value="NODE_JOIN">NODE_JOIN</option>
          <option value="PASSWORD_CHANGE">PASSWORD_CHANGE</option>
          <option value="ADD_SSH_KEY">ADD_SSH_KEY</option>
        </Select>
      </div>

      <Card className="overflow-hidden font-mono text-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] text-muted-foreground uppercase tracking-wider bg-background">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Action Event</th>
                <th className="py-3 px-4">Target / Entity</th>
                <th className="py-3 px-4">Detail Description</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-10 text-muted-foreground">
                    Belum ada data audit log tercatat.
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
