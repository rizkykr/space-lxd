import React, { useEffect, useRef } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export function EmbeddedTerminal({ target }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const socketRef = useRef(null);
  const fitAddonRef = useRef(null);

  const targetName = target?.name;

  useEffect(() => {
    if (!targetName || !containerRef.current) return;

    // Prevent re-initialization if terminal instance already exists
    if (termRef.current) return;

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
    termRef.current = term;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (e) {}
    }, 150);

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws/terminal?name=${encodeURIComponent(targetName)}`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      term.write(`\r\n\x1b[32m🚀 Connected to Space LXD PTY shell console for '${targetName}'...\x1b[0m\r\n\r\n`);
    };

    socket.onmessage = (event) => term.write(event.data);
    socket.onclose = () => term.write('\r\n\x1b[31m[Terminal session closed]\x1b[0m\r\n');
    socket.onerror = () => term.write('\r\n\x1b[31m[WebSocket connection error]\x1b[0m\r\n');

    const dataDisposable = term.onData((data) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(data);
      }
    });

    const handleResize = () => {
      try {
        fitAddon.fit();
      } catch (e) {}
    };
    window.addEventListener('resize', handleResize);

    return () => {
      dataDisposable.dispose();
      window.removeEventListener('resize', handleResize);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (termRef.current) {
        termRef.current.dispose();
        termRef.current = null;
      }
    };
  }, [targetName]);

  return (
    <div className="w-full h-full min-h-[480px] bg-[#090d16] relative flex flex-col overflow-hidden">
      <div ref={containerRef} className="flex-1 w-full h-full p-2" />
    </div>
  );
}
