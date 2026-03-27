'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Terminal, FolderOpen, Monitor, Pencil,
    Loader2, Activity, Wifi, WifiOff, Bell, BellOff,
    CheckCircle2, AlertTriangle, Clock, Cpu, MemoryStick,
    HardDrive, ToggleLeft, ToggleRight, Mail, BellRing,
    RefreshCw, Tv, Zap, Play, Server,
} from 'lucide-react';
import MetricSparkline from '@/components/monitoring/MetricSparkline';

// ============================================================================
// TYPES
// ============================================================================

interface ServerInfo {
    id: string;
    name: string;
    description?: string | null;
    host: string;
    port: number;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC';
    tags: string[];
    isFavorite: boolean;
    lastUsedAt: string | null;
    group: { id: string; name: string; color: string | null } | null;
}

interface MonitorConfig {
    enabled: boolean;
    checkIntervalMinutes: number;
    alertEmail: boolean;
    alertPush: boolean;
    failureThreshold: number;
    consecutiveFailures: number;
    alertSent: boolean;
    lastCheckedAt: string | null;
    lastStatus: boolean;
}

interface HealthRecord {
    reachable: boolean;
    latencyMs: number | null;
    cpuPercent: number | null;
    ramPercent: number | null;
    diskPercent: number | null;
    checkedAt: string;
}

interface BenchmarkHardwareInfo {
    cpuModel: string;
    cpuCores: number;
    cpuThreads: number;
    cpuFreqMhz: number | null;
    cpuBaseFreqMhz: number | null;
    arch: string;
    ramTotalBytes: number;
    diskTotalBytes: number;
    diskUsedBytes: number;
    os: string;
}

interface BenchmarkCpuResult {
    singleCoreMBps: number;
    multiCoreMBps: number;
    score: number;
}

interface BenchmarkNetworkResult {
    pingMs: number | null;
    loopbackMBps: number | null;
    score: number;
}

interface BenchmarkScores {
    cpu: number;
    ram: number;
    disk: number;
    network: number;
    overall: number;
}

interface BenchmarkResults {
    hardware?: BenchmarkHardwareInfo;
    cpu?: BenchmarkCpuResult | null;
    ram?: { writeMBps: number; readMBps: number; score: number } | null;
    disk?: { writeMBps: number; readMBps: number; score: number } | null;
    network?: BenchmarkNetworkResult | null;
    scores?: BenchmarkScores | null;
    durationMs?: number;
    error?: string;
}

type BenchmarkPhase =
    | 'connecting' | 'hardware'
    | 'cpu_single' | 'cpu_multi'
    | 'ram_write' | 'ram_read'
    | 'disk_write' | 'disk_read'
    | 'network'
    | 'done' | 'error';

// ============================================================================
// HELPERS
// ============================================================================

const protocolColors = {
    SSH: 'bg-green-500/15 text-green-400 border-green-500/30',
    SCP: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    RDP: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    VNC: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

const protocolIcons = {
    SSH: Terminal,
    SCP: FolderOpen,
    RDP: Monitor,
    VNC: Tv,
};

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

function formatBytes(bytes: number): string {
    if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
    if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${Math.round(bytes / 1e3)} KB`;
}

const BENCHMARK_PHASES: { key: BenchmarkPhase; label: string }[] = [
    { key: 'connecting',  label: 'Connect' },
    { key: 'hardware',    label: 'HW Info' },
    { key: 'cpu_single',  label: 'CPU 1C' },
    { key: 'cpu_multi',   label: 'CPU NC' },
    { key: 'ram_write',   label: 'RAM W' },
    { key: 'ram_read',    label: 'RAM R' },
    { key: 'disk_write',  label: 'Disk W' },
    { key: 'disk_read',   label: 'Disk R' },
    { key: 'network',     label: 'Network' },
];

function phaseIndex(phase: BenchmarkPhase | null): number {
    return BENCHMARK_PHASES.findIndex(p => p.key === phase);
}

function scoreColor(score: number): string {
    if (score >= 800) return 'text-emerald-400';
    if (score >= 600) return 'text-yellow-400';
    if (score >= 400) return 'text-amber-400';
    return 'text-red-400';
}

function scoreBg(score: number): string {
    if (score >= 800) return 'bg-emerald-500/10 border-emerald-500/20';
    if (score >= 600) return 'bg-yellow-500/10 border-yellow-500/20';
    if (score >= 400) return 'bg-amber-500/10 border-amber-500/20';
    return 'bg-red-500/10 border-red-500/20';
}

function ScoreBadge({ score }: { score: number }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-sm font-bold tabular-nums ${scoreColor(score)} ${scoreBg(score)}`}>
            {score}
        </span>
    );
}


