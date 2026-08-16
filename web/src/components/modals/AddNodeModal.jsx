import React, { useState, useEffect } from 'react';
import { Card, Button, Input } from '../ui/primitives';
import { Server, X, Copy, Check, Sparkles } from 'lucide-react';
import { useI18n } from '../../i18n';

export function AddNodeModal({ joinTokenData, onClose, onRefreshNodes }) {
  const { t } = useI18n();
  const [nodeNameInput, setNodeNameInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [initialNodesCount, setInitialNodesCount] = useState(0);
  const [detectedNode, setDetectedNode] = useState(null);

  // Realtime Polling Detection: if a new node joins while modal is open
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
  
  // Format join command with --name flag if user provides custom name
  const formattedCmd = nodeNameInput.trim()
    ? `${rawCmd} --name "${nodeNameInput.trim()}"`
    : rawCmd;

  const copyCmd = () => {
    if (!formattedCmd) return;
    
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
            <span>{t('addnode.title')}</span>
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-5" /></Button>
        </div>

        {detectedNode ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-lg space-y-2 text-emerald-400">
            <div className="flex items-center gap-2 font-bold text-sm">
              <Sparkles className="size-4 animate-bounce" />
              <span>{t('addnode.detectedTitle')}</span>
            </div>
            <p className="text-xs font-mono text-foreground">
              {t('addnode.detectedMsg', { name: detectedNode.name, ip: detectedNode.ip })}
            </p>
            <Button size="sm" className="mt-2 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={onClose}>
              {t('addnode.done')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase text-muted-foreground font-bold">
                {t('addnode.nodeName')}
              </label>
              <Input
                type="text"
                value={nodeNameInput}
                onChange={(e) => setNodeNameInput(e.target.value)}
                placeholder={t('addnode.nodeNamePlaceholder')}
                className="text-xs font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                {t('addnode.nodeNameHint', { name: nodeNameInput.trim() || 'Worker-01' })}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-mono uppercase text-muted-foreground font-bold">
                {t('addnode.command')}
              </label>
              <div className="bg-background border border-border rounded-md p-3.5 font-mono text-xs text-primary break-all select-all relative group">
                {formattedCmd}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-muted-foreground">
                ⏳ {t('addnode.tokenExpires', { t: joinTokenData?.expires_in || '30m' })}
              </span>
              <Button onClick={copyCmd} className="flex items-center gap-2">
                {copied ? (
                  <>
                    <Check className="size-4 text-emerald-400" />
                    <span>{t('addnode.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    <span>{t('addnode.copy')}</span>
                  </>
                )}
              </Button>
            </div>

            <div className="text-[11px] text-muted-foreground bg-accent/30 p-3 rounded border border-border font-mono">
              💡 {t('addnode.sshNote')}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

export default AddNodeModal;
