'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Server,
    Terminal,
    FolderOpen,
    Monitor,
    Plus,
    Star,
    StarOff,
    MoreVertical,
    Search,
    RefreshCw,
    Layers,
} from 'lucide-react';
import { useSessionsContext } from './sessions-context';

interface ServerItem {
    id: string;
    name: string;
    description?: string;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC';
    tags: string[];
    isFavorite: boolean;
    lastUsedAt: string | null;
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
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}G`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}M`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}K`;
    return `${bytes}B`;
}

function MetricBar({ label, percent, value }: { label: string; percent: number; value: string }) {
    const color =
        percent >= 90 ? 'bg-red-500' :
        percent >= 70 ? 'bg-yellow-500' :
        'bg-green-500';

    return (
        <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] text-dark-400 w-7 shrink-0">{label}</span>
            <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${color}`}
                    style={{ width: `${Math.min(100, percent)}%` }}
                />
            </div>
            <span className="text-[10px] text-dark-300 w-8 text-right shrink-0">{value}</span>
        </div>
    );
}

function StatusDot({ metrics, loading }: { metrics: ServerMetrics | null; loading: boolean }) {
    if (loading) {
        return <span className="w-2 h-2 rounded-full bg-dark-500 animate-pulse" title="Checking..." />;
    }
    if (!metrics) return null;

    if (!metrics.reachable) {
        return <span className="w-2 h-2 rounded-full bg-red-500" title="Offline" />;
    }

    const label = metrics.latencyMs != null ? `Online · ${metrics.latencyMs}ms` : 'Online';
    return <span className="w-2 h-2 rounded-full bg-green-500" title={label} />;
}

