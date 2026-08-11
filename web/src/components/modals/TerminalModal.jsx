import React, { useEffect, useRef } from 'react';
import { Card, Button } from '../ui/primitives';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { X, Terminal } from 'lucide-react';

export function TerminalModal({ target, onClose }) {
  const containerRef = useRef(null);
  const targetName = target?.name;

  useEffect(() => {
    if (!targetName || !containerRef.current) return;

    const term = new XTerminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, monospace',
      theme: {
        background: '#090d16',
        foreground: '#10b981',
        cursor: '#38bdf8'
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal?name=${encodeURIComponent(targetName)}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      term.write(`\r\n\x1b[32m🚀 Connected to LXD terminal shell for '${targetName}'...\x1b[0m\r\n\r\n`);
    };

    socket.onmessage = (event) => term.write(event.data);
    socket.onclose = () => term.write('\r\n\x1b[31mTerminal session closed.\x1b[0m\r\n');
    socket.onerror = () => term.write('\r\n\x1b[31mWebSocket connection error.\x1b[0m\r\n');

    const dataDisposable = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    });

    const handleResize = () => fitAddon.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      dataDisposable.dispose();
      window.removeEventListener('resize', handleResize);
      if (socket) socket.close();
      term.dispose();
    };
  }, [targetName]);

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-4xl w-full h-[600px] flex flex-col shadow-2xl relative bg-[#090d16] border-border overflow-hidden">
        <div className="bg-background px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" />
            <span className="font-mono text-xs text-foreground font-bold">{target?.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground">({target?.node_name || 'local'})</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div ref={containerRef} className="flex-1 p-2 bg-[#090d16]" />
      </Card>
    </div>
  );
}
