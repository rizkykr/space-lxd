import React, { useEffect, useRef } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';

export function EmbeddedTerminal({ target }) {
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
      term.write(`\r\n\x1b[32m🚀 Connected to Space LXD PTY shell console for '${targetName}'...\x1b[0m\r\n\r\n`);
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

  return <div ref={containerRef} className="w-full h-full p-2 bg-[#090d16]" />;
}
