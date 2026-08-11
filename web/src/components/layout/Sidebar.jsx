import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, LineChart, Server, Key, Activity, User as UserIcon, Settings
} from 'lucide-react';
import { Badge } from '../ui/primitives';

export function Sidebar({ nodes = [] }) {
  return (
    <aside className="w-64 bg-card border-r border-border flex flex-col justify-between shrink-0 sticky top-0 h-screen z-20">
      <div>
        {/* Logo Brand Header */}
        <div className="h-16 px-5 border-b border-border flex items-center gap-3 bg-card">
          <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-lg shadow-xs shrink-0">
            🪐
          </div>
          <div>
            <h1 className="font-bold text-sm text-foreground tracking-tight">Space LXD</h1>
            <p className="text-[10px] font-mono text-muted-foreground">v1.0 Infrastructure</p>
          </div>
        </div>

        {/* Navigation Links with Clean Spacing & Categories */}
        <nav className="p-3 flex flex-col gap-5 font-sans">
          {/* Group 1: Main Platform */}
          <div className="flex flex-col gap-1">
            <p className="px-3 text-[10px] font-mono text-muted-foreground uppercase tracking-widest font-bold mb-1">Infrastructure</p>

            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`
              }
            >
              <LayoutDashboard className="size-4 shrink-0 text-primary" />
              <span>Overview Dashboard</span>
            </NavLink>

            <NavLink
              to="/monitoring"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`
              }
            >
              <LineChart className="size-4 shrink-0 text-emerald-400" />
              <span>Realtime Monitoring</span>
            </NavLink>

            <NavLink
              to="/nodes"
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`
              }
            >
              <div className="flex items-center gap-3">
                <Server className="size-4 shrink-0 text-cyan-400" />
                <span>Node Servers</span>
              </div>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{nodes.length}</Badge>
            </NavLink>
          </div>

          {/* Group 2: Security & Logs */}
          <div className="flex flex-col gap-1">
            <p className="px-3 text-[10px] font-mono text-muted-foreground uppercase tracking-widest font-bold mb-1">Management & Security</p>

            <NavLink
              to="/templates"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`
              }
            >
              <Key className="size-4 shrink-0 text-amber-400" />
              <span>SSH Keys & Presets</span>
            </NavLink>

            <NavLink
              to="/logs"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`
              }
            >
              <Activity className="size-4 shrink-0 text-purple-400" />
              <span>Audit & Event Logs</span>
            </NavLink>
          </div>

          {/* Group 3: System Settings */}
          <div className="flex flex-col gap-1">
            <p className="px-3 text-[10px] font-mono text-muted-foreground uppercase tracking-widest font-bold mb-1">System & Admin</p>

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`
              }
            >
              <UserIcon className="size-4 shrink-0" />
              <span>Admin Profile</span>
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-secondary text-secondary-foreground font-bold border border-border shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                }`
              }
            >
              <Settings className="size-4 shrink-0" />
              <span>Cluster Settings</span>
            </NavLink>
          </div>
        </nav>
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between bg-background p-2.5 rounded-lg border border-border">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-full bg-secondary border border-border text-foreground flex items-center justify-center text-xs font-mono font-bold">
              ⚡
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">Cluster Mesh</p>
              <p className="text-[10px] font-mono text-emerald-400 font-semibold">Active & Synced</p>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
