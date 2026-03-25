'use client';

import {
    useEffect, useState, useRef, useCallback, useId,
} from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
    Plus, X, ArrowLeftRight, Terminal, FolderOpen,
    RotateCcw, Loader2, AlertCircle, ArrowRight, ArrowLeft,
    Check, Server, Maximize2, Minimize2,
} from 'lucide-react';
import FileManagerPanel, { type RemoteEntry } from '@/components/scp/FileManagerPanel';

const SSHTerminal = dynamic(() => import('@/components/terminal/SSHTerminal'), { ssr: false });

// ============================================================================
// TYPES
// ============================================================================

type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface Session {
    tabId: string;
    serverId: string;
    serverName: string;
    token: string | null;
    status: SessionStatus;
    showFiles: boolean;
}

interface ServerItem {
    id: string;
    name: string;
    protocol: string;
    description?: string;
}

// ============================================================================
// SERVER PICKER MODAL
// ============================================================================

function ServerPicker({
    onPick,
    onClose,
    exclude = [],
}: {
    onPick: (server: ServerItem) => void;
    onClose: () => void;
    exclude?: string[];
}) {
    const [servers, setServers] = useState<ServerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');

    useEffect(() => {
        fetch('/api/servers')
            .then(r => r.json())
            .then(d => { if (d.success) setServers(d.data.servers); })
            .finally(() => setLoading(false));
    }, []);

    const filtered = servers
        .filter(s => !exclude.includes(s.id))
        .filter(s => s.name.toLowerCase().includes(query.toLowerCase()));

    const sshServers = filtered.filter(s => s.protocol === 'SSH');
    const otherServers = filtered.filter(s => s.protocol !== 'SSH');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 shrink-0">
                    <h3 className="font-semibold text-white">Open Server</h3>
                    <button onClick={onClose} className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4 shrink-0">
                    <input
                        autoFocus
                        type="text"
                        placeholder="Search servers…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="input text-sm"
                    />
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-4">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                        </div>
                    ) : sshServers.length === 0 && otherServers.length === 0 ? (
                        <p className="text-center text-sm text-slate-500 py-8">No servers found</p>
                    ) : (
                        <>
                            {sshServers.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => onPick(s)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700 text-left transition-colors group"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                                        <Terminal className="w-4 h-4 text-green-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-white truncate">{s.name}</p>
                                        {s.description && (
                                            <p className="text-xs text-slate-400 truncate">{s.description}</p>
                                        )}
                                    </div>
                                    <span className="text-xs text-green-400 badge bg-green-500/10 shrink-0">{s.protocol}</span>
                                </button>
                            ))}
                            {otherServers.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => onPick(s)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700 text-left transition-colors opacity-60"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center shrink-0">
                                        <Server className="w-4 h-4 text-slate-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm text-white truncate">{s.name}</p>
                                    </div>
                                    <span className="text-xs text-slate-400 badge bg-slate-700 shrink-0">{s.protocol}</span>
                                </button>
                            ))}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// TRANSFER PANEL HEADER
// ============================================================================

