'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

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

export default function DashboardPage() {
    const [servers, setServers] = useState<ServerItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');

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

    useEffect(() => {
        fetchServers();
    }, [searchQuery, filter]);

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
                        return (
                            <div key={server.id} className="card card-hover group">
                                <div className="p-4">
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${protocolColors[server.protocol]}`}
                                        >
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-medium truncate">{server.name}</h3>
                                                <button
                                                    onClick={() => toggleFavorite(server.id)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity"
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
                                        <span
                                            className={`badge ${protocolColors[server.protocol]}`}
                                        >
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
                                            <span
                                                key={tag}
                                                className="badge bg-dark-700 text-dark-300"
                                            >
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {/* Connect Button */}
                                <div className="px-4 py-3 border-t border-dark-700 bg-dark-900/50">
                                    <Link
                                        href={getConnectUrl(server)}
                                        className="btn btn-primary w-full justify-center text-sm"
                                    >
                                        Connect
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
