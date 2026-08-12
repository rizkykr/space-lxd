import React, { useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Card, Button, Badge, Input } from '../components/ui/primitives';
import { Plus, Layers, Edit2, Check, X, Loader2 } from 'lucide-react';

export function NodesPage() {
  const { nodes, fetchNodes, addToast, onOpenAddNode } = useOutletContext();
  const navigate = useNavigate();

  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [loadingNodeId, setLoadingNodeId] = useState(null);

  const handleRenameNode = async (nodeId, e) => {
    e.stopPropagation();
    const trimmed = editingName.trim();
    if (!trimmed) {
      addToast('error', 'Nama node tidak boleh kosong');
      return;
    }
    setLoadingNodeId(nodeId);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rename_node', new_name: trimmed })
      });
      if (res.ok) {
        addToast('success', `Nama node berhasil diperbarui menjadi '${trimmed}'`);
        setEditingNodeId(null);
        fetchNodes();
      } else {
        addToast('error', await res.text());
      }
    } catch (err) {
      addToast('error', "Error: " + err.message);
    } finally {
      setLoadingNodeId(null);
    }
  };

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
          const isEditing = editingNodeId === node.id;
          const isLoading = loadingNodeId === node.id;

          return (
            <Card key={node.id} className="p-5 space-y-4 hover:border-primary/50 transition cursor-pointer" onClick={() => navigate(`/nodes/${node.id}`)}>
              <div className="flex items-start justify-between">
                <div className="flex-1 mr-2" onClick={(e) => isEditing && e.stopPropagation()}>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-7 text-xs font-bold w-36"
                        autoFocus
                      />
                      <Button size="icon" className="size-7" onClick={(e) => handleRenameNode(node.id, e)} disabled={isLoading}>
                        {isLoading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7" onClick={(e) => { e.stopPropagation(); setEditingNodeId(null); }} disabled={isLoading}>
                        <X className="size-3" />
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2 group">
                        <span className={`size-2.5 rounded-full ${node.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`}></span>
                        <h3 className="font-bold text-foreground text-base hover:underline">{node.name}</h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 opacity-0 group-hover:opacity-100 transition text-muted-foreground hover:text-primary"
                          title="Ubah Nama Node"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingNodeId(node.id);
                            setEditingName(node.name);
                          }}
                        >
                          <Edit2 className="size-3" />
                        </Button>
                      </div>
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        IP: {node.custom_ip_domain ? <span className="text-emerald-400 font-bold" title="Custom Domain / IP Active">{node.custom_ip_domain} ({node.ip})</span> : (node.ip || '127.0.0.1')}
                      </p>
                    </div>
                  )}
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
