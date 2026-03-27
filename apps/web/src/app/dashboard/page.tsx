'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Server, Terminal, FolderOpen, Monitor, Plus,
    Star, MoreVertical, Search, RefreshCw,
    Layers, Pencil, Trash2, AlertTriangle,
    LayoutGrid, List, KeyRound, Clock, Wifi, WifiOff, Activity,
    Copy, Check, User, HardDrive, ArrowDown, ArrowUp, Cpu, MemoryStick,
} from 'lucide-react';
import { useSessionsContext } from './sessions-context';
import dynamic from 'next/dynamic';
import type { RevealField } from '@/components/auth/PasskeyRevealModal';

const PasskeyRevealModal = dynamic(
    () => import('@/components/auth/PasskeyRevealModal'),
    { ssr: false }
);

interface ServerItem {
    id: string;
    name: string;
    description?: string;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC';
    tags: string[];
    isFavorite: boolean;
    hasPassword: boolean;
    lastUsedAt: string | null;
    host: string;
    username: string;
    port: number;
    group: {
        id: string;
        name: string;
        color: string | null;
    } | null;
}

interface ServerMetrics {
    reachable: boolean;
    latencyMs?: number;
    cpu?: number;
    ram?: { usedBytes: number; totalBytes: number; percent: number };
    disk?: { usedBytes: number; totalBytes: number; percent: number };
    network?: { rxBytes: number; txBytes: number };
    error?: string;
}

type ViewMode = 'grid' | 'list';

const protocolIcons = {
    SSH: Terminal,
    SCP: FolderOpen,
    RDP: Monitor,
    VNC: Monitor,
};

const protocolColors = {
    SSH: 'protocol-ssh',
    SCP: 'protocol-scp',
    RDP: 'protocol-rdp',
    VNC: 'protocol-vnc',
};

function formatBytes(bytes: number): string {
    if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
    if (bytes >= 1_073_741_824)     return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576)         return `${(bytes / 1_048_576).toFixed(1)} MB`;
    if (bytes >= 1024)              return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}