function MetricCard({
    label,
    value,
    icon: Icon,
    color,
    data,
    unit = '%',
    alertAt,
}: {
    label: string;
    value: number | null | undefined;
    icon: React.ElementType;
    color: string;
    data: (number | null | undefined)[];
    unit?: string;
    alertAt?: number;
}) {
    const displayValue = value != null ? `${Math.round(value)}${unit}` : '—';
    const isAlert = alertAt != null && value != null && value >= alertAt;

    return (
        <div className="card p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <span className="text-xs font-medium text-slate-400">{label}</span>
                </div>
                <span className={`text-lg font-bold tabular-nums ${isAlert ? 'text-red-400' : 'text-white'}`}>
                    {displayValue}
                </span>
            </div>
            <MetricSparkline
                data={data}
                color={isAlert ? '#ef4444' : color.replace('text-', '#').replace('-400', '')}
                height={44}
                alertThreshold={alertAt}
            />
        </div>
    );
}

function StatPill({
    label,
    value,
    sub,
}: { label: string; value: string; sub?: string }) {
    return (
        <div className="flex flex-col gap-0.5 px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
            <span className="text-sm font-semibold text-white">{value}</span>
            {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
        </div>
    );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const INTERVALS = [
    { value: 1, label: 'Every 1 min' },
    { value: 5, label: 'Every 5 min' },
    { value: 10, label: 'Every 10 min' },
    { value: 15, label: 'Every 15 min' },
    { value: 30, label: 'Every 30 min' },
    { value: 60, label: 'Every hour' },
] as const;

export default function ServerDetailsPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();

    const [server, setServer] = useState<ServerInfo | null>(null);
    const [monitorConfig, setMonitorConfig] = useState<MonitorConfig | null>(null);
    const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Benchmark state
    const [benchRunning, setBenchRunning] = useState(false);
    const [benchPhase, setBenchPhase] = useState<BenchmarkPhase | null>(null);
    const [benchMessage, setBenchMessage] = useState('');
    const [benchResults, setBenchResults] = useState<BenchmarkResults | null>(null);

    // Local form state for monitor config
    const [form, setForm] = useState({
        enabled: false,
        checkIntervalMinutes: 5 as 1 | 5 | 10 | 15 | 30 | 60,
        alertEmail: true,
        alertPush: true,
        failureThreshold: 3,
    });

    // ── Load Data ──────────────────────────────────────────────────────────

    const loadAll = useCallback(async () => {
        try {
            const [serverRes, monitorRes, historyRes] = await Promise.all([
                fetch(`/api/servers/${id}`),
                fetch(`/api/servers/${id}/monitor`),
                fetch(`/api/servers/${id}/health-history?limit=50`),
            ]);

            const [serverData, monitorData, historyData] = await Promise.all([
                serverRes.json(),
                monitorRes.json(),
                historyRes.json(),
            ]);

            if (!serverData.success) { router.push('/dashboard'); return; }
            setServer(serverData.data.server);

            if (monitorData.success && monitorData.data.config) {
                const cfg = monitorData.data.config as MonitorConfig;
                setMonitorConfig(cfg);
                setForm({
                    enabled: cfg.enabled,
                    checkIntervalMinutes: cfg.checkIntervalMinutes as typeof form.checkIntervalMinutes,
                    alertEmail: cfg.alertEmail,
                    alertPush: cfg.alertPush,
                    failureThreshold: cfg.failureThreshold,
                });
            }

            if (historyData.success) {
                setHealthRecords(historyData.data.records);
            }
        } catch {
            router.push('/dashboard');
        } finally {
            setLoading(false);
        }
    }, [id, router]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const refreshHistory = async () => {
        setRefreshing(true);
        try {
            const res = await fetch(`/api/servers/${id}/health-history?limit=50`);
            const data = await res.json();
            if (data.success) setHealthRecords(data.data.records);
        } finally {
            setRefreshing(false);
        }
    };

    // ── Benchmark ──────────────────────────────────────────────────────────

    const handleRunBenchmark = async () => {
        setBenchRunning(true);
        setBenchResults(null);
        setBenchPhase('connecting');
        setBenchMessage('Connecting via SSH…');

        try {
            const response = await fetch(`/api/servers/${id}/benchmark`, { method: 'POST' });
            if (!response.ok || !response.body) {
                setBenchPhase('error');
                setBenchMessage('Failed to start benchmark');
                return;
            }

            const reader  = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value, { stream: true });
                for (const line of text.split('\n')) {
                    if (!line.startsWith('data: ')) continue;
                    try {
                        const event = JSON.parse(line.slice(6));
                        setBenchPhase(event.phase);
                        setBenchMessage(event.message ?? '');
                        if (event.results) {
                            setBenchResults(prev => ({ ...(prev ?? {}), ...event.results }));
                        }
                    } catch { /* ignore malformed SSE line */ }
                }
            }
        } catch {
            setBenchPhase('error');
            setBenchMessage('Connection lost');
        } finally {
            setBenchRunning(false);
        }
    };

    // ── Save Monitor Config ────────────────────────────────────────────────

    const handleSaveMonitor = async () => {
        setSaving(true);
        try {
            const res = await fetch(`/api/servers/${id}/monitor`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (data.success) {
                setMonitorConfig(data.data.config);
            }
        } finally {
            setSaving(false);
        }
    };

    // ── Derived Data ───────────────────────────────────────────────────────

    const latencies = healthRecords.map(r => r.reachable ? (r.latencyMs ?? null) : null);
    const cpus = healthRecords.map(r => r.cpuPercent);
    const rams = healthRecords.map(r => r.ramPercent);
    const disks = healthRecords.map(r => r.diskPercent);

    const lastRecord = healthRecords[healthRecords.length - 1];
    const upCount = healthRecords.filter(r => r.reachable).length;
    const uptimePct = healthRecords.length > 0
        ? Math.round((upCount / healthRecords.length) * 100)
        : null;

    const isSSH = server?.protocol === 'SSH';

    // ── Render ─────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
        );
    }

    if (!server) return null;

    const ProtoIcon = protocolIcons[server.protocol];
    const protoColor = protocolColors[server.protocol];
    const isOnline = lastRecord?.reachable ?? null;

    return (
        <div className="max-w-5xl mx-auto space-y-5">

            {/* ── Header ── */}
            <div className="flex items-center gap-3">
                <Link href="/dashboard" className="btn btn-ghost btn-icon btn-sm">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5">
                        <h1 className="text-xl font-semibold truncate">{server.name}</h1>
                        {isOnline !== null && (
                            isOnline
                                ? <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                    Online
                                  </span>
                                : <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                    Offline
                                  </span>
                        )}
                    </div>
                    {server.description && (
                        <p className="text-sm text-slate-400 mt-0.5 truncate">{server.description}</p>
                    )}
                </div>
                <Link href={`/dashboard/servers/${id}/edit`} className="btn btn-secondary btn-sm gap-1.5">
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                </Link>
            </div>

            {/* ── Server Info + Quick Stats ── */}
            <div className="card p-4">
                <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${protoColor}`}>
                        <ProtoIcon className="w-3.5 h-3.5" />
                        {server.protocol}
                    </div>
                    <span className="font-mono text-sm text-slate-300">{server.host}:{server.port}</span>
                    {server.group && (
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                            {server.group.name}
                        </span>
                    )}
                    {server.tags.map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{t}</span>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    <StatPill label="Last Used" value={formatRelativeTime(server.lastUsedAt)} />
                    {monitorConfig?.lastCheckedAt && (
                        <StatPill label="Last Check" value={formatRelativeTime(monitorConfig.lastCheckedAt)} />
                    )}
                    {uptimePct !== null && (
                        <StatPill
                            label="Uptime"
                            value={`${uptimePct}%`}
                            sub={`last ${healthRecords.length} checks`}
                        />
                    )}
                    {lastRecord?.latencyMs != null && (
                        <StatPill label="Latency" value={`${lastRecord.latencyMs}ms`} />
                    )}
                    {monitorConfig && (
                        <StatPill
                            label="Monitoring"
                            value={monitorConfig.enabled ? 'Active' : 'Inactive'}
                            sub={monitorConfig.enabled ? `every ${monitorConfig.checkIntervalMinutes}m` : undefined}
                        />
                    )}
                </div>

                {/* Connect buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-700/50">
                    <Link
                        href={`/dashboard/connect/${id}/${server.protocol.toLowerCase()}`}
                        className="btn btn-primary btn-sm gap-1.5"
                    >
                        <ProtoIcon className="w-3.5 h-3.5" />
                        Connect via {server.protocol}
                    </Link>
                </div>
            </div>

            {/* ── Monitoring Graphs ── */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-sky-400" />
                        Health History
                        <span className="text-[10px] text-slate-500 font-normal">({healthRecords.length} records)</span>
                    </h2>
                    <button
                        onClick={refreshHistory}
                        disabled={refreshing}
                        className="btn btn-ghost btn-icon btn-sm"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                {healthRecords.length === 0 ? (
                    <div className="card p-8 text-center">
                        <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-sm text-slate-500">No health data yet</p>
                        <p className="text-xs text-slate-600 mt-1">Enable monitoring below to start collecting data</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Latency */}
                        <div className="card p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Wifi className="w-4 h-4 text-sky-400" />
                                    <span className="text-xs font-medium text-slate-400">Latency</span>
                                </div>
                                <span className="text-lg font-bold tabular-nums text-white">
                                    {lastRecord?.latencyMs != null ? `${lastRecord.latencyMs}ms` : '—'}
                                </span>
                            </div>
                            <MetricSparkline data={latencies} color="#38bdf8" height={44} />
                            {/* Uptime bar */}
                            <div className="mt-3 pt-3 border-t border-slate-700/50">
                                <div className="flex gap-0.5 h-3 rounded overflow-hidden">
                                    {healthRecords.slice(-40).map((r, i) => (
                                        <div
                                            key={i}
                                            className={`flex-1 rounded-sm ${r.reachable ? 'bg-emerald-500' : 'bg-red-500'}`}
                                            title={`${new Date(r.checkedAt).toLocaleTimeString()} — ${r.reachable ? 'Up' : 'Down'}`}
                                        />
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1">
                                    Uptime: {upCount}/{healthRecords.length} checks
                                </p>
                            </div>
                        </div>

                        {/* CPU — only for SSH */}
                        {isSSH && (
                            <div className="card p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Cpu className="w-4 h-4 text-violet-400" />
                                        <span className="text-xs font-medium text-slate-400">CPU</span>
                                    </div>
                                    <span className={`text-lg font-bold tabular-nums ${(lastRecord?.cpuPercent ?? 0) >= 90 ? 'text-red-400' : 'text-white'}`}>
                                        {lastRecord?.cpuPercent != null ? `${Math.round(lastRecord.cpuPercent)}%` : '—'}
                                    </span>
                                </div>
                                <MetricSparkline data={cpus} color="#a78bfa" height={44} alertThreshold={90} />
                            </div>
                        )}

                        {/* RAM — only for SSH */}
                        {isSSH && (
                            <div className="card p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <MemoryStick className="w-4 h-4 text-amber-400" />
                                        <span className="text-xs font-medium text-slate-400">RAM</span>
                                    </div>
                                    <span className={`text-lg font-bold tabular-nums ${(lastRecord?.ramPercent ?? 0) >= 90 ? 'text-red-400' : 'text-white'}`}>
                                        {lastRecord?.ramPercent != null ? `${Math.round(lastRecord.ramPercent)}%` : '—'}
                                    </span>
                                </div>
                                <MetricSparkline data={rams} color="#fbbf24" height={44} alertThreshold={90} />
                            </div>
                        )}

                        {/* Disk — only for SSH */}
                        {isSSH && (
                            <div className="card p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <HardDrive className="w-4 h-4 text-rose-400" />
                                        <span className="text-xs font-medium text-slate-400">Disk</span>
                                    </div>
                                    <span className={`text-lg font-bold tabular-nums ${(lastRecord?.diskPercent ?? 0) >= 90 ? 'text-red-400' : 'text-white'}`}>
                                        {lastRecord?.diskPercent != null ? `${Math.round(lastRecord.diskPercent)}%` : '—'}
                                    </span>
                                </div>
                                <MetricSparkline data={disks} color="#fb7185" height={44} alertThreshold={90} />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ── Monitor Configuration ── */}
            <div>
                <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2 mb-3">
                    <Bell className="w-4 h-4 text-amber-400" />
                    Monitoring & Alerts
                </h2>

                <div className="card divide-y divide-slate-700/50">

                    {/* Enable toggle */}
                    <div className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-medium">Enable Monitoring</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Periodically check if this server is reachable
                            </p>
                        </div>
                        <button
                            onClick={() => setForm(f => ({ ...f, enabled: !f.enabled }))}
                            className="shrink-0"
                        >
                            {form.enabled
                                ? <ToggleRight className="w-9 h-9 text-sky-400" />
                                : <ToggleLeft className="w-9 h-9 text-slate-600" />
                            }
                        </button>
                    </div>

                    {/* Check interval */}
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="text-sm font-medium flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                    Check Interval
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">How often to ping the server</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {INTERVALS.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setForm(f => ({ ...f, checkIntervalMinutes: opt.value }))}
                                    disabled={!form.enabled}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                                        form.checkIntervalMinutes === opt.value && form.enabled
                                            ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                                            : !form.enabled
                                            ? 'border-slate-700 text-slate-700 cursor-not-allowed'
                                            : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Failure threshold */}
                    <div className="p-4">
                        <div className="mb-2">
                            <p className="text-sm font-medium flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                Failure Threshold
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                Alert after this many consecutive failed checks
                            </p>
                        </div>
                        <div className="flex items-center gap-3 mt-2">
                            <input
                                type="range"
                                min={1}
                                max={10}
                                value={form.failureThreshold}
                                disabled={!form.enabled}
                                onChange={e => setForm(f => ({ ...f, failureThreshold: parseInt(e.target.value) }))}
                                className="flex-1 accent-sky-500 disabled:opacity-40"
                            />
                            <span className="text-sm font-bold text-white w-8 text-center tabular-nums">
                                {form.failureThreshold}×
                            </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">
                            Alert fires after {form.failureThreshold} consecutive failure{form.failureThreshold !== 1 ? 's' : ''}
                            {form.enabled && form.checkIntervalMinutes
                                ? ` (~${form.failureThreshold * form.checkIntervalMinutes} min downtime)`
                                : ''}
                        </p>
                    </div>

                    {/* Alert channels */}
                    <div className="p-4 space-y-3">
                        <p className="text-sm font-medium text-slate-300">Alert Channels</p>

                        <label className={`flex items-center justify-between cursor-pointer rounded-lg px-3 py-2.5 border transition-colors ${
                            form.alertEmail && form.enabled
                                ? 'bg-sky-500/8 border-sky-500/30'
                                : 'border-slate-700/60 bg-transparent'
                        } ${!form.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <div className="flex items-center gap-2.5">
                                <Mail className="w-4 h-4 text-slate-400" />
                                <div>
                                    <p className="text-sm font-medium">Email</p>
                                    <p className="text-xs text-slate-500">Send alert to your account email</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={form.alertEmail}
                                disabled={!form.enabled}
                                onChange={e => setForm(f => ({ ...f, alertEmail: e.target.checked }))}
                                className="w-4 h-4 accent-sky-500"
                            />
                        </label>

                        <label className={`flex items-center justify-between cursor-pointer rounded-lg px-3 py-2.5 border transition-colors ${
                            form.alertPush && form.enabled
                                ? 'bg-sky-500/8 border-sky-500/30'
                                : 'border-slate-700/60 bg-transparent'
                        } ${!form.enabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <div className="flex items-center gap-2.5">
                                <BellRing className="w-4 h-4 text-slate-400" />
                                <div>
                                    <p className="text-sm font-medium">Push Notification</p>
                                    <p className="text-xs text-slate-500">Browser / mobile push alert</p>
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                checked={form.alertPush}
                                disabled={!form.enabled}
                                onChange={e => setForm(f => ({ ...f, alertPush: e.target.checked }))}
                                className="w-4 h-4 accent-sky-500"
                            />
                        </label>
                    </div>

                    {/* Current state indicator */}
                    {monitorConfig?.enabled && (
                        <div className="px-4 py-3 bg-slate-800/40">
                            <div className="flex items-center gap-3 text-xs">
                                {monitorConfig.alertSent ? (
                                    <>
                                        <WifiOff className="w-4 h-4 text-red-400 shrink-0" />
                                        <div>
                                            <span className="text-red-400 font-medium">Server is currently DOWN</span>
                                            <span className="text-slate-500 ml-1.5">— alert was sent</span>
                                        </div>
                                    </>
                                ) : monitorConfig.consecutiveFailures > 0 ? (
                                    <>
                                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                                        <span className="text-amber-400">
                                            {monitorConfig.consecutiveFailures} failure{monitorConfig.consecutiveFailures !== 1 ? 's' : ''} —
                                            {monitorConfig.failureThreshold - monitorConfig.consecutiveFailures} more before alert
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                        <span className="text-emerald-400">Server is healthy</span>
                                    </>
                                )}
                                {monitorConfig.lastCheckedAt && (
                                    <span className="ml-auto text-slate-600">
                                        Last checked {formatRelativeTime(monitorConfig.lastCheckedAt)}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Save button */}
                    <div className="p-4">
                        <button
                            onClick={handleSaveMonitor}
                            disabled={saving}
                            className="btn btn-primary w-full"
                        >
                            {saving
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                                : <><Bell className="w-4 h-4" /> Save Monitoring Settings</>
                            }
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Hardware Benchmark ── */}
            {isSSH && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-400" />
                            Hardware Benchmark
                        </h2>
                        <button
                            onClick={handleRunBenchmark}
                            disabled={benchRunning}
                            className="btn btn-secondary btn-sm gap-1.5"
                        >
                            {benchRunning
                                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
                                : <><Play className="w-3.5 h-3.5" /> Run Benchmark</>
                            }
                        </button>
                    </div>

                    {/* Progress bar */}
                    {benchRunning && (
                        <div className="card p-4 mb-3">
                            <div className="flex items-center gap-3 mb-3">
                                <Loader2 className="w-4 h-4 animate-spin text-yellow-400 shrink-0" />
                                <p className="text-sm text-white">{benchMessage}</p>
                            </div>
                            <div className="flex gap-1">
                                {BENCHMARK_PHASES.map((p, i) => {
                                    const current = phaseIndex(benchPhase);
                                    const done    = i < current;
                                    const active  = i === current;
                                    return (
                                        <div key={p.key} className="flex-1 flex flex-col items-center gap-1">
                                            <div className={`h-1 w-full rounded-full transition-colors ${
                                                done   ? 'bg-yellow-400' :
                                                active ? 'bg-yellow-400/60 animate-pulse' :
                                                         'bg-slate-700'
                                            }`} />
                                            <span className={`text-[9px] hidden sm:block ${active ? 'text-yellow-400' : done ? 'text-slate-400' : 'text-slate-600'}`}>
                                                {p.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Error state */}
                    {!benchRunning && benchPhase === 'error' && (
                        <div className="card p-4 flex items-center gap-3 mb-3 border border-red-500/20 bg-red-500/5">
                            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                            <p className="text-sm text-red-300">{benchMessage}</p>
                        </div>
                    )}

                    {/* Results */}
                    {benchResults && (
                        <div className="space-y-3">

                            {/* Overall score */}
                            {benchResults.scores && (
                                <div className="card p-4">
                                    <div className="flex items-center gap-2 mb-4">
                                        <Zap className="w-4 h-4 text-yellow-400" />
                                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Benchmark Score</span>
                                        <span className="text-[10px] text-slate-500 ml-auto">scored vs. high-end server reference</span>
                                    </div>
                                    {/* Overall big score */}
                                    <div className="flex items-center justify-center mb-4">
                                        <div className={`flex flex-col items-center px-8 py-4 rounded-2xl border-2 ${scoreBg(benchResults.scores.overall)}`}>
                                            <span className={`text-5xl font-black tabular-nums ${scoreColor(benchResults.scores.overall)}`}>
                                                {benchResults.scores.overall}
                                            </span>
                                            <span className="text-xs text-slate-500 mt-1 uppercase tracking-wider">Overall</span>
                                        </div>
                                    </div>
                                    {/* Per-category scores */}
                                    <div className="grid grid-cols-4 gap-2">
                                        {([
                                            { label: 'CPU',     score: benchResults.scores.cpu },
                                            { label: 'RAM',     score: benchResults.scores.ram },
                                            { label: 'Disk',    score: benchResults.scores.disk },
                                            { label: 'Network', score: benchResults.scores.network },
                                        ] as const).map(({ label, score }) => (
                                            <div key={label} className="flex flex-col items-center gap-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50 py-3">
                                                <span className={`text-xl font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
                                                <span className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</span>
                                                {/* Mini bar */}
                                                <div className="w-full px-3">
                                                    <div className="h-1 rounded-full bg-slate-700">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${score >= 800 ? 'bg-emerald-400' : score >= 600 ? 'bg-yellow-400' : score >= 400 ? 'bg-amber-400' : 'bg-red-400'}`}
                                                            style={{ width: `${score / 10}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Hardware info */}
                            {benchResults.hardware && (
                                <div className="card p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Server className="w-4 h-4 text-slate-400" />
                                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Hardware</span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2 flex-1 min-w-[200px]">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">CPU</p>
                                            <p className="text-sm font-semibold text-white truncate">{benchResults.hardware.cpuModel}</p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">
                                                {benchResults.hardware.cpuCores}C / {benchResults.hardware.cpuThreads}T
                                                {' · '}{benchResults.hardware.arch}
                                            </p>
                                            {(benchResults.hardware.cpuFreqMhz || benchResults.hardware.cpuBaseFreqMhz) && (
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    {benchResults.hardware.cpuBaseFreqMhz
                                                        ? `${(benchResults.hardware.cpuBaseFreqMhz / 1000).toFixed(2)} GHz base`
                                                        : ''}
                                                    {benchResults.hardware.cpuBaseFreqMhz && benchResults.hardware.cpuFreqMhz ? ' · ' : ''}
                                                    {benchResults.hardware.cpuFreqMhz
                                                        ? `${(benchResults.hardware.cpuFreqMhz / 1000).toFixed(2)} GHz boost`
                                                        : ''}
                                                </p>
                                            )}
                                        </div>
                                        <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2 min-w-[100px]">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">RAM</p>
                                            <p className="text-sm font-semibold text-white">{formatBytes(benchResults.hardware.ramTotalBytes)}</p>
                                        </div>
                                        <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2 min-w-[130px]">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Disk</p>
                                            <p className="text-sm font-semibold text-white">{formatBytes(benchResults.hardware.diskTotalBytes)}</p>
                                            <p className="text-[11px] text-slate-500 mt-0.5">{formatBytes(benchResults.hardware.diskUsedBytes)} used</p>
                                        </div>
                                        <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2 flex-1 min-w-[120px]">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">OS</p>
                                            <p className="text-sm font-semibold text-white truncate">{benchResults.hardware.os}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* CPU performance */}
                            {benchResults.cpu && (
                                <div className="card p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Cpu className="w-4 h-4 text-violet-400" />
                                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">CPU Performance</span>
                                        <span className="text-[10px] text-slate-500 ml-1">SHA-256</span>
                                        <div className="ml-auto">
                                            <ScoreBadge score={benchResults.cpu.score} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Single-Core</p>
                                            <p className="text-lg font-bold tabular-nums text-white">
                                                {benchResults.cpu.singleCoreMBps.toLocaleString()}
                                                <span className="text-xs font-normal text-slate-400 ml-1">MB/s</span>
                                            </p>
                                            <p className="text-[10px] text-slate-600 mt-0.5">1 thread</p>
                                        </div>
                                        <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Multi-Core</p>
                                            <p className="text-lg font-bold tabular-nums text-white">
                                                {benchResults.cpu.multiCoreMBps.toLocaleString()}
                                                <span className="text-xs font-normal text-slate-400 ml-1">MB/s</span>
                                            </p>
                                            {benchResults.hardware && (
                                                <p className="text-[10px] text-slate-600 mt-0.5">
                                                    {benchResults.hardware.cpuThreads} threads
                                                    {benchResults.cpu.singleCoreMBps > 0
                                                        ? ` · ${(benchResults.cpu.multiCoreMBps / benchResults.cpu.singleCoreMBps).toFixed(1)}× scaling`
                                                        : ''}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* RAM & Disk */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {benchResults.ram && (
                                    <div className="card p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <MemoryStick className="w-4 h-4 text-amber-400" />
                                            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">RAM Bandwidth</span>
                                            <div className="ml-auto">
                                                <ScoreBadge score={benchResults.ram.score} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Write</p>
                                                <p className="text-base font-bold tabular-nums text-white">
                                                    {benchResults.ram.writeMBps > 0 ? benchResults.ram.writeMBps.toLocaleString() : '—'}
                                                    {benchResults.ram.writeMBps > 0 && <span className="text-xs font-normal text-slate-400 ml-1">MB/s</span>}
                                                </p>
                                            </div>
                                            <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Read</p>
                                                <p className="text-base font-bold tabular-nums text-white">
                                                    {benchResults.ram.readMBps > 0 ? benchResults.ram.readMBps.toLocaleString() : '—'}
                                                    {benchResults.ram.readMBps > 0 && <span className="text-xs font-normal text-slate-400 ml-1">MB/s</span>}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {benchResults.disk && (
                                    <div className="card p-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <HardDrive className="w-4 h-4 text-rose-400" />
                                            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Disk Speed</span>
                                            <div className="ml-auto">
                                                <ScoreBadge score={benchResults.disk.score} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Write</p>
                                                <p className="text-base font-bold tabular-nums text-white">
                                                    {benchResults.disk.writeMBps > 0 ? benchResults.disk.writeMBps.toLocaleString() : '—'}
                                                    {benchResults.disk.writeMBps > 0 && <span className="text-xs font-normal text-slate-400 ml-1">MB/s</span>}
                                                </p>
                                            </div>
                                            <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                                                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Read</p>
                                                <p className="text-base font-bold tabular-nums text-white">
                                                    {benchResults.disk.readMBps > 0 ? benchResults.disk.readMBps.toLocaleString() : '—'}
                                                    {benchResults.disk.readMBps > 0 && <span className="text-xs font-normal text-slate-400 ml-1">MB/s</span>}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Network */}
                            {benchResults.network && (
                                <div className="card p-4">
                                    <div className="flex items-center gap-2 mb-3">
                                        <Wifi className="w-4 h-4 text-sky-400" />
                                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Network</span>
                                        <div className="ml-auto">
                                            <ScoreBadge score={benchResults.network.score} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Latency (ping 1.1.1.1)</p>
                                            <p className="text-base font-bold tabular-nums text-white">
                                                {benchResults.network.pingMs != null
                                                    ? <>{benchResults.network.pingMs.toFixed(1)}<span className="text-xs font-normal text-slate-400 ml-1">ms</span></>
                                                    : <span className="text-slate-500">Unreachable</span>
                                                }
                                            </p>
                                        </div>
                                        <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 px-3 py-2">
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Loopback Bandwidth</p>
                                            <p className="text-base font-bold tabular-nums text-white">
                                                {benchResults.network.loopbackMBps != null
                                                    ? <>{benchResults.network.loopbackMBps.toLocaleString()}<span className="text-xs font-normal text-slate-400 ml-1">MB/s</span></>
                                                    : <span className="text-slate-500">N/A</span>
                                                }
                                            </p>
                                            <p className="text-[10px] text-slate-600 mt-0.5">OS kernel socket speed</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Footer */}
                            {benchResults.durationMs && (
                                <p className="text-[11px] text-slate-600 text-right">
                                    Completed in {(benchResults.durationMs / 1000).toFixed(1)}s · 256 MB test blocks · no software installed
                                </p>
                            )}
                        </div>
                    )}

                    {/* Empty state */}
                    {!benchRunning && !benchResults && benchPhase !== 'error' && (
                        <div className="card p-8 text-center">
                            <Zap className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                            <p className="text-sm text-slate-500">No benchmark data</p>
                            <p className="text-xs text-slate-600 mt-1">
                                Measures CPU single/multi-core, RAM, disk, and network — agentlessly via SSH
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