export default function DashboardPage() {
    const router = useRouter();
    const { addSession, sessions } = useSessionsContext();
    const [servers, setServers] = useState<ServerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');
    const [metrics, setMetrics] = useState<Record<string, ServerMetrics | null>>({});
    const [metricsLoading, setMetricsLoading] = useState<Record<string, boolean>>({});

    const fetchServers = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (searchQuery) params.set('q', searchQuery);
            if (filter === 'favorites') params.set('favorites', 'true');

            const response = await fetch(`/api/servers?${params}`);
            const data = await response.json();

            if (data.success) {
                setServers(data.data.servers);
            }
        } catch (error) {
            console.error('Failed to fetch servers:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchMetrics = useCallback(async (serverList: ServerItem[]) => {
        if (serverList.length === 0) return;

        // Mark all as loading
        const loadingState: Record<string, boolean> = {};
        serverList.forEach((s) => { loadingState[s.id] = true; });
        setMetricsLoading(loadingState);

        // Fetch in parallel, staggered slightly to avoid hammering
        await Promise.all(
            serverList.map(async (server, i) => {
                await new Promise((r) => setTimeout(r, i * 100));
                try {
                    const res = await fetch(`/api/servers/${server.id}/metrics`);
                    const data = await res.json();
                    if (data.success) {
                        setMetrics((prev) => ({ ...prev, [server.id]: data.data.metrics }));
                    }
                } catch {
                    setMetrics((prev) => ({ ...prev, [server.id]: null }));
                } finally {
                    setMetricsLoading((prev) => ({ ...prev, [server.id]: false }));
                }
            })
        );
    }, []);

    useEffect(() => {
        fetchServers();
    }, [searchQuery, filter]);

    // Fetch metrics whenever server list changes
    useEffect(() => {
        if (!loading && servers.length > 0) {
            fetchMetrics(servers);
        }
    }, [loading, servers, fetchMetrics]);

    // Auto-refresh metrics every 30 s
    useEffect(() => {
        if (servers.length === 0) return;
        const interval = setInterval(() => fetchMetrics(servers), 30_000);
        return () => clearInterval(interval);
    }, [servers, fetchMetrics]);

    const toggleFavorite = async (serverId: string) => {
        try {
            const server = servers.find((s) => s.id === serverId);
            if (!server) return;

            await fetch(`/api/servers/${serverId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isFavorite: !server.isFavorite }),
            });

            setServers(
                servers.map((s) =>
                    s.id === serverId ? { ...s, isFavorite: !s.isFavorite } : s
                )
            );
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
        }
    };

    const getConnectUrl = (server: ServerItem) => {
        const protocol = server.protocol.toLowerCase();
        return `/dashboard/connect/${server.id}/${protocol}`;
    };

    const openInSessions = async (server: ServerItem) => {
        const alreadyOpen = sessions.some(s => s.serverId === server.id);
        if (!alreadyOpen) await addSession(server.id, server.name);
        router.push('/dashboard/sessions');
    };

    return (
        <div className="max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Servers</h1>
                    <p className="text-dark-400 mt-1">
                        Manage and connect to your servers
                    </p>
                </div>
                <Link href="/dashboard/servers/new" className="btn btn-primary">
                    <Plus className="w-4 h-4" />
                    Add Server
                </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
                    <input
                        type="text"
                        placeholder="Search servers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="input pl-10"
                    />
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setFilter('all')}
                        className={`btn ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilter('favorites')}
                        className={`btn ${filter === 'favorites' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        <Star className="w-4 h-4" />
                        Favorites
                    </button>
                    <button
                        onClick={fetchServers}
                        className="btn btn-secondary btn-icon"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Server Grid */}
            {loading ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="card p-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-lg skeleton" />
                                <div className="flex-1 space-y-2">
                                    <div className="h-5 w-24 skeleton rounded" />
                                    <div className="h-4 w-32 skeleton rounded" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : servers.length === 0 ? (
                <div className="card p-12 text-center">
                    <Server className="w-12 h-12 mx-auto text-dark-500 mb-4" />
                    <h3 className="text-lg font-medium mb-2">No servers yet</h3>
                    <p className="text-dark-400 mb-6">
                        Add your first server to get started
                    </p>
                    <Link href="/dashboard/servers/new" className="btn btn-primary">
                        <Plus className="w-4 h-4" />
                        Add Server
                    </Link>
                </div>
            ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {servers.map((server) => {
                        const Icon = protocolIcons[server.protocol];
                        const m = metrics[server.id] ?? null;
                        const mLoading = metricsLoading[server.id] ?? false;

                        return (
                            <div key={server.id} className="card card-hover group flex flex-col">
                                <div className="p-4 flex-1">
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${protocolColors[server.protocol]}`}
                                        >
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium truncate">{server.name}</h3>
                                                <StatusDot metrics={m} loading={mLoading} />
                                                <button
                                                    onClick={() => toggleFavorite(server.id)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                                                >
                                                    {server.isFavorite ? (
                                                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                                                    ) : (
                                                        <StarOff className="w-4 h-4 text-dark-500 hover:text-yellow-400" />
                                                    )}
                                                </button>
                                            </div>
                                            <p className="text-sm text-dark-400 truncate">
                                                {server.description || server.protocol}
                                            </p>
                                        </div>
                                        <button className="p-1 text-dark-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                            <MoreVertical className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {/* Tags & Group */}
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <span className={`badge ${protocolColors[server.protocol]}`}>
                                            {server.protocol}
                                        </span>
                                        {server.group && (
                                            <span
                                                className="badge"
                                                style={{
                                                    backgroundColor: `${server.group.color}20`,
                                                    color: server.group.color || undefined,
                                                }}
                                            >
                                                {server.group.name}
                                            </span>
                                        )}
                                        {server.tags.slice(0, 2).map((tag) => (
                                            <span key={tag} className="badge bg-dark-700 text-dark-300">
                                                {tag}
                                            </span>
                                        ))}
                                        {m && m.reachable && m.latencyMs != null && (
                                            <span className="badge bg-dark-700 text-dark-300 ml-auto">
                                                {m.latencyMs}ms
                                            </span>
                                        )}
                                    </div>

                                    {/* Metrics — SSH only */}
                                    {server.protocol === 'SSH' && m && m.reachable && !m.error && (
                                        <div className="mt-3 space-y-1.5">
                                            {m.cpu != null && (
                                                <MetricBar
                                                    label="CPU"
                                                    percent={m.cpu}
                                                    value={`${m.cpu}%`}
                                                />
                                            )}
                                            {m.ram && (
                                                <MetricBar
                                                    label="RAM"
                                                    percent={m.ram.percent}
                                                    value={`${formatBytes(m.ram.usedBytes)}`}
                                                />
                                            )}
                                            {m.disk && (
                                                <MetricBar
                                                    label="Disk"
                                                    percent={m.disk.percent}
                                                    value={`${m.disk.percent}%`}
                                                />
                                            )}
                                        </div>
                                    )}

                                    {/* SSH metric error hint */}
                                    {server.protocol === 'SSH' && m && m.reachable && m.error && (
                                        <p className="mt-2 text-[10px] text-dark-500 truncate" title={m.error}>
                                            Metrics unavailable
                                        </p>
                                    )}

                                    {/* Non-SSH reachable but no metrics */}
                                    {server.protocol !== 'SSH' && m && m.reachable && (
                                        <p className="mt-2 text-[10px] text-dark-500">
                                            Metrics require SSH
                                        </p>
                                    )}
                                </div>

                                {/* Connect Button(s) */}
                                <div className="px-4 py-3 border-t border-dark-700 bg-dark-900/50 flex gap-2">
                                    <Link
                                        href={getConnectUrl(server)}
                                        className="btn btn-primary flex-1 justify-center text-sm"
                                    >
                                        Connect
                                    </Link>
                                    {server.protocol === 'SSH' && (
                                        <button
                                            onClick={() => openInSessions(server)}
                                            className="btn btn-secondary btn-icon shrink-0"
                                            title="Open in Sessions tab"
                                        >
                                            <Layers className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