function formatRelativeTime(dateStr: string | null): string {
    if (!dateStr) return 'Never';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function MetricBar({ label, icon: Icon, percent, used, total }: {
    label: string;
    icon?: React.ElementType;
    percent: number;
    used: string;
    total?: string;
}) {
    const color =
        percent >= 90 ? 'bg-red-500' :
        percent >= 70 ? 'bg-yellow-500' :
        'bg-emerald-500';

    return (
        <div className="space-y-0.5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                    {Icon && <Icon className="w-2.5 h-2.5 text-dark-500" />}
                    <span className="text-[10px] text-dark-400 font-medium">{label}</span>
                </div>
                <span className="text-[10px] text-dark-300 tabular-nums">
                    {total ? <>{used}<span className="text-dark-600"> / {total}</span></> : used}
                </span>
            </div>
            <div className="h-1 bg-dark-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${color}`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                />
            </div>
        </div>
    );
}

function CopyButton({ text, className }: { text: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    const copy = (e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };
    return (
        <button
            onClick={copy}
            className={`p-0.5 rounded text-dark-500 hover:text-dark-200 transition-colors ${className ?? ''}`}
            title={`Copy ${text}`}
        >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
        </button>
    );
}

function StatusIndicator({ metrics, loading }: { metrics: ServerMetrics | null; loading: boolean }) {
    if (loading) return (
        <span className="flex items-center gap-1 text-[10px] text-dark-500">
            <span className="w-1.5 h-1.5 rounded-full bg-dark-500 animate-pulse" />
        </span>
    );
    if (!metrics) return null;
    if (!metrics.reachable) return (
        <span className="flex items-center gap-1">
            <WifiOff className="w-3 h-3 text-red-400" />
        </span>
    );
    return (
        <span className="flex items-center gap-1">
            <Wifi className="w-3 h-3 text-emerald-400" />
            {metrics.latencyMs != null && (
                <span className="text-[10px] text-emerald-400 tabular-nums">{metrics.latencyMs}ms</span>
            )}
        </span>
    );
}

// ─── Grid Card ───────────────────────────────────────────────────────────────

function GridCard({
    server, m, mLoading,
    onFavorite, onEdit, onDelete, onCopyPassword, onConnect, onSessions,
    menuOpen, setMenuOpen, menuRef,
}: {
    server: ServerItem;
    m: ServerMetrics | null;
    mLoading: boolean;
    onFavorite: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopyPassword: () => void;
    onConnect: () => void;
    onSessions: () => void;
    menuOpen: boolean;
    setMenuOpen: (v: boolean) => void;
    menuRef: React.RefObject<HTMLDivElement | null>;
}) {
    const Icon = protocolIcons[server.protocol];

    const hasMetrics = server.protocol === 'SSH' && m && m.reachable && !m.error;

    return (
        <div className="card card-hover group flex flex-col overflow-hidden">
            <div className="p-4 flex-1 space-y-3">
                {/* Title row */}
                <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${protocolColors[server.protocol]}`}>
                        <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <h3 className="font-semibold truncate text-sm leading-tight">{server.name}</h3>
                            <StatusIndicator metrics={m} loading={mLoading} />
                        </div>
                        {server.description && (
                            <p className="text-[11px] text-dark-400 truncate mt-0.5">{server.description}</p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={onFavorite}
                            className={`p-1 rounded transition-all ${
                                server.isFavorite
                                    ? 'text-yellow-400'
                                    : 'text-dark-600 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
                            }`}
                            title={server.isFavorite ? 'Remove favorite' : 'Add favorite'}
                        >
                            <Star className={`w-3.5 h-3.5 ${server.isFavorite ? 'fill-yellow-400' : ''}`} />
                        </button>

                        <div className="relative" ref={menuOpen ? menuRef : undefined}>
                            <button
                                onClick={() => setMenuOpen(!menuOpen)}
                                className="p-1 rounded text-dark-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <MoreVertical className="w-3.5 h-3.5" />
                            </button>
                            {menuOpen && (
                                <div className="absolute right-0 top-6 z-30 w-40 rounded-lg border border-dark-700 bg-dark-800 shadow-2xl py-1">
                                    <Link
                                        href={`/dashboard/servers/${server.id}`}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-dark-700 transition-colors"
                                    >
                                        <Activity className="w-3.5 h-3.5 text-dark-400" /> Details
                                    </Link>
                                    <button
                                        onClick={onEdit}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-dark-700 transition-colors"
                                    >
                                        <Pencil className="w-3.5 h-3.5 text-dark-400" /> Edit
                                    </button>
                                    {server.hasPassword && (
                                        <button
                                            onClick={onCopyPassword}
                                            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-dark-700 transition-colors"
                                        >
                                            <KeyRound className="w-3.5 h-3.5 text-dark-400" /> Copy Password
                                        </button>
                                    )}
                                    <div className="my-1 border-t border-dark-700" />
                                    <button
                                        onClick={onDelete}
                                        className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-dark-700 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" /> Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Host / User info */}
                <div className="rounded-md bg-dark-800/60 border border-dark-700/50 px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <Server className="w-3 h-3 text-dark-500 shrink-0" />
                            <span className="text-[11px] text-dark-200 font-mono truncate">{server.host}</span>
                            <span className="text-[10px] text-dark-500 shrink-0">:{server.port}</span>
                        </div>
                        <CopyButton text={`${server.host}:${server.port}`} />
                    </div>
                    <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3 h-3 text-dark-500 shrink-0" />
                        <span className="text-[11px] text-dark-300 font-mono truncate">{server.username}</span>
                    </div>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-1">
                    <span className={`badge text-[10px] px-1.5 py-0.5 ${protocolColors[server.protocol]}`}>
                        {server.protocol}
                    </span>
                    {server.group && (
                        <span
                            className="badge text-[10px] px-1.5 py-0.5"
                            style={{
                                backgroundColor: `${server.group.color}20`,
                                color: server.group.color || undefined,
                                borderColor: `${server.group.color}40`,
                            }}
                        >
                            {server.group.name}
                        </span>
                    )}
                    {server.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="badge text-[10px] px-1.5 py-0.5 bg-dark-700 text-dark-300">
                            {tag}
                        </span>
                    ))}
                </div>

                {/* SSH Metrics */}
                {hasMetrics && (
                    <div className="space-y-2">
                        {m!.cpu != null && (
                            <MetricBar
                                label="CPU"
                                icon={Cpu}
                                percent={m!.cpu}
                                used={`${m!.cpu}%`}
                            />
                        )}
                        {m!.ram && (
                            <MetricBar
                                label="RAM"
                                icon={MemoryStick}
                                percent={m!.ram.percent}
                                used={formatBytes(m!.ram.usedBytes)}
                                total={formatBytes(m!.ram.totalBytes)}
                            />
                        )}
                        {m!.disk && (
                            <MetricBar
                                label="Disk"
                                icon={HardDrive}
                                percent={m!.disk.percent}
                                used={formatBytes(m!.disk.usedBytes)}
                                total={formatBytes(m!.disk.totalBytes)}
                            />
                        )}
                        {m!.network && (
                            <div className="flex items-center gap-3 text-[10px] text-dark-400">
                                <span className="flex items-center gap-1">
                                    <ArrowDown className="w-2.5 h-2.5 text-emerald-500" />
                                    {formatBytes(m!.network.rxBytes)}
                                </span>
                                <span className="flex items-center gap-1">
                                    <ArrowUp className="w-2.5 h-2.5 text-blue-400" />
                                    {formatBytes(m!.network.txBytes)}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Last used */}
                <div className="flex items-center gap-1 text-[10px] text-dark-500">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(server.lastUsedAt)}
                </div>
            </div>

            {/* Footer */}
            <div className="px-3 py-2.5 border-t border-dark-700/60 bg-dark-900/40 flex gap-1.5">
                <button
                    onClick={onConnect}
                    className="btn btn-primary flex-1 justify-center text-xs py-1.5 h-auto"
                >
                    Connect
                </button>
                {server.hasPassword && (
                    <button
                        onClick={onCopyPassword}
                        className="btn btn-secondary btn-icon shrink-0 h-auto py-1.5 px-2"
                        title="Copy password (passkey required)"
                    >
                        <KeyRound className="w-3.5 h-3.5" />
                    </button>
                )}
                {server.protocol === 'SSH' && (
                    <button
                        onClick={onSessions}
                        className="btn btn-secondary btn-icon shrink-0 h-auto py-1.5 px-2"
                        title="Open in Sessions tab"
                    >
                        <Layers className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function ListRow({
    server, m, mLoading,
    onFavorite, onEdit, onDelete, onCopyPassword, onConnect, onSessions,
    menuOpen, setMenuOpen, menuRef,
}: {
    server: ServerItem;
    m: ServerMetrics | null;
    mLoading: boolean;
    onFavorite: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCopyPassword: () => void;
    onConnect: () => void;
    onSessions: () => void;
    menuOpen: boolean;
    setMenuOpen: (v: boolean) => void;
    menuRef: React.RefObject<HTMLDivElement | null>;
}) {
    const Icon = protocolIcons[server.protocol];

    return (
        <div className="group flex items-center gap-3 px-4 py-3 border-b border-dark-700/50 last:border-0 hover:bg-dark-800/50 transition-colors">
            {/* Protocol icon */}
            <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${protocolColors[server.protocol]}`}>
                <Icon className="w-3.5 h-3.5" />
            </div>

            {/* Name + host */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{server.name}</span>
                    <StatusIndicator metrics={m} loading={mLoading} />
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[11px] text-dark-400 font-mono truncate">{server.username}@{server.host}</span>
                    <span className="text-[10px] text-dark-600 shrink-0">:{server.port}</span>
                    <CopyButton text={`${server.host}:${server.port}`} />
                </div>
            </div>

            {/* Group / tags — hidden on small screens */}
            <div className="hidden lg:flex items-center gap-1.5 shrink-0">
                {server.group && (
                    <span
                        className="badge text-[10px] px-1.5 py-0.5"
                        style={{
                            backgroundColor: `${server.group.color}20`,
                            color: server.group.color || undefined,
                        }}
                    >
                        {server.group.name}
                    </span>
                )}
                {server.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className="badge text-[10px] px-1.5 py-0.5 bg-dark-700 text-dark-300">
                        {tag}
                    </span>
                ))}
            </div>

            {/* SSH inline metrics — hidden on small screens */}
            {server.protocol === 'SSH' && m && m.reachable && !m.error && (
                <div className="hidden xl:flex items-center gap-3 shrink-0">
                    {m.cpu != null && (
                        <div className="flex items-center gap-1 text-[10px] tabular-nums">
                            <Cpu className="w-3 h-3 text-dark-500" />
                            <span className={m.cpu >= 90 ? 'text-red-400' : m.cpu >= 70 ? 'text-yellow-400' : 'text-dark-300'}>
                                {m.cpu}%
                            </span>
                        </div>
                    )}
                    {m.ram && (
                        <div className="flex items-center gap-1 text-[10px] text-dark-400 tabular-nums">
                            <MemoryStick className="w-3 h-3 text-dark-500" />
                            {formatBytes(m.ram.usedBytes)}<span className="text-dark-600">/{formatBytes(m.ram.totalBytes)}</span>
                        </div>
                    )}
                    {m.disk && (
                        <div className="flex items-center gap-1 text-[10px] text-dark-400 tabular-nums">
                            <HardDrive className="w-3 h-3 text-dark-500" />
                            {formatBytes(m.disk.usedBytes)}<span className="text-dark-600">/{formatBytes(m.disk.totalBytes)}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Last used */}
            <div className="hidden md:flex items-center gap-1 text-[10px] text-dark-500 w-16 shrink-0 justify-end">
                {formatRelativeTime(server.lastUsedAt)}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
                <button
                    onClick={onFavorite}
                    className={`p-1 rounded transition-all ${
                        server.isFavorite
                            ? 'text-yellow-400'
                            : 'text-dark-600 opacity-0 group-hover:opacity-100 hover:text-yellow-400'
                    }`}
                >
                    <Star className={`w-3.5 h-3.5 ${server.isFavorite ? 'fill-yellow-400' : ''}`} />
                </button>

                {server.hasPassword && (
                    <button
                        onClick={onCopyPassword}
                        className="p-1.5 rounded text-dark-500 hover:text-primary-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Copy password (passkey required)"
                    >
                        <KeyRound className="w-3.5 h-3.5" />
                    </button>
                )}

                <button
                    onClick={onConnect}
                    className="btn btn-primary text-xs py-1 h-auto px-2.5"
                >
                    Connect
                </button>

                {server.protocol === 'SSH' && (
                    <button
                        onClick={onSessions}
                        className="btn btn-secondary btn-icon h-auto py-1.5 px-1.5 opacity-0 group-hover:opacity-100 transition-all"
                        title="Open in Sessions"
                    >
                        <Layers className="w-3.5 h-3.5" />
                    </button>
                )}

                <div className="relative" ref={menuOpen ? menuRef : undefined}>
                    <button
                        onClick={() => setMenuOpen(!menuOpen)}
                        className="p-1 rounded text-dark-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                    >
                        <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                    {menuOpen && (
                        <div className="absolute right-0 top-6 z-30 w-40 rounded-lg border border-dark-700 bg-dark-800 shadow-2xl py-1">
                            <Link
                                href={`/dashboard/servers/${server.id}`}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-dark-700 transition-colors"
                            >
                                <Activity className="w-3.5 h-3.5 text-dark-400" /> Details
                            </Link>
                            <button
                                onClick={onEdit}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-dark-700 transition-colors"
                            >
                                <Pencil className="w-3.5 h-3.5 text-dark-400" /> Edit
                            </button>
                            {server.hasPassword && (
                                <button
                                    onClick={onCopyPassword}
                                    className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-dark-700 transition-colors"
                                >
                                    <KeyRound className="w-3.5 h-3.5 text-dark-400" /> Copy Password
                                </button>
                            )}
                            <div className="my-1 border-t border-dark-700" />
                            <button
                                onClick={onDelete}
                                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-dark-700 transition-colors"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const router = useRouter();
    const { addSession, sessions } = useSessionsContext();

    const [servers, setServers] = useState<ServerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');
    const [viewMode, setViewMode] = useState<ViewMode>('grid');
    const [metrics, setMetrics] = useState<Record<string, ServerMetrics | null>>({});
    const [metricsLoading, setMetricsLoading] = useState<Record<string, boolean>>({});
    const [openMenu, setOpenMenu] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<ServerItem | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [revealTarget, setRevealTarget] = useState<{ server: ServerItem; field: RevealField } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Persist view preference
    useEffect(() => {
        const saved = localStorage.getItem('dashboard-view') as ViewMode | null;
        if (saved === 'grid' || saved === 'list') setViewMode(saved);
    }, []);

    const switchView = (v: ViewMode) => {
        setViewMode(v);
        localStorage.setItem('dashboard-view', v);
    };

    const fetchServers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.set('q', searchQuery);
            if (filter === 'favorites') params.set('favorites', 'true');

            const response = await fetch(`/api/servers?${params}`);
            const data = await response.json();
            if (data.success) setServers(data.data.servers);
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMetrics = useCallback(async (serverList: ServerItem[]) => {
        if (serverList.length === 0) return;
        const loadingState: Record<string, boolean> = {};
        serverList.forEach((s) => { loadingState[s.id] = true; });
        setMetricsLoading(loadingState);

        await Promise.all(
            serverList.map(async (server, i) => {
                await new Promise((r) => setTimeout(r, i * 80));
                try {
                    const res = await fetch(`/api/servers/${server.id}/metrics`);
                    const data = await res.json();
                    if (data.success) setMetrics((prev) => ({ ...prev, [server.id]: data.data.metrics }));
                } catch {
                    setMetrics((prev) => ({ ...prev, [server.id]: null }));
                } finally {
                    setMetricsLoading((prev) => ({ ...prev, [server.id]: false }));
                }
            })
        );
    }, []);

    useEffect(() => { fetchServers(); }, [searchQuery, filter]);

    useEffect(() => {
        if (!loading && servers.length > 0) fetchMetrics(servers);
    }, [loading, servers, fetchMetrics]);

    useEffect(() => {
        if (servers.length === 0) return;
        const interval = setInterval(() => fetchMetrics(servers), 30_000);
        return () => clearInterval(interval);
    }, [servers, fetchMetrics]);

    const toggleFavorite = async (serverId: string) => {
        const server = servers.find((s) => s.id === serverId);
        if (!server) return;
        await fetch(`/api/servers/${serverId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isFavorite: !server.isFavorite }),
        });
        setServers(servers.map((s) => s.id === serverId ? { ...s, isFavorite: !s.isFavorite } : s));
    };

    const openInSessions = async (server: ServerItem) => {
        const alreadyOpen = sessions.some(s => s.serverId === server.id);
        if (!alreadyOpen) await addSession(server.id, server.name);
        router.push('/dashboard/sessions');
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/servers/${deleteConfirm.id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setServers((prev) => prev.filter((s) => s.id !== deleteConfirm.id));
                setMetrics((prev) => { const next = { ...prev }; delete next[deleteConfirm.id]; return next; });
                setDeleteConfirm(null);
            }
        } finally {
            setDeleting(false);
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        if (!openMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenu(null);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [openMenu]);

    const sharedProps = (server: ServerItem) => ({
        server,
        m: metrics[server.id] ?? null,
        mLoading: metricsLoading[server.id] ?? false,
        onFavorite: () => toggleFavorite(server.id),
        onEdit: () => { router.push(`/dashboard/servers/${server.id}/edit`); setOpenMenu(null); },
        onDelete: () => { setDeleteConfirm(server); setOpenMenu(null); },
        onCopyPassword: () => { setRevealTarget({ server, field: 'password' }); setOpenMenu(null); },
        onConnect: () => router.push(`/dashboard/connect/${server.id}/${server.protocol.toLowerCase()}`),
        onSessions: () => openInSessions(server),
        menuOpen: openMenu === server.id,
        setMenuOpen: (v: boolean) => setOpenMenu(v ? server.id : null),
        menuRef,
    });

    return (
        <>
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-bold">Servers</h1>
                    <p className="text-sm text-dark-400 mt-0.5">
                        {servers.length > 0
                            ? `${servers.length} server${servers.length === 1 ? '' : 's'}`
                            : 'Manage and connect to your servers'}
                    </p>
                </div>
                <Link href="/dashboard/servers/new" className="btn btn-primary text-sm">
                    <Plus className="w-4 h-4" />
                    Add Server
                </Link>
            </div>

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
                {/* Search */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                    <input
                        type="text"
                        placeholder="Search servers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input pl-9 text-sm h-9"
                    />
                </div>

                <div className="flex gap-2 shrink-0">
                    {/* Filter */}
                    <button
                        onClick={() => setFilter('all')}
                        className={`btn text-xs h-9 px-3 ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilter('favorites')}
                        className={`btn text-xs h-9 px-3 ${filter === 'favorites' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        <Star className="w-3.5 h-3.5" />
                        Starred
                    </button>

                    {/* Divider */}
                    <div className="w-px bg-dark-700 self-stretch" />

                    {/* View toggle */}
                    <div className="flex rounded-lg border border-dark-700 overflow-hidden">
                        <button
                            onClick={() => switchView('grid')}
                            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'grid' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-white hover:bg-dark-700'}`}
                            title="Grid view"
                        >
                            <LayoutGrid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => switchView('list')}
                            className={`px-2.5 py-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary-600 text-white' : 'text-dark-400 hover:text-white hover:bg-dark-700'}`}
                            title="List view"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Refresh */}
                    <button
                        onClick={fetchServers}
                        className="btn btn-secondary btn-icon h-9 w-9"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                viewMode === 'grid' ? (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="card p-4">
                                <div className="flex items-start gap-3">
                                    <div className="w-9 h-9 rounded-lg skeleton" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-28 skeleton rounded" />
                                        <div className="h-3 w-20 skeleton rounded" />
                                    </div>
                                </div>
                                <div className="mt-3 space-y-1.5">
                                    <div className="h-2 skeleton rounded" />
                                    <div className="h-2 skeleton rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="card overflow-hidden">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-dark-700/50 last:border-0">
                                <div className="w-8 h-8 rounded-md skeleton" />
                                <div className="flex-1 space-y-1.5">
                                    <div className="h-3.5 w-32 skeleton rounded" />
                                    <div className="h-3 w-20 skeleton rounded" />
                                </div>
                                <div className="h-7 w-16 skeleton rounded" />
                            </div>
                        ))}
                    </div>
                )
            ) : servers.length === 0 ? (
                <div className="card p-16 text-center">
                    <Server className="w-12 h-12 mx-auto text-dark-600 mb-4" />
                    <h3 className="font-medium mb-1.5">No servers yet</h3>
                    <p className="text-sm text-dark-400 mb-6">Add your first server to get started</p>
                    <Link href="/dashboard/servers/new" className="btn btn-primary">
                        <Plus className="w-4 h-4" /> Add Server
                    </Link>
                </div>
            ) : viewMode === 'grid' ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {servers.map((server) => (
                        <GridCard key={server.id} {...sharedProps(server)} />
                    ))}
                </div>
            ) : (
                <div className="card overflow-hidden">
                    {/* List header */}
                    <div className="flex items-center gap-3 px-4 py-2 border-b border-dark-700/60 bg-dark-900/40">
                        <div className="w-8 shrink-0" />
                        <div className="flex-1 text-[11px] text-dark-500 font-medium uppercase tracking-wider">Server</div>
                        <div className="hidden lg:block w-32 text-[11px] text-dark-500 font-medium uppercase tracking-wider shrink-0">Group / Tags</div>
                        <div className="hidden xl:block w-40 text-[11px] text-dark-500 font-medium uppercase tracking-wider shrink-0">Metrics</div>
                        <div className="hidden md:block w-16 text-[11px] text-dark-500 font-medium uppercase tracking-wider shrink-0 text-right">Last Used</div>
                        <div className="w-32 shrink-0" />
                    </div>
                    {servers.map((server) => (
                        <ListRow key={server.id} {...sharedProps(server)} />
                    ))}
                </div>
            )}
        </div>

        {/* Delete confirmation modal */}
        {deleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div className="card w-full max-w-md mx-4 p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-5 h-5 text-red-400" />
                        </div>
                        <div>
                            <h2 className="font-semibold">Delete Server</h2>
                            <p className="text-sm text-dark-400">This action cannot be undone.</p>
                        </div>
                    </div>
                    <p className="text-sm text-dark-300 mb-6">
                        Are you sure you want to delete{' '}
                        <span className="font-medium text-white">{deleteConfirm.name}</span>?
                        All associated data will be permanently removed.
                    </p>
                    <div className="flex gap-3 justify-end">
                        <button onClick={() => setDeleteConfirm(null)} disabled={deleting} className="btn btn-secondary">
                            Cancel
                        </button>
                        <button onClick={handleDelete} disabled={deleting} className="btn bg-red-600 hover:bg-red-500 text-white">
                            {deleting ? 'Deleting…' : 'Delete'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Passkey credential reveal modal */}
        {revealTarget && (
            <PasskeyRevealModal
                serverId={revealTarget.server.id}
                serverName={revealTarget.server.name}
                field={revealTarget.field}
                onClose={() => setRevealTarget(null)}
            />
        )}
        </>
    );
}
