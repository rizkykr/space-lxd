import React from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge } from '../components/ui/primitives';
import { Plus, Layers } from 'lucide-react';

export function NodesPage() {
  const { nodes, onOpenAddNode } = useOutletContext();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-3">
            <span>Node Servers</span>
            <Badge variant="success">🌐 Cross-Node IP Mesh Active</Badge>
          </h1>
          <p className="text-xs text-muted-foreground">Pilih Node Server untuk mengelola container LXD di dalamnya</p>
        </div>
        <Button onClick={onOpenAddNode}>
          <Plus className="size-4" data-icon="inline-start" />
          <span>Add Node Server</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {nodes.map(node => {
          const lxdsCount = (node.lxds || node.instances || []).length;
          return (
            <Card key={node.id} className="p-5 space-y-4 hover:border-primary/50 transition cursor-pointer" onClick={() => navigate(`/nodes/${node.id}`)}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${node.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`}></span>
                    <h3 className="font-bold text-foreground text-base hover:underline">{node.name}</h3>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-1">IP: {node.ip || '127.0.0.1'}</p>
                </div>
                {node.is_master ? <Badge variant="info">MASTER</Badge> : <Badge variant="secondary">WORKER</Badge>}
              </div>

              <div className="text-xs font-mono text-foreground bg-background p-3 rounded-md border border-border space-y-1.5">
                <div className="flex justify-between"><span>OS Distro:</span><span className="font-bold">{node.os_name || 'Linux'}</span></div>
                <div className="flex justify-between"><span>Status:</span><span className={node.status === 'online' ? 'text-emerald-400 font-bold' : 'text-muted-foreground'}>{node.status.toUpperCase()}</span></div>
                <div className="flex justify-between"><span>Uptime:</span><span className="text-muted-foreground">{node.uptime || '0m'}</span></div>
                <div className="flex justify-between"><span>LXDs Active:</span><span className="text-primary font-bold">{lxdsCount} containers</span></div>
              </div>

              <Button className="w-full text-xs" onClick={(e) => { e.stopPropagation(); navigate(`/nodes/${node.id}`); }}>
                <Layers className="size-3.5" data-icon="inline-start" />
                <span>Kelola LXD Container ({lxdsCount})</span>
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