function TransferPanelHeader({
    label,
    serverId,
    setServerId,
    servers,
}: {
    label: string;
    serverId: string;
    setServerId: (id: string) => void;
    servers: ServerItem[];
}) {
    return (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide w-10 shrink-0">{label}</span>
            <select
                value={serverId}
                onChange={e => setServerId(e.target.value)}
                className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-sky-500"
            >
                {servers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>
        </div>
    );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SessionsPage() {
    const searchParams = useSearchParams();
    const uid = useId();

    const [sessions, setSessions] = useState<Session[]>([]);
    const [activeTabId, setActiveTabId] = useState<string | null>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [mode, setMode] = useState<'terminal' | 'transfer'>('terminal');

    // Transfer state
    const [allServers, setAllServers] = useState<ServerItem[]>([]);
    const [leftServerId, setLeftServerId] = useState('');
    const [rightServerId, setRightServerId] = useState('');
    const [leftSelected, setLeftSelected] = useState<RemoteEntry[]>([]);
    const [leftPath, setLeftPath] = useState('/');
    const [rightSelected, setRightSelected] = useState<RemoteEntry[]>([]);
    const [rightPath, setRightPath] = useState('/');
    const [transferring, setTransferring] = useState(false);
    const [transferLog, setTransferLog] = useState<{ msg: string; ok: boolean }[]>([]);

    // Load server list for transfer panel dropdowns
    useEffect(() => {
        fetch('/api/servers')
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    setAllServers(d.data.servers);
                    const sshServers: ServerItem[] = d.data.servers.filter(
                        (s: ServerItem) => s.protocol === 'SSH'
                    );
                    if (sshServers.length > 0) setLeftServerId(sshServers[0].id);
                    if (sshServers.length > 1) setRightServerId(sshServers[1].id);
                    else if (sshServers.length === 1) setRightServerId(sshServers[0].id);
                }
            });
    }, []);

    // Auto-open server from query param: /sessions?add=serverId
    useEffect(() => {
        const addId = searchParams.get('add');
        if (addId && sessions.length === 0) {
            addSession(addId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Session management ─────────────────────────────────────────────────

    const addSession = useCallback(async (serverId: string, serverName?: string) => {
        const tabId = `${uid}-${Date.now()}`;

        // Fetch server name if not provided
        let name = serverName ?? '';
        if (!name) {
            try {
                const res = await fetch(`/api/servers/${serverId}`);
                const data = await res.json();
                if (data.success) name = data.data.server.name;
            } catch { name = serverId; }
        }

        // Add the session immediately (token will arrive shortly)
        const newSession: Session = {
            tabId, serverId, serverName: name,
            token: null, status: 'connecting', showFiles: false,
        };
        setSessions(prev => [...prev, newSession]);
        setActiveTabId(tabId);
        setMode('terminal');

        // Generate connection token
        try {
            const res = await fetch('/api/connection/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ serverId, protocol: 'ssh' }),
            });
            const data = await res.json();
            if (data.success) {
                setSessions(prev => prev.map(s =>
                    s.tabId === tabId ? { ...s, token: data.data.token } : s
                ));
            } else {
                setSessions(prev => prev.map(s =>
                    s.tabId === tabId ? { ...s, status: 'error' } : s
                ));
            }
        } catch {
            setSessions(prev => prev.map(s =>
                s.tabId === tabId ? { ...s, status: 'error' } : s
            ));
        }
    }, [uid]);

    function removeSession(tabId: string) {
        setSessions(prev => {
            const remaining = prev.filter(s => s.tabId !== tabId);
            if (activeTabId === tabId) {
                setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].tabId : null);
            }
            return remaining;
        });
    }

    function toggleFiles(tabId: string) {
        setSessions(prev => prev.map(s =>
            s.tabId === tabId ? { ...s, showFiles: !s.showFiles } : s
        ));
    }

    // When switching tabs, trigger a window resize so xterm refits
    function switchTab(tabId: string) {
        setActiveTabId(tabId);
        setMode('terminal');
        setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    }

    const activeSession = sessions.find(s => s.tabId === activeTabId) ?? null;

    // ── Transfer ───────────────────────────────────────────────────────────

    async function doTransfer(direction: 'lr' | 'rl') {
        const fromPaths = direction === 'lr'
            ? leftSelected.filter(e => e.type !== 'dir').map(e => e.path)
            : rightSelected.filter(e => e.type !== 'dir').map(e => e.path);
        const fromServerId = direction === 'lr' ? leftServerId : rightServerId;
        const toServerId = direction === 'lr' ? rightServerId : leftServerId;
        const toPath = direction === 'lr' ? rightPath : leftPath;

        if (fromPaths.length === 0) return;

        setTransferring(true);
        setTransferLog([]);
        try {
            const res = await fetch('/api/servers/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fromServerId, fromPaths, toServerId, toPath }),
            });
            const data = await res.json();
            if (data.success) {
                const { ok, failed } = data.data;
                const logs = [
                    ...ok.map((p: string) => ({ msg: p.split('/').pop()! + ' — transferred', ok: true })),
                    ...failed.map((f: { path: string; error: string }) => ({
                        msg: f.path.split('/').pop()! + ': ' + f.error, ok: false,
                    })),
                ];
                setTransferLog(logs);
            } else {
                setTransferLog([{ msg: data.error ?? 'Transfer failed', ok: false }]);
            }
        } catch {
            setTransferLog([{ msg: 'Network error', ok: false }]);
        } finally {
            setTransferring(false);
        }
    }

    // ── Tab status indicator ───────────────────────────────────────────────

    function StatusDot({ status }: { status: SessionStatus }) {
        const cls = {
            connecting: 'bg-yellow-400 animate-pulse',
            connected: 'bg-green-400',
            disconnected: 'bg-slate-500',
            error: 'bg-red-400',
        }[status];
        return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
    }

    const sshServers = allServers.filter(s => s.protocol === 'SSH');

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)]">

            {/* ── Tab bar ── */}
            <div className="shrink-0 flex items-center gap-0 border-b border-slate-700 bg-slate-900/60 overflow-x-auto no-scrollbar">
                {/* Tabs */}
                <div className="flex items-end gap-0 flex-1 min-w-0 overflow-x-auto no-scrollbar">
                    {sessions.length === 0 && (
                        <span className="px-4 py-3 text-sm text-slate-600 italic">
                            No sessions — click + to open a server
                        </span>
                    )}
                    {sessions.map(session => (
                        <div
                            key={session.tabId}
                            className={`group flex items-center gap-2 px-3 py-2.5 border-b-2 cursor-pointer select-none shrink-0 transition-colors
                                ${activeTabId === session.tabId && mode === 'terminal'
                                    ? 'border-sky-500 bg-slate-800 text-white'
                                    : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-800/50'
                                }`}
                            onClick={() => switchTab(session.tabId)}
                        >
                            <StatusDot status={session.status} />
                            <span className="text-sm font-medium max-w-[120px] truncate">
                                {session.serverName}
                            </span>
                            <button
                                onClick={e => { e.stopPropagation(); removeSession(session.tabId); }}
                                className="p-0.5 rounded hover:bg-slate-600 text-slate-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Close tab"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Right-side controls */}
                <div className="flex items-center gap-1 px-2 shrink-0">
                    <button
                        onClick={() => setShowPicker(true)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                        title="Open new session"
                    >
                        <Plus className="w-4 h-4" />
                    </button>

                    <div className="w-px h-5 bg-slate-700 mx-1" />

                    <button
                        onClick={() => setMode(m => m === 'transfer' ? 'terminal' : 'transfer')}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                            ${mode === 'transfer'
                                ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-700'
                            }`}
                        title="Toggle transfer mode"
                    >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Transfer</span>
                    </button>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="flex-1 min-h-0 pt-3">

                {/* ── Transfer mode ── */}
                {mode === 'transfer' && (
                    <div className="flex h-full gap-0">
                        {/* Left panel */}
                        <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-slate-700 overflow-hidden">
                            {sshServers.length > 0 && (
                                <TransferPanelHeader
                                    label="From"
                                    serverId={leftServerId}
                                    setServerId={id => { setLeftServerId(id); setLeftSelected([]); }}
                                    servers={sshServers}
                                />
                            )}
                            {leftServerId ? (
                                <div className="flex-1 min-h-0">
                                    <FileManagerPanel
                                        key={leftServerId}
                                        serverId={leftServerId}
                                        onSelectionChange={(sel, path) => {
                                            setLeftSelected(sel);
                                            setLeftPath(path);
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-slate-600">
                                    <p className="text-sm">No SSH servers available</p>
                                </div>
                            )}
                        </div>

                        {/* Middle: transfer controls */}
                        <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-3 px-1">
                            {/* Left → Right */}
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    onClick={() => doTransfer('lr')}
                                    disabled={transferring || leftSelected.filter(e => e.type !== 'dir').length === 0}
                                    className="p-2 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:bg-sky-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Copy selected → right"
                                >
                                    {transferring
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <ArrowRight className="w-4 h-4" />
                                    }
                                </button>
                                {leftSelected.filter(e => e.type !== 'dir').length > 0 && (
                                    <span className="text-[10px] text-sky-400 font-medium">
                                        {leftSelected.filter(e => e.type !== 'dir').length}
                                    </span>
                                )}
                            </div>

                            {/* Right → Left */}
                            <div className="flex flex-col items-center gap-1">
                                <button
                                    onClick={() => doTransfer('rl')}
                                    disabled={transferring || rightSelected.filter(e => e.type !== 'dir').length === 0}
                                    className="p-2 rounded-lg bg-sky-500/20 border border-sky-500/30 text-sky-400 hover:bg-sky-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    title="Copy selected ← left"
                                >
                                    {transferring
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <ArrowLeft className="w-4 h-4" />
                                    }
                                </button>
                                {rightSelected.filter(e => e.type !== 'dir').length > 0 && (
                                    <span className="text-[10px] text-sky-400 font-medium">
                                        {rightSelected.filter(e => e.type !== 'dir').length}
                                    </span>
                                )}
                            </div>

                            {/* Transfer log */}
                            {transferLog.length > 0 && (
                                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-xl p-3 space-y-1 max-h-40 overflow-y-auto">
                                    {transferLog.map((entry, i) => (
                                        <div key={i} className="flex items-start gap-1.5">
                                            {entry.ok
                                                ? <Check className="w-3 h-3 text-green-400 shrink-0 mt-0.5" />
                                                : <AlertCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                                            }
                                            <span className={`text-[11px] break-all ${entry.ok ? 'text-slate-300' : 'text-red-400'}`}>
                                                {entry.msg}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right panel */}
                        <div className="flex-1 min-w-0 flex flex-col rounded-xl border border-slate-700 overflow-hidden">
                            {sshServers.length > 0 && (
                                <TransferPanelHeader
                                    label="To"
                                    serverId={rightServerId}
                                    setServerId={id => { setRightServerId(id); setRightSelected([]); }}
                                    servers={sshServers}
                                />
                            )}
                            {rightServerId ? (
                                <div className="flex-1 min-h-0">
                                    <FileManagerPanel
                                        key={rightServerId}
                                        serverId={rightServerId}
                                        onSelectionChange={(sel, path) => {
                                            setRightSelected(sel);
                                            setRightPath(path);
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-slate-600">
                                    <p className="text-sm">No SSH servers available</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Terminal mode ── */}
                {mode === 'terminal' && (
                    <>
                        {sessions.length === 0 ? (
                            /* Empty state */
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                                    <Terminal className="w-7 h-7 text-slate-500" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-white mb-1">No active sessions</h2>
                                    <p className="text-sm text-slate-400">Open a server to start a terminal session</p>
                                </div>
                                <button
                                    onClick={() => setShowPicker(true)}
                                    className="btn btn-primary gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Open Server
                                </button>
                            </div>
                        ) : (
                            /* All terminals stacked — only active is visible */
                            <div className="relative h-full">
                                {sessions.map(session => (
                                    <div
                                        key={session.tabId}
                                        className="absolute inset-0 flex flex-col gap-3"
                                        style={{
                                            visibility: activeTabId === session.tabId ? 'visible' : 'hidden',
                                            // Keep in DOM so WebSocket connection persists;
                                            // use visibility (not display:none) to preserve layout dimensions
                                            pointerEvents: activeTabId === session.tabId ? 'auto' : 'none',
                                        }}
                                    >
                                        {/* Per-tab toolbar */}
                                        <div className="shrink-0 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                                <Terminal className="w-4 h-4" />
                                                <span>{session.serverName}</span>
                                                <StatusDot status={session.status} />
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => toggleFiles(session.tabId)}
                                                    className={`btn btn-sm gap-1.5 ${session.showFiles ? 'btn-primary' : 'btn-ghost'}`}
                                                    title="Toggle file manager"
                                                >
                                                    <FolderOpen className="w-3.5 h-3.5" />
                                                    <span className="hidden sm:inline text-xs">Files</span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setSessions(prev => prev.map(s =>
                                                            s.tabId === session.tabId
                                                                ? { ...s, token: null, status: 'connecting' }
                                                                : s
                                                        ));
                                                        addSession(session.serverId, session.serverName);
                                                    }}
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    title="Reconnect"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => removeSession(session.tabId)}
                                                    className="btn btn-ghost btn-icon btn-sm text-red-400 hover:text-red-300"
                                                    title="Close session"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Terminal + optional file panel */}
                                        <div className="flex flex-1 min-h-0 gap-3">
                                            {/* Terminal */}
                                            <div className="flex-1 min-w-0 min-h-0">
                                                {session.status === 'error' || (!session.token && session.status !== 'connecting') ? (
                                                    <div className="flex flex-col items-center justify-center h-full gap-3 bg-slate-900 rounded-xl border border-slate-700">
                                                        <AlertCircle className="w-8 h-8 text-red-400" />
                                                        <p className="text-sm text-red-400">Failed to connect</p>
                                                        <button
                                                            onClick={() => addSession(session.serverId, session.serverName)}
                                                            className="btn btn-secondary btn-sm gap-1.5"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" /> Retry
                                                        </button>
                                                    </div>
                                                ) : !session.token ? (
                                                    <div className="flex items-center justify-center h-full bg-slate-900 rounded-xl border border-slate-700">
                                                        <div className="flex items-center gap-2 text-slate-400">
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                            <span className="text-sm">Connecting…</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <SSHTerminal
                                                        serverId={session.serverId}
                                                        connectionToken={session.token}
                                                        onDisconnect={() => setSessions(prev => prev.map(s =>
                                                            s.tabId === session.tabId ? { ...s, status: 'disconnected' } : s
                                                        ))}
                                                        onError={() => setSessions(prev => prev.map(s =>
                                                            s.tabId === session.tabId ? { ...s, status: 'error' } : s
                                                        ))}
                                                        onKeyHandlerReady={() => {
                                                            setSessions(prev => prev.map(s =>
                                                                s.tabId === session.tabId ? { ...s, status: 'connected' } : s
                                                            ));
                                                        }}
                                                    />
                                                )}
                                            </div>

                                            {/* File panel */}
                                            {session.showFiles && (
                                                <div className="hidden md:flex w-80 lg:w-96 shrink-0 flex-col rounded-xl border border-slate-700 overflow-hidden">
                                                    <FileManagerPanel
                                                        serverId={session.serverId}
                                                        onClose={() => toggleFiles(session.tabId)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Server picker */}
            {showPicker && (
                <ServerPicker
                    onClose={() => setShowPicker(false)}
                    onPick={server => {
                        setShowPicker(false);
                        addSession(server.id, server.name);
                    }}
                    exclude={sessions.map(s => s.serverId)}
                />
            )}
        </div>
    );
}
