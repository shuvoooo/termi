'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { MonitorX } from 'lucide-react';

interface TerminalApi {
    create(cwd?: string): Promise<string>;
    input(id: string, data: string): void;
    resize(id: string, cols: number, rows: number): void;
    close(id: string): void;
    onData(id: string, cb: (data: string) => void): () => void;
    onExit(id: string, cb: (code: number) => void): () => void;
}

function getTerminalApi(): TerminalApi | null {
    if (typeof window === 'undefined') return null;
    return (window as Window & { termiElectron?: { terminal?: TerminalApi } })
        .termiElectron?.terminal ?? null;
}

export default function LocalTerminalPanel() {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const unsubsRef = useRef<Array<() => void>>([]);
    const [exited, setExited] = useState(false);
    const [exitCode, setExitCode] = useState<number | null>(null);

    useEffect(() => {
        const api = getTerminalApi();
        if (!api || !containerRef.current) return;

        // ── Build terminal ────────────────────────────────────────────────
        const term = new Terminal({
            fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
            fontSize: 13,
            lineHeight: 1.3,
            cursorBlink: true,
            scrollback: 10000,
            theme: {
                background:          '#0d0d0d',
                foreground:          '#d4d4d4',
                cursor:              '#eeeeee',
                cursorAccent:        '#000000',
                selectionBackground: 'rgba(255,255,255,0.15)',
                black:               '#1e1e1e',
                red:                 '#f44747',
                green:               '#6a9955',
                yellow:              '#dcdcaa',
                blue:                '#569cd6',
                magenta:             '#c678dd',
                cyan:                '#4ec9b0',
                white:               '#d4d4d4',
                brightBlack:         '#808080',
                brightRed:           '#f44747',
                brightGreen:         '#b5cea8',
                brightYellow:        '#e5c07b',
                brightBlue:          '#9cdcfe',
                brightMagenta:       '#c678dd',
                brightCyan:          '#56b6c2',
                brightWhite:         '#ffffff',
            },
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);
        fitAddon.fit();

        termRef.current    = term;
        fitRef.current     = fitAddon;

        // ── Spawn PTY ─────────────────────────────────────────────────────
        api.create().then(id => {
            sessionIdRef.current = id;

            const unsubData = api.onData(id, data => term.write(data));
            const unsubExit = api.onExit(id, code => {
                setExited(true);
                setExitCode(code);
                term.writeln(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m`);
            });
            unsubsRef.current.push(unsubData, unsubExit);

            term.onData(data => api.input(id, data));
            term.onResize(({ cols, rows }) => api.resize(id, cols, rows));
            api.resize(id, term.cols, term.rows);
        });

        // ── Fit on container resize ───────────────────────────────────────
        const ro = new ResizeObserver(() => fitAddon.fit());
        ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
            unsubsRef.current.forEach(fn => fn());
            unsubsRef.current = [];
            if (sessionIdRef.current) {
                api.close(sessionIdRef.current);
                sessionIdRef.current = null;
            }
            term.dispose();
            termRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleRestart = () => {
        // Re-mount by resetting the key (parent handles this via a key prop)
        setExited(false);
        setExitCode(null);
        const api = getTerminalApi();
        if (!api || !termRef.current || !fitRef.current) return;
        const term = termRef.current;
        term.reset();
        api.create().then(id => {
            sessionIdRef.current = id;
            unsubsRef.current.forEach(fn => fn());
            unsubsRef.current = [];
            const unsubData = api.onData(id, data => term.write(data));
            const unsubExit = api.onExit(id, code => {
                setExited(true);
                setExitCode(code);
                term.writeln(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m`);
            });
            unsubsRef.current.push(unsubData, unsubExit);
            term.onData(data => api.input(id, data));
            term.onResize(({ cols, rows }) => api.resize(id, cols, rows));
            api.resize(id, term.cols, term.rows);
        });
    };

    // Not in Electron
    if (typeof window !== 'undefined' && !(window as Window & { termiElectron?: unknown }).termiElectron) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
                <MonitorX className="w-16 h-16 text-dark-600" />
                <h2 className="text-xl font-semibold text-dark-200">Desktop App Required</h2>
                <p className="text-dark-400 max-w-sm">
                    Local Terminal is only available in the Termi desktop app. Download it to access your local shell.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0d0d0d]">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-dark-900 border-b border-dark-800 flex-shrink-0">
                <div className="flex items-center gap-2 text-sm text-dark-300">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    Local Terminal
                </div>
                {exited ? (
                    <button
                        onClick={handleRestart}
                        className="text-xs px-3 py-1 rounded bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 transition-colors"
                    >
                        ↺ Restart Shell
                    </button>
                ) : (
                    <span className="text-xs text-dark-500">
                        {process.platform === 'win32' ? 'PowerShell' : (process.platform === 'darwin' ? 'zsh / bash' : 'bash')}
                    </span>
                )}
            </div>

            {/* xterm container */}
            <div
                ref={containerRef}
                className="flex-1 min-h-0 overflow-hidden"
                style={{ padding: '4px 8px' }}
            />

            {exited && exitCode !== 0 && (
                <div className="px-4 py-1.5 bg-red-500/10 border-t border-red-500/20 text-xs text-red-400 flex-shrink-0">
                    Shell exited with code {exitCode}. Click &quot;Restart Shell&quot; to start a new session.
                </div>
            )}
        </div>
    );
}
