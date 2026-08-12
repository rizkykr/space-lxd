import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '../ui/primitives';
import { Server, X, Copy, Check, Sparkles } from 'lucide-react';

export function AddNodeModal({ joinTokenData, onClose, onRefreshNodes }) {
  const [nodeNameInput, setNodeNameInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [initialNodesCount, setInitialNodesCount] = useState(0);
  const [detectedNode, setDetectedNode] = useState(null);

  // Realtime Polling Detection: jika ada node baru bergabung saat modal terbuka
  useEffect(() => {
    let interval;
    const checkNewNodes = async () => {
      try {
        const res = await fetch('/api/nodes');
        if (res.ok) {
          const list = await res.json();
          if (initialNodesCount > 0 && list.length > initialNodesCount) {
            const newlyAdded = list[list.length - 1];
            setDetectedNode(newlyAdded);
            if (onRefreshNodes) onRefreshNodes();
          } else if (initialNodesCount === 0) {
            setInitialNodesCount(list.length);
          }
        }
      } catch (e) {}
    };

    checkNewNodes();
    interval = setInterval(checkNewNodes, 2500);
    return () => clearInterval(interval);
  }, [initialNodesCount, onRefreshNodes]);

  const rawCmd = joinTokenData?.join_command || '';
  
  // Format perintah join dengan menyertakan flag --name jika user menginputkan nama node
  const formattedCmd = nodeNameInput.trim()
    ? `${rawCmd} --name "${nodeNameInput.trim()}"`
    : rawCmd;

  const copyCmd = () => {
    if (!formattedCmd) return;
    
    // Robust Clipboard Copy (dengan fallback execCommand)
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(formattedCmd).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(formattedCmd));
    } else {
      fallbackCopy(formattedCmd);
    }
  };

  const fallbackCopy = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {}
    document.body.removeChild(textArea);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-xl w-full p-6 space-y-5 shadow-2xl relative border-border">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Server className="size-5 text-primary" />
            <span>Add New Worker Node Server</span>
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-5" /></Button>
        </div>

        {detectedNode ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg space-y-2 text-emerald-400">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Sparkles className="size-4 animate-bounce" />
              <span>Node Baru Terdeteksi & Otomatis Terhubung!</span>
            </div>
            <p className="text-xs font-mono text-foreground">
              Node <strong className="text-emerald-400">{detectedNode.name}</strong> ({detectedNode.ip}) telah berhasil bergabung dengan kluster dan kunci SSH service user telah dikonfigurasi.
            </p>
            <Button size="sm" className="mt-2 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={onClose}>
              Selesai & Buka Node
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Input Nama Node terlebih dahulu */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase text-muted-foreground font-bold">
                1. Masukkan Nama Node Server (Opsional):
              </label>
              <Input
                type="text"
                value={nodeNameInput}
                onChange={(e) => setNodeNameInput(e.target.value)}
                placeholder="misal: Worker-Surabaya-01"
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Jika diisi, script di bawah otomatis menyertakan parameter <code className="text-primary">--name "{nodeNameInput.trim() || 'Worker-01'}"</code>.
              </p>
            </div>

            {/* Script Command Display */}
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase text-muted-foreground font-bold">
                2. Jalankan Perintah Ini di Terminal Node Worker (Sudo Bash):
              </label>
              <div className="bg-background border border-border rounded-md p-3.5 font-mono text-xs text-primary break-all select-all relative group">
                {formattedCmd}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-muted-foreground">
                ⏳ Token berlaku: <strong className="text-foreground">{joinTokenData?.expires_in || '30m'}</strong>
              </span>
              <Button onClick={copyCmd} className="flex items-center gap-2">
                {copied ? (
                  <>
                    <Check className="size-4 text-emerald-400" />
                    <span>Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    <span>Copy Join Command</span>
                  </>
                )}
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground bg-accent/30 p-3 rounded border border-border font-mono">
              💡 <strong>Otomatisasi SSH:</strong> Setelah perintah di atas dijalankan di server worker, installer akan membuat user <code className="text-primary">space-lxd</code>, mengkonfigurasi SSH keypair, dan mendaftarkan public key secara otomatis ke Master.
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
