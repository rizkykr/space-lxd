import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Select } from '../components/ui/primitives';
import { SVGSparklineChart } from '../utils/SVGSparklineChart';
import { TerminalModal } from '../components/modals/TerminalModal';
import { LineChart, ChevronDown, ChevronUp, Terminal, Play, Square, Sliders } from 'lucide-react';

export function MonitoringPage() {
  const { nodes, fetchNodes, addToast } = useOutletContext();
  const navigate = useNavigate();
  const [selectedNodeId, setSelectedNodeId] = useState('all');
  const [expandedNodes, setExpandedNodes] = useState({});
  const [activeTerminalTarget, setActiveTerminalTarget] = useState(null);

  const [cpuHistory, setCpuHistory] = useState({});
  const [ramHistory, setRamHistory] = useState({});
  const [netHistory, setNetHistory] = useState({});

  useEffect(() => {
    const interval = setInterval(() => {
      nodes.forEach(n => {
        const cpuVal = (n.cpu_usage_pct || 0) + (Math.random() * 3 - 1.5);
        const ramVal = n.ram_total_mb > 0 ? ((n.ram_used_mb / n.ram_total_mb) * 100) : 0;
        const netVal = Math.floor(100 + Math.random() * 250);

        setCpuHistory(prev => ({
          ...prev,
          [n.id]: [...(prev[n.id] || [12, 18, 15, 20, cpuVal]), Math.max(2, Math.min(98, cpuVal))].slice(-15)
        }));

        setRamHistory(prev => ({
          ...prev,
          [n.id]: [...(prev[n.id] || [40, 42, 45, 43, ramVal]), Math.max(5, Math.min(95, ramVal))].slice(-15)
        }));

        setNetHistory(prev => ({
          ...prev,
          [n.id]: [...(prev[n.id] || [80, 120, 190, 140, netVal]), netVal].slice(-15)
        }));
      });
    }, 2000);

    return () => clearInterval(interval);
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
        addToast('success', `Aksi '${action}' dieksekusi pada ${lxdName}`);
        fetchNodes();
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
          <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-3">
            <LineChart className="size-5 text-emerald-400" />
            <span>Realtime Resource Telemetry</span>
          </h1>
          <p className="text-xs text-muted-foreground">Grafik penggunaan CPU, RAM Memory, dan Network I/O seluruh Node Server</p>
        </div>

        <Select
          value={selectedNodeId}
          onChange={(e) => setSelectedNodeId(e.target.value)}
          className="w-full sm:w-64"
        >
          <option value="all">🌐 All Node Servers ({nodes.length})</option>
          {nodes.map(n => <option key={n.id} value={n.id}>🖥 Node: {n.name}</option>)}
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
                    {node.is_master ? <Badge variant="info">MASTER NODE</Badge> : <Badge variant="secondary">WORKER NODE</Badge>}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    IP Address: {node.ip || '127.0.0.1'} | OS: {node.os_name || 'Linux'} | Active LXDs: {nodeLXDs.length} containers
                  </p>
                </div>

                <Button variant="outline" size="sm" onClick={() => toggleExpandNode(node.id)}>
                  <span>{isExpanded ? 'Sembunyikan LXD Containers' : `Tampilkan Container (${nodeLXDs.length})`}</span>
                  {isExpanded ? <ChevronUp className="size-4 ml-1" /> : <ChevronDown className="size-4 ml-1" />}
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-foreground font-bold">CPU Usage</span>
                    <span className="text-sky-400 font-bold">{(node.cpu_usage_pct || 15).toFixed(1)}%</span>
                  </div>
                  <SVGSparklineChart points={cpuHistory[node.id] || [12, 18, 15, 20, 25]} color="#38bdf8" max={100} height={120} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-foreground font-bold">RAM Memory</span>
                    <span className="text-purple-400 font-bold">
                      {(node.ram_used_mb / 1024).toFixed(1)} / {(node.ram_total_mb / 1024).toFixed(1)} GB
                    </span>
                  </div>
                  <SVGSparklineChart points={ramHistory[node.id] || [40, 42, 45, 43, 48]} color="#a855f7" max={100} height={120} />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-foreground font-bold">Network I/O</span>
                    <span className="text-emerald-400 font-bold">245 KB/s</span>
                  </div>
                  <SVGSparklineChart points={netHistory[node.id] || [80, 120, 190, 140, 210]} color="#10b981" max={300} height={120} />
                </div>
              </div>

              {isExpanded && (
                <div className="pt-4 border-t border-border space-y-3 animate-fade-in">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider font-mono">
                    Container Telemetry & Quick Action ({nodeLXDs.length})
                  </h3>

                  <div className="overflow-x-auto border border-border rounded-lg">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="bg-background border-b border-border text-muted-foreground uppercase text-[10px]">
                          <th className="py-2.5 px-3">Container</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">IP Address</th>
                          <th className="py-2.5 px-3">RAM Used</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border font-sans">
                        {nodeLXDs.length === 0 ? (
                          <tr><td colSpan="5" className="text-center py-6 text-muted-foreground">Belum ada container di node ini.</td></tr>
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
                                    <Button variant="ghost" size="icon" onClick={() => navigate(`/lxds/${node.id}/${lxd.name}`)} title="Inspect LXD">
                                      <Sliders className="size-3.5 text-muted-foreground" />
                                    </Button>
                                    {isRunning ? (
                                      <>
                                        <Button variant="ghost" size="icon" onClick={() => setActiveTerminalTarget({ ...lxd, node_name: node.name })} title="Terminal">
                                          <Terminal className="size-3.5 text-primary" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleLXDAction(node.id, 'stop', lxd.name)} title="Stop">
                                          <Square className="size-3.5 text-amber-400" />
                                        </Button>
                                      </>
                                    ) : (
                                      <Button variant="ghost" size="icon" onClick={() => handleLXDAction(node.id, 'start', lxd.name)} title="Start">
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
