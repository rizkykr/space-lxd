import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge } from '../components/ui/primitives';
import { SVGSparklineChart } from '../utils/SVGSparklineChart';
import { Server, Layers, Cpu, HardDrive, Plus, LineChart } from 'lucide-react';
import { useI18n } from '../i18n';

export function DashboardPage() {
  const { nodes, onOpenAddNode, onOpenCreateLXD } = useOutletContext();
  const navigate = useNavigate();
  const { t } = useI18n();

  let totalLXDs = 0;
  let runningLXDs = 0;
  let totalRAMMB = 0;
  let usedRAMMB = 0;

  nodes.forEach(n => {
    totalRAMMB += (n.ram_total_mb || 0);
    usedRAMMB += (n.ram_used_mb || 0);
    const lxds = n.lxds || n.instances || [];
    totalLXDs += lxds.length;
    runningLXDs += lxds.filter(i => (i.status || '').toLowerCase() === 'running').length;
  });

  const activeNodesCount = nodes.filter(n => n.status === 'online').length;
  const ramUsagePct = totalRAMMB > 0 ? ((usedRAMMB / totalRAMMB) * 100).toFixed(1) : 0;
  const workerCount = Math.max(0, nodes.length - 1);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
            {t('dash.title')}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{t('dash.subtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onOpenAddNode}>
            <Server className="size-4 mr-1.5" />
            <span>{t('dash.addNode')}</span>
          </Button>
          <Button onClick={onOpenCreateLXD}>
            <Plus className="size-4 mr-1.5" />
            <span>{t('dash.createLxd')}</span>
          </Button>
        </div>
      </div>

      {/* Top 4 Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 space-y-2 hover:border-primary/50 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase">{t('dash.activeNodes')}</span>
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Server className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-foreground">{activeNodesCount} / {nodes.length}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {t('dash.nodeCount', { n: workerCount })}
            </p>
          </div>
        </Card>

        <Card className="p-5 space-y-2 hover:border-primary/50 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase">{t('dash.totalLxds')}</span>
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Layers className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-foreground">{totalLXDs}</div>
            <p className="text-[11px] text-emerald-400 mt-0.5 font-mono font-bold">
              {runningLXDs} {t('common.running')}, {totalLXDs - runningLXDs} {t('common.stopped')}
            </p>
          </div>
        </Card>

        <Card className="p-5 space-y-2 hover:border-primary/50 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase">{t('dash.ramUsage')}</span>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Cpu className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-foreground">{ramUsagePct}%</div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono font-bold text-purple-400">
              {t('dash.gbUsed', { used: (usedRAMMB / 1024).toFixed(1), total: (totalRAMMB / 1024).toFixed(1) })}
            </p>
          </div>
        </Card>

        <Card className="p-5 space-y-2 hover:border-primary/50 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground uppercase">{t('dash.networkHealth')}</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <HardDrive className="size-4" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-emerald-400">{t('dash.mesh')}</div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{t('dash.networkSub')}</p>
          </div>
        </Card>
      </div>

      {/* Prominent Telemetry Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-foreground tracking-tight flex items-center gap-2">
                <LineChart className="size-5 text-primary" />
                <span>{t('dash.telemetry')}</span>
              </h2>
              <p className="text-xs text-muted-foreground">{t('dash.telemetrySub')}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate('/monitoring')}>
              <span>{t('dash.openTelemetry')}</span>
            </Button>
          </div>
          <SVGSparklineChart points={[25, 32, 28, 45, 38, 52, 48, 60, 55, 68]} color="#38bdf8" max={100} height={150} />
        </Card>

        {/* Node Server Quick Status Card */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-bold text-foreground">{t('dash.activeServers')}</h2>
            <Button size="sm" variant="ghost" onClick={() => navigate('/nodes')}>{t('dash.viewAll')}</Button>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {nodes.map(n => (
              <div
                key={n.id}
                onClick={() => navigate(`/nodes/${n.id}`)}
                className="p-3 bg-background border border-border rounded-lg hover:border-primary/50 transition cursor-pointer flex items-center justify-between"
              >
                <div>
                  <p className="text-foreground font-bold flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>{n.name}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground">{n.ip || '127.0.0.1'}</p>
                </div>
                <Badge variant={n.is_master ? 'info' : 'outline'}>
                  {t('dash.lxds', { n: (n.lxds || n.instances || []).length })}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default DashboardPage;
