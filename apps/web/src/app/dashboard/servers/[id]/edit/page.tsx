'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft, Terminal, FolderOpen, Monitor, Loader2,
    Eye, EyeOff, Plus, X, CheckCircle2, AlertCircle,
    ChevronDown, ChevronUp, Lock, Key, Tag, Globe, Activity, Tv,
} from 'lucide-react';

interface Group { id: string; name: string; color: string | null; }

const protocols = [
    { value: 'SSH', label: 'SSH', icon: Terminal, desc: 'Secure Shell' },
    { value: 'SCP', label: 'SCP', icon: FolderOpen, desc: 'File Transfer' },
    { value: 'RDP', label: 'RDP', icon: Monitor, desc: 'Remote Desktop' },
    { value: 'VNC', label: 'VNC', icon: Tv, desc: 'Virtual Console' },
] as const;

const defaultPorts = { SSH: 22, SCP: 22, RDP: 3389, VNC: 5900 };

const protoColors = {
    SSH: { pill: 'bg-green-500/15 text-green-400 border-green-500/30', ring: 'ring-green-500/40 border-green-500/60', badge: 'bg-green-500/15 text-green-400' },
    SCP: { pill: 'bg-blue-500/15 text-blue-400 border-blue-500/30', ring: 'ring-blue-500/40 border-blue-500/60', badge: 'bg-blue-500/15 text-blue-400' },
    RDP: { pill: 'bg-purple-500/15 text-purple-400 border-purple-500/30', ring: 'ring-purple-500/40 border-purple-500/60', badge: 'bg-purple-500/15 text-purple-400' },
    VNC: { pill: 'bg-orange-500/15 text-orange-400 border-orange-500/30', ring: 'ring-orange-500/40 border-orange-500/60', badge: 'bg-orange-500/15 text-orange-400' },
};

type TestStatus = 'idle' | 'testing' | 'success' | 'failed';

