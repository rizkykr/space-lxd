import React from 'react';
import { Button, Badge } from '../ui/primitives';
import { Plus, Server, LogOut, RefreshCw } from 'lucide-react';

export function TopHeader({ user, nodesCount = 0, onOpenAddNode, onOpenCreateLXD, onLogout, onRefresh }) {
  return (
    <header className="h-16 px-6 border-b border-border bg-card/60 backdrop-blur flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Space LXD Master</span>
          <Badge variant="outline" className="ml-1">{nodesCount} Nodes</Badge>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onRefresh} title="Refresh Cluster State">
          <RefreshCw className="size-3.5 text-muted-foreground" />
        </Button>

        <Button variant="outline" size="sm" onClick={onOpenAddNode}>
          <Server className="size-3.5 text-cyan-400" />
          <span>Add Node</span>
        </Button>

        <Button variant="default" size="sm" onClick={onOpenCreateLXD}>
          <Plus className="size-3.5" />
          <span>Create LXD</span>
        </Button>

        <div className="h-4 w-px bg-border mx-1"></div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-foreground font-bold">{user?.username || 'admin'}</span>
          <Button variant="ghost" size="icon" onClick={onLogout} title="Logout Account">
            <LogOut className="size-4 text-destructive" />
          </Button>
        </div>
      </div>
    </header>
  );
}
