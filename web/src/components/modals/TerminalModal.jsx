import React, { useEffect, useRef, memo } from 'react';
import { Card, Button } from '../ui/primitives';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { X, Terminal } from 'lucide-react';

const TerminalPane = memo(function TerminalPane({ name, nodeId }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const socketRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!name || !containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const term = new XTerminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, monospace',
      theme: {
        background: '#090d16',
        foreground: '#10b981',
        cursor: '#38bdf8'
      },
      scrollback: 5000,
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    const fitTimer = setTimeout(() => {
      try { fitAddon.fit(); } catch (e) {}
    }, 200);

    function connectWS() {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const nodeQuery = nodeId ? `&nodeId=${encodeURIComponent(nodeId)}` : '';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal?name=${encodeURIComponent(name)}${nodeQuery}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        term.write(`\r\n\x1b[32m🚀 Connected to LXD terminal shell for '${name}'...\x1b[0m\r\n\r\n`);
      };

      socket.onmessage = (event) => {
        if (termRef.current) term.write(event.data);
      };

      socket.onclose = () => {
        if (mountedRef.current) {
          term.write('\r\n\x1b[33m⚠ Connection lost. Reconnecting in 3s...\x1b[0m\r\n');
          setTimeout(() => {
            if (mountedRef.current) connectWS();
          }, 3000);
        }
      };

      socket.onerror = () => {};
    }

    connectWS();

    const dataDisposable = term.onData((data) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(data);
      }
    });

    const handleResize = () => {
      try { fitAddon.fit(); } catch (e) {}
    };
    window.addEventListener('resize', handleResize);

    return () => {
      mountedRef.current = false;
      clearTimeout(fitTimer);
      dataDisposable.dispose();
      window.removeEventListener('resize', handleResize);
      if (socketRef.current) {
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [name, nodeId]);

  return <div ref={containerRef} className="w-full h-full p-2" />;
});

export function TerminalModal({ target, onClose }) {
  const targetNodeId = target?.node_id || target?.nodeId;
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-4xl w-full h-[600px] flex flex-col shadow-2xl relative bg-[#090d16] border-border overflow-hidden">
        <div className="bg-background px-4 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-primary" />
            <span className="font-mono text-xs text-foreground font-bold">{target?.name}</span>
            <span className="text-[10px] font-mono text-muted-foreground">({target?.node_name || targetNodeId || 'local'})</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 w-full h-full relative overflow-hidden bg-[#090d16]">
          <TerminalPane name={target?.name} nodeId={targetNodeId} />
        </div>
      </Card>
    </div>
  );
}
