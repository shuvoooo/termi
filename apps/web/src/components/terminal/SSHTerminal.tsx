'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

import '@xterm/xterm/css/xterm.css';

interface SSHTerminalProps {
    serverId: string;
    connectionToken: string;
    onDisconnect?: () => void;
    onError?: (error: string) => void;
    onKeyHandlerReady?: (handler: (key: string) => void) => void;
}

export default function SSHTerminal({
    serverId,
    connectionToken,
    onDisconnect,
    onError,
    onKeyHandlerReady,
}: SSHTerminalProps) {
    const terminalRef = useRef<HTMLDivElement>(null);
    const terminalInstance = useRef<Terminal | null>(null);
    const fitAddon = useRef<FitAddon | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const statusRef = useRef<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

    // Use refs for callbacks so that changing them doesn't cause the terminal
    // to reconnect (they are always called via the ref, not the closure).
    const onDisconnectRef = useRef(onDisconnect);
    onDisconnectRef.current = onDisconnect;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    const onKeyHandlerReadyRef = useRef(onKeyHandlerReady);
    onKeyHandlerReadyRef.current = onKeyHandlerReady;

    const updateStatus = useCallback((newStatus: typeof status) => {
        statusRef.current = newStatus;
        setStatus(newStatus);
    }, []);

    const connect = useCallback(() => {
        const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:8080';
        const wsUrl = `${gatewayUrl}/connect?token=${connectionToken}&protocol=ssh&serverId=${serverId}`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
            if (wsRef.current !== ws) return; // Stale WebSocket
            try {
                const message = JSON.parse(event.data);

                switch (message.type) {
                    case 'connected':
                        updateStatus('connecting');
                        break;
                    case 'shell-ready':
                        updateStatus('connected');
                        // Send initial resize
                        if (terminalInstance.current && fitAddon.current) {
                            fitAddon.current.fit();
                            const { cols, rows } = terminalInstance.current;
                            ws.send(JSON.stringify({ type: 'resize', cols, rows }));
                        }
                        break;
                    case 'data':
                        // Decode base64 data and write to terminal
                        if (terminalInstance.current && message.data) {
                            const binary = atob(message.data);
                            const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
                            terminalInstance.current.write(bytes);
                        }
                        break;
                    case 'closed':
                    case 'disconnected':
                        updateStatus('disconnected');
                        terminalInstance.current?.write('\r\n\x1b[33mConnection closed.\x1b[0m\r\n');
                        onDisconnectRef.current?.();
                        break;
                    case 'error':
                        updateStatus('error');
                        terminalInstance.current?.write(`\r\n\x1b[31mError: ${message.message}\x1b[0m\r\n`);
                        onErrorRef.current?.(message.message);
                        break;
                }
            } catch (e) {
                console.error('Failed to parse message:', e);
            }
        };

        ws.onclose = () => {
            // Ignore events from a stale WebSocket (e.g. from React StrictMode double-invoke cleanup)
            if (wsRef.current !== ws) return;
            if (statusRef.current !== 'disconnected' && statusRef.current !== 'error') {
                updateStatus('disconnected');
                terminalInstance.current?.write('\r\n\x1b[33mConnection lost.\x1b[0m\r\n');
            }
        };

        ws.onerror = () => {
            // Ignore events from a stale WebSocket
            if (wsRef.current !== ws) return;
            updateStatus('error');
            onErrorRef.current?.('WebSocket connection failed');
        };
    // onDisconnect/onError intentionally omitted — accessed via refs to prevent reconnection loops
    }, [serverId, connectionToken, updateStatus]);

    useEffect(() => {
        if (!terminalRef.current) return;

        // Create terminal
        const terminal = new Terminal({
            cursorBlink: true,
            cursorStyle: 'block',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 14,
            lineHeight: 1.2,
            theme: {
                background: '#0d1117',
                foreground: '#c9d1d9',
                cursor: '#58a6ff',
                cursorAccent: '#0d1117',
                selectionBackground: '#264f78',
                selectionForeground: '#ffffff',
                black: '#484f58',
                red: '#ff7b72',
                green: '#3fb950',
                yellow: '#d29922',
                blue: '#58a6ff',
                magenta: '#bc8cff',
                cyan: '#39c5cf',
                white: '#b1bac4',
                brightBlack: '#6e7681',
                brightRed: '#ffa198',
                brightGreen: '#56d364',
                brightYellow: '#e3b341',
                brightBlue: '#79c0ff',
                brightMagenta: '#d2a8ff',
                brightCyan: '#56d4dd',
                brightWhite: '#f0f6fc',
            },
            allowProposedApi: true,
        });

        terminalInstance.current = terminal;

        // Add fit addon
        const fit = new FitAddon();
        fitAddon.current = fit;
        terminal.loadAddon(fit);

        // Add web links addon
        const webLinks = new WebLinksAddon();
        terminal.loadAddon(webLinks);

        // Open terminal
        terminal.open(terminalRef.current);
        fit.fit();

        // Handle input
        terminal.onData((data) => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                const bytes = new TextEncoder().encode(data);
                const encoded = btoa(String.fromCharCode(...bytes));
                wsRef.current.send(JSON.stringify({
                    type: 'data',
                    data: encoded,
                }));
            }
        });

        // Expose key handler for virtual keyboard
        onKeyHandlerReadyRef.current?.((key) => terminal.input(key));

        // Handle resize
        const handleResize = () => {
            fit.fit();
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                const { cols, rows } = terminal;
                wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
        };

        window.addEventListener('resize', handleResize);

        // Connect
        terminal.write('Connecting to server...\r\n');
        connect();

        // Cleanup — null out wsRef so stale event handlers (e.g. from StrictMode
        // double-invoke) can detect they belong to a closed connection and no-op.
        return () => {
            window.removeEventListener('resize', handleResize);
            const ws = wsRef.current;
            wsRef.current = null;
            ws?.close();
            terminal.dispose();
        };
    }, [connect]);

    // Send ping every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative h-full">
            {/* Status indicator */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <span
                    className={`w-2 h-2 rounded-full ${status === 'connected'
                            ? 'bg-green-500'
                            : status === 'connecting'
                                ? 'bg-yellow-500 animate-pulse'
                                : 'bg-red-500'
                        }`}
                />
                <span className="text-xs text-dark-400 capitalize">{status}</span>
            </div>

            {/* Terminal */}
            <div
                ref={terminalRef}
                className="h-full terminal-container rounded-lg overflow-hidden"
            />
        </div>
    );
}
