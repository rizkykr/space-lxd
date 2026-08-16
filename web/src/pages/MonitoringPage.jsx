import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Select } from '../components/ui/primitives';
import { SVGSparklineChart } from '../utils/SVGSparklineChart';
import { TerminalModal } from '../components/modals/TerminalModal';
import { LineChart, ChevronDown, ChevronUp, Terminal, Play, Square, Sliders } from 'lucide-react';
import { useI18n } from '../i18n';

export function MonitoringPage() {
  const { nodes, addToast } = useOutletContext();
  const navigate = useNavigate();
  const { t } = useI18n();

  const [selectedNodeId, setSelectedNodeId] = useState('all');
  const [expandedNodes, setExpandedNodes] = useState({});
  const [activeTerminalTarget, setActiveTerminalTarget] = useState(null);

  const [cpuHistory, setCpuHistory] = useState({});
  const [ramHistory, setRamHistory] = useState({});
  const [netHistory, setNetHistory] = useState({});
  const [netRate, setNetRate] = useState({});
  const prevNet = useRef({});

  // Drive charts from the realtime snapshot pushed by the master WebSocket (~2s).
  useEffect(() => {
    nodes.forEach(n => {
      const cpuVal = Math.max(0, Math.min(100, n.cpu_usage_pct || 0));
      const ramVal = n.ram_total_mb > 0 ? Math.max(0, Math.min(100, (n.ram_used_mb / n.ram_total_mb) * 100)) : 0;

      setCpuHistory(prev => ({ ...prev, [n.id]: [...(prev[n.id] || []), cpuVal].slice(-20) }));
      setRamHistory(prev => ({ ...prev, [n.id]: [...(prev[n.id] || []), ramVal].slice(-20) }));

      // Network rate (KB/s) from cumulative counter deltas across ~2s ticks.
      const rx = n.net_rx_bytes || 0;
      const tx = n.net_tx_bytes || 0;
      const prevRx = prevNet.current[n.id]?.rx ?? rx;
      const prevTx = prevNet.current[n.id]?.tx ?? tx;
      const rate = (Math.max(0, rx - prevRx) + Math.max(0, tx - prevTx)) / 2048;
      prevNet.current[n.id] = { rx, tx };

      setNetRate(prev => ({ ...prev, [n.id]: rate }));
      setNetHistory(prev => ({ ...prev, [n.id]: [...(prev[n.id] || []), rate].slice(-20) }));
    });
  }, [nodes]);

  const toggleExpandNode = (nodeId) => {
    setExpandedNodes(prev => ({ ...prev, [nodeId]: !prev[nodeId] }));
  };

  const activeNodes = selectedNodeId === 'all' ? nodes : nodes.filter(n => n.id === selectedNodeId);

  const handleLXDAction = async (nodeId, action, lxdName) => {
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name: lxdName })
      });
      if (res.ok) {
        addToast('success', t('mon.actionDone', { action, name: lxdName }));
      } else {
        addToast('error', await res.text());
      }
    } catch (e) {
      addToast('error', e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            {t('mon.title')}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{t('mon.subtitle')}</p>
        </div>

        <Select
          value={selectedNodeId}
          onChange={(e) => setSelectedNodeId(e.target.value)}
          className="w-full sm:w-64"
        >
          <option value="all">🌐 {t('mon.allNodes', { n: nodes.length })}</option>
          {nodes.map(n => <option key={n.id} value={n.id}>🖥 {t('mon.node', { name: n.name })}</option>)}
        </Select>
      </div>

      <div className="space-y-6">
        {activeNodes.map(node => {
          const isExpanded = !!expandedNodes[node.id];
          const nodeLXDs = node.lxds || node.instances || [];

          return (
            <Card key={node.id} className="p-6 space-y-6 shadow-md border-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <div className="flex items-center gap-3">
                    <span className={`size-3 rounded-full ${node.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`}></span>
                    <h2 className="text-lg font-bold text-foreground tracking-tight">{node.name}</h2>
                    {node.is_master ? <Badge variant="info">{t('node.masterNode')}</Badge> : <Badge variant="secondary">{t('node.workerNode')}</Badge>}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    IP Address: {node.ip || '127.0.0.1'} | OS: {node.os_name || 'Linux'} | Active LXDs: {nodeLXDs.length} containers
                  </p>
                </div>

                <Button variant="outline" size="sm" onClick={() => toggleExpandNode(node.id)}>
                  <span>{isExpanded ? t('mon.hideContainers') : t('mon.showContainers', { n: nodeLXDs.length })}</span>
                  {isExpanded ? <ChevronUp className="size-4 ml-1" /> : <ChevronDown className="size-4 ml-1" />}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-foreground font-bold">{t('mon.cpu')}</span>
                    <span className="text-sky-400 font-bold">{(node.cpu_usage_pct || 15).toFixed(1)}%</span>
                  </div>
                  <SVGSparklineChart points={cpuHistory[node.id] || [12, 18, 15, 20, 25]} color="#38bdf8" max={100} height={120} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-foreground font-bold">{t('mon.ram')}</span>
                    <span className="text-purple-400 font-bold">
                      {(node.ram_used_mb / 1024).toFixed(1)} / {(node.ram_total_mb / 1024).toFixed(1)} GB
                    </span>
                  </div>
                  <SVGSparklineChart points={ramHistory[node.id] || [40, 42, 45, 43, 48]} color="#a855f7" max={100} height={120} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-foreground font-bold">{t('mon.network')}</span>
                    <span className="text-emerald-400 font-bold">{t('mon.kbs', { n: (netRate[node.id] || 0).toFixed(1) })}</span>
                  </div>
                  <SVGSparklineChart points={netHistory[node.id] || [0]} color="#10b981" max={500} height={120} />
                </div>
              </div>

              {isExpanded && (
                <div className="pt-4 border-t border-border space-y-3 animate-fade-in">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">
                    {t('mon.containerTelemetry')} ({nodeLXDs.length})
                  </h3>

                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="bg-background border-b border-border text-muted-foreground uppercase text-[10px]">
                          <th className="py-2.5 px-3">{t('mon.container')}</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">{t('mon.ip')}</th>
                          <th className="py-2.5 px-3">{t('mon.ramUsed')}</th>
                          <th className="py-2.5 px-3 text-right">{t('mon.action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-sans">
                        {nodeLXDs.length === 0 ? (
                          <tr><td colSpan="5" className="text-center py-6 text-muted-foreground">{t('mon.noContainers')}</td></tr>
                        ) : (
                          nodeLXDs.map((lxd, idx) => {
                            const isRunning = lxd.status.toLowerCase() === 'running';
                            return (
                              <tr key={idx} className="hover:bg-accent/40 transition">
                                <td className="py-2.5 px-3 font-bold text-foreground">{lxd.name}</td>
                                <td className="py-2.5 px-3 font-mono">
                                  <span className={isRunning ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}>{lxd.status}</span>
                                </td>
                                <td className="py-2.5 px-3 font-mono">{lxd.ipv4 || '—'}</td>
                                <td className="py-2.5 px-3 font-mono">{lxd.ram_used_mb ? `${lxd.ram_used_mb} MB` : '—'}</td>
                                <td className="py-2.5 px-3 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <Button variant="ghost" size="icon" onClick={() => navigate(`/lxds/${node.id}/${lxd.name}`)} title={t('mon.inspect')}>
                                      <Sliders className="size-3.5 text-muted-foreground" />
                                    </Button>
                                    {isRunning ? (
                                      <>
                                        <Button variant="ghost" size="icon" onClick={() => setActiveTerminalTarget({ ...lxd, node_name: node.name })} title={t('mon.terminal')}>
                                          <Terminal className="size-3.5 text-primary" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleLXDAction(node.id, 'stop', lxd.name)} title={t('mon.stop')}>
                                          <Square className="size-3.5 text-amber-400" />
                                        </Button>
                                      </>
                                    ) : (
                                      <Button variant="ghost" size="icon" onClick={() => handleLXDAction(node.id, 'start', lxd.name)} title={t('mon.start')}>
                                        <Play className="size-3.5 text-emerald-400" />
                                      </Button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {activeTerminalTarget && (
        <TerminalModal target={activeTerminalTarget} onClose={() => setActiveTerminalTarget(null)} />
      )}
    </div>
  );
}

export default MonitoringPage;
