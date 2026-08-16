import React, { useEffect, useRef, memo } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { wsUrl } from '../../utils/api';

/**
 * NodeHostTerminal — Terminal PTY langsung ke host/node server.
 * Terhubung ke endpoint /ws/node-terminal?nodeId=<nodeId>
 * Stabil: React.memo + mountedRef + auto-reconnect + WS keepalive
 */
export const NodeHostTerminal = memo(function NodeHostTerminal({ nodeId, nodeName }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const socketRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!nodeId || !containerRef.current || mountedRef.current) return;
    mountedRef.current = true;

    const term = new XTerminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'JetBrains Mono, monospace',
      theme: {
        background: '#0a0f1a',
        foreground: '#e2e8f0',
        cursor: '#f59e0b',
        black: '#1a1f2e',
        brightBlack: '#4a5568',
        green: '#10b981',
        brightGreen: '#34d399',
        yellow: '#f59e0b',
        brightYellow: '#fbbf24',
        blue: '#3b82f6',
        brightBlue: '#60a5fa',
        cyan: '#06b6d4',
        brightCyan: '#22d3ee',
        red: '#ef4444',
        brightRed: '#f87171',
        white: '#e2e8f0',
        brightWhite: '#f8fafc',
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

    const handleResize = () => {
      try { fitAddon.fit(); } catch (e) {}
    };
    window.addEventListener('resize', handleResize);

    function connectWS() {
      const socket = new WebSocket(wsUrl(`/ws/node-terminal?nodeId=${encodeURIComponent(nodeId)}`));
      socketRef.current = socket;

      socket.onopen = () => {
        term.write(`\r\n\x1b[32m🖥 Connected to HOST terminal: ${nodeName || nodeId}\x1b[0m\r\n`);
        term.write(`\x1b[33m⚡ Running as: ${nodeId === 'master' ? 'Master Node' : `Node ${nodeName}`}\x1b[0m\r\n\r\n`);
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
  }, [nodeId, nodeName]);

  return (
    <div className="w-full h-full min-h-[480px] bg-[#0a0f1a] relative flex flex-col overflow-hidden">
      <div ref={containerRef} className="flex-1 w-full h-full p-2" />
    </div>
  );
});
