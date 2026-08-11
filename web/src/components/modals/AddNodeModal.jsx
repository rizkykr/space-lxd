import React, { useState } from 'react';
import { Card, Button } from '../ui/primitives';
import { Server, X } from 'lucide-react';

export function AddNodeModal({ joinTokenData, onClose }) {
  const [copied, setCopied] = useState(false);

  const copyCmd = () => {
    navigator.clipboard.writeText(joinTokenData.join_command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-xl w-full p-6 space-y-5 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <Server className="size-5 text-primary" />
            <span>Add Node Server</span>
          </h3>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-5" /></Button>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-mono uppercase text-muted-foreground">Join Script Command (Copy & Paste):</label>
          <div className="bg-background border border-border rounded-md p-4 font-mono text-xs text-primary break-all select-all">
            {joinTokenData.join_command}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-muted-foreground">Token berlaku {joinTokenData.expires_in}</span>
            <Button onClick={copyCmd}>
              {copied ? 'Copied!' : 'Copy Script Command'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
