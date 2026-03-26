'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
    FolderOpen, Plus, Pencil, Trash2, Server,
    X, Check, Loader2, AlertTriangle, ChevronUp,
    ChevronDown, Terminal, Monitor, FolderClosed,
    Layers, Tag, Globe, Lock, Search,
    ChevronRight,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface ServerInGroup {
    id: string;
    name: string;
    protocol: 'SSH' | 'SCP' | 'RDP' | 'VNC';
    isFavorite: boolean;
}

interface Group {
    id: string;
    name: string;
    description: string | null;
    color: string | null;
    icon: string | null;
    sortOrder: number;
    createdAt: string;
    _count: { servers: number };
}

interface GroupDetail extends Group {
    servers: ServerInGroup[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const PRESET_COLORS = [
    '#0ea5e9', // sky
    '#8b5cf6', // violet
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#ec4899', // pink
    '#14b8a6', // teal
    '#6366f1', // indigo
    '#f97316', // orange
    '#84cc16', // lime
];

const PRESET_ICONS = [
    { value: 'folder', label: 'Folder', icon: FolderOpen },
    { value: 'server', label: 'Server', icon: Server },
    { value: 'terminal', label: 'Terminal', icon: Terminal },
    { value: 'monitor', label: 'Monitor', icon: Monitor },
    { value: 'globe', label: 'Globe', icon: Globe },
    { value: 'lock', label: 'Lock', icon: Lock },
    { value: 'tag', label: 'Tag', icon: Tag },
    { value: 'layers', label: 'Layers', icon: Layers },
];

const protocolColors: Record<string, string> = {
    SSH: 'bg-green-500/20 text-green-400',
    SCP: 'bg-blue-500/20 text-blue-400',
    RDP: 'bg-purple-500/20 text-purple-400',
    VNC: 'bg-orange-500/20 text-orange-400',
};

// ============================================================================
// HELPERS
// ============================================================================

function getIconComponent(iconName: string | null) {
    if (!iconName) return FolderOpen;
    const found = PRESET_ICONS.find(i => i.value === iconName);
    return found ? found.icon : FolderOpen;
}

// ============================================================================
// MODAL – Create / Edit Group
// ============================================================================

interface GroupFormData {
    name: string;
    description: string;
    color: string;
    icon: string;
}

function GroupModal({
    open,
    mode,
    initial,
    onClose,
    onSave,
}: {
    open: boolean;
    mode: 'create' | 'edit';
    initial: GroupFormData;
    onClose: () => void;
    onSave: (data: GroupFormData) => Promise<void>;
}) {
    const [form, setForm] = useState<GroupFormData>(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);

    // Sync form when initial changes (edit mode)
    useEffect(() => {
        setForm(initial);
        setError('');
    }, [initial, open]);

    useEffect(() => {
        if (open) {
            setTimeout(() => nameRef.current?.focus(), 50);
        }
    }, [open]);

    if (!open) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) { setError('Name is required'); return; }
        setSaving(true);
        setError('');
        try {
            await onSave(form);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const update = (fields: Partial<GroupFormData>) => setForm(f => ({ ...f, ...fields }));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                    <h2 className="text-lg font-semibold">
                        {mode === 'create' ? 'Create Group' : 'Edit Group'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Name */}
                    <div>
                        <label className="label">Name <span className="text-red-400">*</span></label>
                        <input
                            ref={nameRef}
                            type="text"
                            className="input"
                            placeholder="e.g. Production Servers"
                            maxLength={50}
                            value={form.name}
                            onChange={e => update({ name: e.target.value })}
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="label">Description <span className="text-slate-500 font-normal">(optional)</span></label>
                        <textarea
                            className="input resize-none"
                            rows={2}
                            placeholder="Brief description of this group..."
                            maxLength={200}
                            value={form.description}
                            onChange={e => update({ description: e.target.value })}
                        />
                    </div>

                    {/* Color */}
                    <div>
                        <label className="label">Color <span className="text-slate-500 font-normal">(optional)</span></label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {PRESET_COLORS.map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => update({ color: form.color === c ? '' : c })}
                                    className={`w-7 h-7 rounded-full transition-all duration-150 ${
                                        form.color === c
                                            ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white scale-110'
                                            : 'hover:scale-105'
                                    }`}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                />
                            ))}
                            {/* Custom color */}
                            <label className="w-7 h-7 rounded-full border-2 border-dashed border-slate-600 hover:border-slate-400 transition-colors cursor-pointer flex items-center justify-center text-slate-500 hover:text-white" title="Custom color">
                                <Plus className="w-3.5 h-3.5" />
                                <input
                                    type="color"
                                    className="sr-only"
                                    value={form.color || '#ffffff'}
                                    onChange={e => update({ color: e.target.value })}
                                />
                            </label>
                        </div>
                        {form.color && (
                            <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: form.color }} />
                                <span>{form.color}</span>
                                <button type="button" onClick={() => update({ color: '' })} className="text-slate-500 hover:text-slate-300">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Icon */}
                    <div>
                        <label className="label">Icon <span className="text-slate-500 font-normal">(optional)</span></label>
                        <div className="flex flex-wrap gap-2 mt-1">
                            {PRESET_ICONS.map(({ value, label, icon: Icon }) => (
                                <button
                                    key={value}
                                    type="button"
                                    title={label}
                                    onClick={() => update({ icon: form.icon === value ? '' : value })}
                                    className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-all duration-150 ${
                                        form.icon === value
                                            ? 'bg-sky-500/20 border-sky-500/60 text-sky-400'
                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white'
                                    }`}
                                >
                                    <Icon className="w-4 h-4" />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="btn btn-primary flex-1">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {mode === 'create' ? 'Create Group' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ============================================================================
// DELETE CONFIRM MODAL
// ============================================================================

function DeleteModal({
    open,
    group,
    onClose,
    onConfirm,
}: {
    open: boolean;
    group: Group | null;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}) {
    const [deleting, setDeleting] = useState(false);

    if (!open || !group) return null;

    const handleConfirm = async () => {
        setDeleting(true);
        try {
            await onConfirm();
            onClose();
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-6">
                <div className="flex items-start gap-4 mb-5">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold mb-1">Delete Group</h2>
                        <p className="text-sm text-slate-400">
                            Are you sure you want to delete <span className="text-white font-medium">&ldquo;{group.name}&rdquo;</span>?
                            {group._count.servers > 0 && (
                                <> The {group._count.servers} server{group._count.servers !== 1 ? 's' : ''} in this group will be ungrouped.</>
                            )}
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <button onClick={onClose} className="btn btn-secondary flex-1" disabled={deleting}>
                        Cancel
                    </button>
                    <button onClick={handleConfirm} disabled={deleting} className="btn btn-danger flex-1">
                        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// GROUP CARD
// ============================================================================

function GroupCard({
    group,
    detail,
    expanded,
    onToggle,
    onEdit,
    onDelete,
    onMoveUp,
    onMoveDown,
    isFirst,
    isLast,
}: {
    group: Group;
    detail: GroupDetail | null;
    expanded: boolean;
    onToggle: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    isFirst: boolean;
    isLast: boolean;
}) {
    const [loadingDetail] = useState(false);
    const IconComp = getIconComponent(group.icon);

    return (
        <div className="card card-hover transition-all duration-200">
            {/* Main row */}
            <div
                className="flex items-center gap-4 p-4 cursor-pointer select-none"
                onClick={onToggle}
            >
                {/* Color bar */}
                <div
                    className="w-1 self-stretch rounded-full shrink-0"
                    style={{ backgroundColor: group.color || '#475569', minHeight: '2rem' }}
                />

                {/* Icon */}
                <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                        backgroundColor: group.color ? `${group.color}22` : 'rgb(30 41 59)',
                        border: `1px solid ${group.color ? `${group.color}44` : 'rgb(51 65 85)'}`,
                    }}
                >
                    <IconComp
                        className="w-5 h-5"
                        style={{ color: group.color || '#94a3b8' }}
                    />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white truncate">{group.name}</span>
                        <span className="badge bg-slate-700/80 text-slate-300 text-xs">
                            {group._count.servers} {group._count.servers === 1 ? 'server' : 'servers'}
                        </span>
                    </div>
                    {group.description && (
                        <p className="text-sm text-slate-400 truncate mt-0.5">{group.description}</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {/* Reorder */}
                    <button
                        disabled={isFirst}
                        onClick={onMoveUp}
                        title="Move up"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                        disabled={isLast}
                        onClick={onMoveDown}
                        title="Move down"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                        <ChevronDown className="w-4 h-4" />
                    </button>
                    <div className="w-px h-5 bg-slate-700 mx-1" />
                    <button
                        onClick={onEdit}
                        title="Edit group"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onDelete}
                        title="Delete group"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                    {/* Expand chevron */}
                    <div className="w-px h-5 bg-slate-700 mx-1" />
                    <div
                        className={`p-1.5 rounded-lg text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                    >
                        <ChevronRight className="w-4 h-4" />
                    </div>
                </div>
            </div>

            {/* Expanded – server list */}
            {expanded && (
                <div className="border-t border-slate-700/60">
                    {loadingDetail && (
                        <div className="flex items-center justify-center py-6 text-slate-400 text-sm gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading servers…
                        </div>
                    )}
                    {!loadingDetail && detail && detail.servers.length === 0 && (
                        <div className="px-6 py-5 text-center text-sm text-slate-500">
                            <FolderClosed className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            No servers in this group yet.
                            <Link
                                href="/dashboard/servers/new"
                                className="block mt-2 text-sky-400 hover:text-sky-300 transition-colors"
                            >
                                Add a server
                            </Link>
                        </div>
                    )}
                    {!loadingDetail && detail && detail.servers.length > 0 && (
                        <div className="divide-y divide-slate-700/40">
                            {detail.servers.map(srv => (
                                <Link
                                    key={srv.id}
                                    href={`/dashboard/servers/${srv.id}`}
                                    className="flex items-center gap-3 px-6 py-3 hover:bg-slate-800/50 transition-colors group"
                                >
                                    <span className={`badge ${protocolColors[srv.protocol] || ''} text-xs shrink-0`}>
                                        {srv.protocol}
                                    </span>
                                    <span className="text-sm text-slate-200 truncate flex-1 group-hover:text-white transition-colors">
                                        {srv.name}
                                    </span>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

const EMPTY_FORM: GroupFormData = { name: '', description: '', color: '', icon: '' };

export default function GroupsPage() {
    const [groups, setGroups] = useState<Group[]>([]);
    const [details, setDetails] = useState<Record<string, GroupDetail>>({});
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [search, setSearch] = useState('');

    // Modal state
    const [showCreate, setShowCreate] = useState(false);
    const [editTarget, setEditTarget] = useState<Group | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Group | null>(null);

    // Notification
    const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    const showToast = useCallback((type: 'success' | 'error', msg: string) => {
        setToast({ type, msg });
        setTimeout(() => setToast(null), 3500);
    }, []);

    // ── Load groups ───────────────────────────────────────────────────────

    const loadGroups = useCallback(async () => {
        try {
            const res = await fetch('/api/groups');
            const data = await res.json();
            if (data.success) setGroups(data.data.groups);
        } catch {
            showToast('error', 'Failed to load groups');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadGroups(); }, [loadGroups]);

    // ── Load group detail when expanding ─────────────────────────────────

    const handleToggle = useCallback(async (groupId: string) => {
        if (expandedId === groupId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(groupId);
        if (details[groupId]) return; // already loaded

        try {
            const res = await fetch(`/api/groups/${groupId}`);
            const data = await res.json();
            if (data.success) {
                setDetails(prev => ({ ...prev, [groupId]: data.data.group }));
            }
        } catch {
            /* silent */
        }
    }, [expandedId, details]);

    // ── Create ────────────────────────────────────────────────────────────

    const handleCreate = async (form: GroupFormData) => {
        const res = await fetch('/api/groups', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: form.name.trim(),
                ...(form.description && { description: form.description }),
                ...(form.color && { color: form.color }),
                ...(form.icon && { icon: form.icon }),
            }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to create group');
        setGroups(prev => [...prev, { ...data.data.group, _count: { servers: 0 } }]);
        showToast('success', `Group "${form.name.trim()}" created`);
    };

    // ── Edit ──────────────────────────────────────────────────────────────

    const handleEdit = async (form: GroupFormData) => {
        if (!editTarget) return;
        const res = await fetch(`/api/groups/${editTarget.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: form.name.trim(),
                description: form.description || null,
                color: form.color || null,
                icon: form.icon || null,
            }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to update group');
        setGroups(prev =>
            prev.map(g =>
                g.id === editTarget.id
                    ? { ...g, ...data.data.group }
                    : g
            )
        );
        // Invalidate cached detail
        setDetails(prev => {
            const next = { ...prev };
            delete next[editTarget.id];
            return next;
        });
        showToast('success', 'Group updated');
    };

    // ── Delete ────────────────────────────────────────────────────────────

    const handleDelete = async () => {
        if (!deleteTarget) return;
        const res = await fetch(`/api/groups/${deleteTarget.id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to delete group');
        setGroups(prev => prev.filter(g => g.id !== deleteTarget.id));
        if (expandedId === deleteTarget.id) setExpandedId(null);
        showToast('success', `Group "${deleteTarget.name}" deleted`);
    };

    // ── Reorder ───────────────────────────────────────────────────────────

    const handleMove = useCallback(async (groupId: string, direction: 'up' | 'down') => {
        const idx = groups.findIndex(g => g.id === groupId);
        if (idx < 0) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= groups.length) return;

        const next = [...groups];
        [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
        setGroups(next);

        try {
            await fetch('/api/groups/reorder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groupIds: next.map(g => g.id) }),
            });
        } catch {
            // Revert on error
            setGroups(groups);
            showToast('error', 'Failed to reorder groups');
        }
    }, [groups, showToast]);

    // ── Filtered view ─────────────────────────────────────────────────────

    const filtered = groups.filter(g =>
        !search || g.name.toLowerCase().includes(search.toLowerCase()) ||
        (g.description?.toLowerCase().includes(search.toLowerCase()))
    );

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <div className="max-w-3xl mx-auto">
            {/* Toast */}
            {toast && (
                <div
                    className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm font-medium transition-all duration-300 ${
                        toast.type === 'success'
                            ? 'bg-green-500/10 border-green-500/30 text-green-300'
                            : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}
                >
                    {toast.type === 'success'
                        ? <Check className="w-4 h-4 shrink-0" />
                        : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {toast.msg}
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold">Groups</h1>
                    <p className="text-slate-400 text-sm mt-0.5">
                        Organise your servers into groups
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="btn btn-primary shrink-0"
                >
                    <Plus className="w-4 h-4" />
                    Create Group
                </button>
            </div>

            {/* Search */}
            {groups.length > 3 && (
                <div className="relative mb-5">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        className="input pl-9"
                        placeholder="Search groups…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-400 gap-3">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span>Loading groups…</span>
                </div>
            ) : groups.length === 0 ? (
                /* ── Empty state ── */
                <div className="card p-10 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center mx-auto mb-4">
                        <FolderOpen className="w-8 h-8 text-slate-500" />
                    </div>
                    <h2 className="text-lg font-semibold mb-2">No groups yet</h2>
                    <p className="text-slate-400 text-sm mb-6 max-w-xs mx-auto">
                        Groups help you organise servers by environment, project, or team.
                    </p>
                    <button
                        onClick={() => setShowCreate(true)}
                        className="btn btn-primary mx-auto"
                    >
                        <Plus className="w-4 h-4" />
                        Create your first group
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="card p-8 text-center text-slate-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No groups match &ldquo;{search}&rdquo;</p>
                    <button
                        onClick={() => setSearch('')}
                        className="mt-3 text-sky-400 hover:text-sky-300 text-sm transition-colors"
                    >
                        Clear search
                    </button>
                </div>
            ) : (
                /* ── Group list ── */
                <div className="space-y-3">
                    {filtered.map((group, idx) => (
                        <GroupCard
                            key={group.id}
                            group={group}
                            detail={details[group.id] ?? null}
                            expanded={expandedId === group.id}
                            onToggle={() => handleToggle(group.id)}
                            onEdit={() => setEditTarget(group)}
                            onDelete={() => setDeleteTarget(group)}
                            onMoveUp={() => handleMove(group.id, 'up')}
                            onMoveDown={() => handleMove(group.id, 'down')}
                            isFirst={idx === 0}
                            isLast={idx === filtered.length - 1}
                        />
                    ))}

                    {/* Summary */}
                    <p className="text-xs text-slate-600 text-center pt-2">
                        {groups.length} group{groups.length !== 1 ? 's' : ''}
                        {' · '}
                        {groups.reduce((s, g) => s + g._count.servers, 0)} server{groups.reduce((s, g) => s + g._count.servers, 0) !== 1 ? 's' : ''} total
                    </p>
                </div>
            )}

            {/* Modals */}
            <GroupModal
                open={showCreate}
                mode="create"
                initial={EMPTY_FORM}
                onClose={() => setShowCreate(false)}
                onSave={handleCreate}
            />
            <GroupModal
                open={!!editTarget}
                mode="edit"
                initial={
                    editTarget
                        ? {
                              name: editTarget.name,
                              description: editTarget.description ?? '',
                              color: editTarget.color ?? '',
                              icon: editTarget.icon ?? '',
                          }
                        : EMPTY_FORM
                }
                onClose={() => setEditTarget(null)}
                onSave={handleEdit}
            />
            <DeleteModal
                open={!!deleteTarget}
                group={deleteTarget}
                onClose={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            />
        </div>
    );
}

