import React, { useEffect, useRef, memo } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { wsUrl } from '../../utils/api';

export const EmbeddedTerminal = memo(function EmbeddedTerminal({ name, nodeId }) {
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

    // Delay fit to ensure container has dimensions
    const fitTimer = setTimeout(() => {
      try { fitAddon.fit(); } catch (e) {}
    }, 200);

    function connectWS() {
      const nodeQuery = nodeId ? `&nodeId=${encodeURIComponent(nodeId)}` : '';
      const socket = new WebSocket(wsUrl(`/ws/terminal?name=${encodeURIComponent(name)}${nodeQuery}`));
      socketRef.current = socket;

      socket.onopen = () => {
        term.write(`\r\n\x1b[32m🚀 Connected to Space LXD PTY shell for '${name}'...\x1b[0m\r\n\r\n`);
      };

      socket.onmessage = (event) => {
        if (termRef.current) term.write(event.data);
      };

      socket.onclose = (e) => {
        // Only show message if not intentionally closed
        if (mountedRef.current) {
          term.write('\r\n\x1b[33m⚠ Connection lost. Reconnecting in 3s...\x1b[0m\r\n');
          // Auto-reconnect after 3 seconds
          setTimeout(() => {
            if (mountedRef.current) {
              connectWS();
            }
          }, 3000);
        }
      };

      socket.onerror = () => {
        // Error is always followed by onclose, so just let onclose handle reconnect
      };
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
        socketRef.current.onclose = null; // Prevent reconnect on intentional close
        socketRef.current.close();
        socketRef.current = null;
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [name]);

  return (
    <div className="w-full h-full min-h-[480px] bg-[#090d16] relative flex flex-col overflow-hidden">
      <div ref={containerRef} className="flex-1 w-full h-full p-2" />
    </div>
  );
});