export default function EditServerPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();

    const [groups, setGroups] = useState<Group[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [testResult, setTestResult] = useState<{ latency?: number; error?: string } | null>(null);
    const [tagInput, setTagInput] = useState('');

    // Indicators for stored credentials (we never expose the actual values)
    const [storedCreds, setStoredCreds] = useState({
        hasPassword: false, hasPrivateKey: false, hasPassphrase: false,
    });

    const [form, setForm] = useState({
        name: '', description: '', groupId: '',
        protocol: 'SSH' as keyof typeof defaultPorts,
        host: '', port: 22, username: '',
        authMethod: 'password' as 'password' | 'key',
        // Empty = keep existing; non-empty = replace
        password: '', privateKey: '', passphrase: '',
        notes: '', tags: [] as string[],
    });

    // ── Load server + groups ────────────────────────────────────────────────

    useEffect(() => {
        Promise.all([
            fetch(`/api/servers/${id}`).then(r => r.json()),
            fetch('/api/groups').then(r => r.json()),
        ]).then(([serverData, groupData]) => {
            if (!serverData.success) { router.push('/dashboard'); return; }
            const s = serverData.data.server;
            setStoredCreds({
                hasPassword:   s.hasPassword   ?? false,
                hasPrivateKey: s.hasPrivateKey  ?? false,
                hasPassphrase: s.hasPassphrase  ?? false,
            });
            setForm({
                name:        s.name        ?? '',
                description: s.description ?? '',
                groupId:     s.group?.id   ?? '',
                protocol:    s.protocol    as keyof typeof defaultPorts,
                host:        s.host        ?? '',
                port:        s.port        ?? 22,
                username:    s.username    ?? '',
                authMethod:  s.hasPrivateKey ? 'key' : 'password',
                password: '', privateKey: '', passphrase: '',
                notes:       s.notes       ?? '',
                tags:        s.tags        ?? [],
            });
            if (groupData.success) setGroups(groupData.data.groups);
        }).catch(() => router.push('/dashboard'))
          .finally(() => setPageLoading(false));
    }, [id, router]);

    const update = (fields: Partial<typeof form>) => setForm(f => ({ ...f, ...fields }));

    const handleProtocolChange = (p: keyof typeof defaultPorts) => {
        update({ protocol: p, port: defaultPorts[p] });
        setTestStatus('idle'); setTestResult(null);
    };

    const addTag = () => {
        const tag = tagInput.trim();
        if (tag && !form.tags.includes(tag)) { update({ tags: [...form.tags, tag] }); setTagInput(''); }
    };

    // ── Test authentication ─────────────────────────────────────────────────

    const isSSHProto = form.protocol === 'SSH' || form.protocol === 'SCP';

    // For testing, we need credentials. If the user hasn't entered new ones,
    // we can only test if we know credentials are stored (but we don't have them
    // here — they'd need to re-enter or we skip). We allow testing only when
    // new credentials are provided.
    const testHasAuth = form.authMethod === 'password'
        ? !!form.password.trim()
        : !!form.privateKey.trim();

    const canTest = !!(form.host.trim() && form.port > 0 && form.username.trim() && (!isSSHProto || testHasAuth));

    const handleTest = async () => {
        if (!canTest) return;
        setTestStatus('testing'); setTestResult(null);
        try {
            const res = await fetch('/api/servers/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: form.host, port: form.port,
                    protocol: form.protocol, username: form.username,
                    password:   form.authMethod === 'password' ? form.password    : undefined,
                    privateKey: form.authMethod === 'key'      ? form.privateKey  : undefined,
                    passphrase: form.authMethod === 'key'      ? form.passphrase  : undefined,
                }),
            });
            const data = await res.json();
            if (data.success) { setTestStatus('success'); setTestResult({ latency: data.latency }); }
            else               { setTestStatus('failed');  setTestResult({ error: data.error }); }
        } catch {
            setTestStatus('failed'); setTestResult({ error: 'Network error' });
        }
    };

    // ── Save ────────────────────────────────────────────────────────────────

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setSaving(true);
        try {
            // Only send credential fields if the user actually filled them in.
            // Empty string = keep whatever is stored server-side.
            const payload: Record<string, unknown> = {
                name:        form.name,
                description: form.description || undefined,
                groupId:     form.groupId     || undefined,
                protocol:    form.protocol,
                host:        form.host,
                port:        form.port,
                username:    form.username,
                notes:       form.notes       || undefined,
                tags:        form.tags.length > 0 ? form.tags : [],
            };
            if (form.authMethod === 'password' && form.password.trim()) {
                payload.password = form.password;
            }
            if (form.authMethod === 'key') {
                if (form.privateKey.trim())  payload.privateKey  = form.privateKey;
                if (form.passphrase.trim())  payload.passphrase  = form.passphrase;
            }

            const res = await fetch(`/api/servers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!data.success) { setError(data.error || 'Failed to update server'); setSaving(false); return; }
            router.push('/dashboard');
        } catch {
            setError('An error occurred. Please try again.'); setSaving(false);
        }
    };

    // ── Render ──────────────────────────────────────────────────────────────

    if (pageLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
        );
    }

    const proto = protocols.find(p => p.value === form.protocol)!;
    const ProtoIcon = proto.icon;
    const colors = protoColors[form.protocol];
    const selectedGroup = groups.find(g => g.id === form.groupId);

    return (
        <div className="max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
                <Link href="/dashboard" className="btn btn-ghost btn-icon btn-sm">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                    <h1 className="text-xl font-semibold">Edit Server</h1>
                    <p className="text-slate-400 text-sm">{form.name}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} method="POST" action="#">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                    {/* ── LEFT: Form ── */}
                    <div className="lg:col-span-3 space-y-3">

                        {/* Protocol */}
                        <div className="card p-4">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Protocol</p>
                            <div className="grid grid-cols-4 gap-2">
                                {protocols.map(p => {
                                    const isActive = form.protocol === p.value;
                                    const c = protoColors[p.value];
                                    const Icon = p.icon;
                                    return (
                                        <button key={p.value} type="button"
                                            onClick={() => handleProtocolChange(p.value)}
                                            className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-150 ${
                                                isActive
                                                    ? `${c.pill} ${c.ring} ring-1`
                                                    : 'border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300 hover:bg-slate-700/30'
                                            }`}
                                        >
                                            <Icon className="w-4 h-4" />
                                            <span className="text-xs font-semibold">{p.label}</span>
                                            <span className="text-[10px] opacity-60 hidden sm:block leading-none">{p.desc}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Identity + Connection */}
                        <div className="card divide-y divide-slate-700/50">
                            <div className="p-4 grid grid-cols-2 gap-3">
                                <div>
                                    <label className="label text-xs">Name <span className="text-red-400">*</span></label>
                                    <input type="text" value={form.name} onChange={e => update({ name: e.target.value })}
                                        className="input text-sm py-2" placeholder="Production Web" required />
                                </div>
                                <div>
                                    <label className="label text-xs">Group <span className="text-slate-600">(optional)</span></label>
                                    <select value={form.groupId} onChange={e => update({ groupId: e.target.value })} className="input text-sm py-2">
                                        <option value="">No group</option>
                                        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2">
                                        <label className="label text-xs">Host / IP <span className="text-red-400">*</span></label>
                                        <input type="text" value={form.host}
                                            onChange={e => { update({ host: e.target.value }); setTestStatus('idle'); setTestResult(null); }}
                                            className="input text-sm py-2 font-mono" placeholder="192.168.1.100" required />
                                    </div>
                                    <div>
                                        <label className="label text-xs">Port</label>
                                        <input type="number" value={form.port}
                                            onChange={e => { update({ port: parseInt(e.target.value) || 0 }); setTestStatus('idle'); setTestResult(null); }}
                                            className="input text-sm py-2 font-mono" min={1} max={65535} required />
                                    </div>
                                </div>
                                <div>
                                    <label className="label text-xs">Username <span className="text-red-400">*</span></label>
                                    <input type="text" value={form.username} onChange={e => update({ username: e.target.value })}
                                        className="input text-sm py-2" placeholder="root" required />
                                </div>
                            </div>
                        </div>

                        {/* Authentication */}
                        <div className="card p-4 space-y-3">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Authentication</p>

                            {(form.protocol === 'SSH' || form.protocol === 'SCP') && (
                                <div className="flex gap-1 p-1 bg-slate-900/60 rounded-lg w-fit border border-slate-700/50">
                                    {(['password', 'key'] as const).map(method => (
                                        <button key={method} type="button" onClick={() => update({ authMethod: method })}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                                form.authMethod === method ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                                            }`}
                                        >
                                            {method === 'password' ? <Lock className="w-3 h-3" /> : <Key className="w-3 h-3" />}
                                            {method === 'password' ? 'Password' : 'SSH Key'}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Stored credential indicator */}
                            {form.authMethod === 'password' && storedCreds.hasPassword && (
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700/50">
                                    <Lock className="w-3 h-3 text-green-500/70" />
                                    Password saved — leave blank to keep it, or enter a new one to replace it
                                </div>
                            )}
                            {form.authMethod === 'key' && storedCreds.hasPrivateKey && (
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700/50">
                                    <Key className="w-3 h-3 text-green-500/70" />
                                    Private key saved — leave blank to keep it, or paste a new key to replace it
                                </div>
                            )}

                            {form.authMethod === 'password' && (
                                <div className="relative">
                                    <label className="label text-xs">
                                        New Password <span className="text-slate-600">(leave blank to keep existing)</span>
                                    </label>
                                    <input type={showPassword ? 'text' : 'password'} value={form.password}
                                        onChange={e => update({ password: e.target.value })}
                                        className="input text-sm py-2 pr-10" placeholder="••••••••" autoComplete="new-password" />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 bottom-2.5 text-slate-500 hover:text-white transition-colors">
                                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            )}

                            {form.authMethod === 'key' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="label text-xs">
                                            New Private Key <span className="text-slate-600">(leave blank to keep existing)</span>
                                        </label>
                                        <textarea value={form.privateKey} onChange={e => update({ privateKey: e.target.value })}
                                            className="input text-xs py-2 font-mono min-h-[110px] resize-none leading-relaxed"
                                            placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"} />
                                    </div>
                                    <div className="relative">
                                        <label className="label text-xs">
                                            Passphrase{' '}
                                            <span className="text-slate-600">
                                                {storedCreds.hasPassphrase ? '(leave blank to keep existing)' : '(if encrypted)'}
                                            </span>
                                        </label>
                                        <input type={showPassphrase ? 'text' : 'password'} value={form.passphrase}
                                            onChange={e => update({ passphrase: e.target.value })}
                                            className="input text-sm py-2 pr-10" placeholder="••••••••" autoComplete="new-password" />
                                        <button type="button" onClick={() => setShowPassphrase(!showPassphrase)}
                                            className="absolute right-3 bottom-2.5 text-slate-500 hover:text-white transition-colors">
                                            {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Advanced */}
                        <div className="card overflow-visible">
                            <button type="button" onClick={() => setShowAdvanced(!showAdvanced)}
                                className="w-full flex items-center justify-between p-4 hover:bg-slate-700/20 transition-colors">
                                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Advanced</span>
                                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                            </button>
                            {showAdvanced && (
                                <div className="px-4 pb-4 border-t border-slate-700/50 space-y-3 pt-3">
                                    <div>
                                        <label className="label text-xs">Description</label>
                                        <input type="text" value={form.description} onChange={e => update({ description: e.target.value })}
                                            className="input text-sm py-2" placeholder="Production web server" />
                                    </div>
                                    <div>
                                        <label className="label text-xs">Tags</label>
                                        <div className="flex gap-2 mb-2">
                                            <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                                                className="input text-sm py-2 flex-1" placeholder="production, linux, aws…" />
                                            <button type="button" onClick={addTag} className="btn btn-secondary btn-sm px-3">
                                                <Plus className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                        {form.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {form.tags.map(tag => (
                                                    <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-700 text-slate-300 text-xs">
                                                        {tag}
                                                        <button type="button" onClick={() => update({ tags: form.tags.filter(t => t !== tag) })}
                                                            className="text-slate-500 hover:text-red-400 transition-colors">
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="label text-xs">Notes</label>
                                        <textarea value={form.notes} onChange={e => update({ notes: e.target.value })}
                                            className="input text-sm py-2 min-h-[72px] resize-none" placeholder="Additional notes…" />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ── RIGHT: Preview + Test + Actions ── */}
                    <div className="lg:col-span-2 space-y-3 lg:sticky lg:top-4 self-start">

                        {/* Preview */}
                        <div className="card p-4">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Preview</p>
                            <div className="bg-slate-900/60 rounded-lg p-3.5 border border-slate-700/60">
                                <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-lg border shrink-0 ${colors.pill}`}>
                                        <ProtoIcon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-sm truncate">
                                            {form.name || <span className="text-slate-500 italic">Untitled</span>}
                                        </p>
                                        {form.description && <p className="text-[11px] text-slate-400 truncate mt-0.5">{form.description}</p>}
                                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.badge}`}>
                                                {form.protocol}
                                            </span>
                                            {selectedGroup && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-700 text-slate-300">
                                                    {selectedGroup.name}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {(form.host || form.username) && (
                                    <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-1.5">
                                        {form.host && (
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                <Globe className="w-3 h-3 shrink-0 text-slate-500" />
                                                <span className="font-mono truncate text-slate-300">{form.host}:{form.port}</span>
                                            </div>
                                        )}
                                        {form.username && (
                                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                                {form.authMethod === 'key' ? <Key className="w-3 h-3 shrink-0 text-slate-500" /> : <Lock className="w-3 h-3 shrink-0 text-slate-500" />}
                                                <span className="font-mono truncate text-slate-300">{form.username}</span>
                                                <span className="text-slate-600 text-[10px]">({form.authMethod === 'key' ? 'key' : 'password'})</span>
                                            </div>
                                        )}
                                        {form.tags.length > 0 && (
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Tag className="w-3 h-3 text-slate-600 shrink-0" />
                                                {form.tags.map(t => (
                                                    <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-400">{t}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Test */}
                        <div className="card p-4">
                            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">
                                {isSSHProto ? 'Authentication Test' : 'Connectivity'}
                            </p>
                            <button type="button" onClick={handleTest}
                                disabled={!canTest || testStatus === 'testing'}
                                className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-sm font-medium transition-all duration-200 ${
                                    !canTest ? 'border-slate-700 text-slate-600 cursor-not-allowed bg-transparent'
                                        : testStatus === 'success' ? 'border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/15'
                                        : testStatus === 'failed'  ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/15'
                                        : 'border-sky-500/30 bg-sky-500/8 text-sky-400 hover:bg-sky-500/15'
                                }`}
                            >
                                {testStatus === 'testing' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…</>
                                    : testStatus === 'success' ? <><CheckCircle2 className="w-3.5 h-3.5" /> Test Again</>
                                    : testStatus === 'failed'  ? <><AlertCircle className="w-3.5 h-3.5" /> Retry</>
                                    : <><Activity className="w-3.5 h-3.5" /> {isSSHProto ? 'Test Authentication' : 'Test Connection'}</>
                                }
                            </button>
                            {!canTest && (
                                <p className="text-[11px] text-slate-600 mt-2 text-center">
                                    {isSSHProto ? 'Enter new credentials to test' : 'Enter host & port first'}
                                </p>
                            )}
                            {testStatus === 'success' && testResult?.latency !== undefined && (
                                <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-lg bg-green-500/8 border border-green-500/20">
                                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                                    <div>
                                        <p className="text-xs font-medium text-green-400">
                                            {isSSHProto ? 'Authentication successful' : 'Port reachable'}
                                        </p>
                                        <p className="text-[11px] text-green-500/60">Latency: {testResult.latency}ms</p>
                                    </div>
                                </div>
                            )}
                            {testStatus === 'failed' && testResult?.error && (
                                <div className="mt-3 flex items-start gap-2.5 p-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
                                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-xs font-medium text-red-400">
                                            {isSSHProto ? 'Authentication failed' : 'Unreachable'}
                                        </p>
                                        <p className="text-[11px] text-red-400/60 break-words">{testResult.error}</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-col gap-2">
                            <button type="submit" disabled={saving} className="btn btn-primary w-full">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {saving ? 'Saving…' : 'Save Changes'}
                            </button>
                            <Link href="/dashboard" className="btn btn-secondary w-full justify-center">Cancel</Link>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
