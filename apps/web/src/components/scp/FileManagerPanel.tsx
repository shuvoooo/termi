'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
    RefreshCw, Upload, FolderPlus, Trash2, Download, Pencil,
    ChevronRight, Home, File, Folder,
    FileText, Image, Film, Music, Archive, Code, Link2,
    X, Check, AlertCircle, Loader2, Eye, EyeOff,
    ChevronUp, MoreVertical, CheckSquare,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export interface RemoteEntry {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'symlink' | 'other';
    size: number;
    modifiedAt: number;
    permissions: string;
    mode: number;
}

interface UploadItem {
    id: string;
    name: string;
    size: number;
    progress: number;
    status: 'uploading' | 'done' | 'error';
    error?: string;
}

export interface FileManagerPanelProps {
    serverId: string;
    /** Called when the user clicks the close / X button */
    onClose?: () => void;
    /** Show as a full-page layout (standalone SCP page) instead of a panel */
    fullPage?: boolean;
    /** Called whenever selected entries or current path changes (for transfer mode) */
    onSelectionChange?: (selected: RemoteEntry[], currentPath: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

function fmt(bytes: number): string {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)}K`;
    if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)}M`;
    return `${(bytes / 1_073_741_824).toFixed(1)}G`;
}

function fmtDate(ts: number): string {
    if (!ts) return '—';
    const d = new Date(ts * 1000);
    const now = new Date();
    const month = d.toLocaleString('default', { month: 'short' });
    if (d.getFullYear() !== now.getFullYear()) return `${month} ${d.getDate()}, ${d.getFullYear()}`;
    return `${month} ${d.getDate()}, ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

const EXT_ICONS: Record<string, React.ElementType> = {
    txt: FileText, md: FileText, log: FileText, csv: FileText,
    json: FileText, yaml: FileText, yml: FileText, xml: FileText,
    jpg: Image, jpeg: Image, png: Image, gif: Image, svg: Image, webp: Image,
    mp4: Film, mov: Film, avi: Film, mkv: Film,
    mp3: Music, wav: Music, flac: Music, ogg: Music,
    zip: Archive, tar: Archive, gz: Archive, bz2: Archive, xz: Archive, '7z': Archive, tgz: Archive,
    js: Code, ts: Code, jsx: Code, tsx: Code, py: Code, go: Code,
    rs: Code, java: Code, c: Code, cpp: Code, css: Code, html: Code, sh: Code,
};

function EntryIcon({ entry, size = 'sm' }: { entry: RemoteEntry; size?: 'sm' | 'md' }) {
    const cls = size === 'md' ? 'w-5 h-5' : 'w-4 h-4';
    if (entry.type === 'dir') return <Folder className={`${cls} text-amber-400 shrink-0`} />;
    if (entry.type === 'symlink') return <Link2 className={`${cls} text-sky-400 shrink-0`} />;
    const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
    const Icon = EXT_ICONS[ext] ?? File;
    return <Icon className={`${cls} text-slate-400 shrink-0`} />;
}

function segments(p: string) {
    if (p === '/') return [{ label: 'Root', path: '/' }];
    const parts = p.split('/').filter(Boolean);
    return [
        { label: 'Root', path: '/' },
        ...parts.map((s, i) => ({ label: s, path: '/' + parts.slice(0, i + 1).join('/') })),
    ];
}

function parent(p: string) {
    if (p === '/') return '/';
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return parts.length === 0 ? '/' : '/' + parts.join('/');
}

// ============================================================================
// MOBILE HOOK
// ============================================================================

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);
    return isMobile;
}

// ============================================================================
// BOTTOM SHEET  (mobile action menu)
// ============================================================================

function BottomSheet({
    title,
    children,
    onClose,
}: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    return (
        <div
            className="fixed inset-0 z-[200] flex flex-col justify-end bg-black/60"
            onClick={onClose}
        >
            <div
                className="bg-slate-800 rounded-t-2xl border-t border-slate-700 shadow-2xl max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                {/* Drag handle */}
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-600" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60">
                    <h3 className="font-medium text-sm text-white truncate pr-4">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full bg-slate-700/60 text-slate-400 active:bg-slate-600 shrink-0"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                {/* Actions */}
                <div className="p-3 pb-8">{children}</div>
            </div>
        </div>
    );
}

function SheetAction({
    icon: Icon,
    label,
    onClick,
    variant = 'default',
}: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    variant?: 'default' | 'danger';
}) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 px-3 py-3.5 rounded-xl text-sm font-medium transition-colors active:scale-[0.98]
                ${variant === 'danger'
                    ? 'text-red-400 hover:bg-red-500/10 active:bg-red-500/15'
                    : 'text-slate-200 hover:bg-slate-700 active:bg-slate-600/80'
                }`}
        >
            <Icon className={`w-5 h-5 shrink-0 ${variant === 'danger' ? 'text-red-400' : 'text-slate-400'}`} />
            {label}
        </button>
    );
}

// ============================================================================
// MODAL  (desktop)
// ============================================================================

function Modal({
    title,
    children,
    onClose,
}: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}) {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 rounded-xl p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                    <h3 className="font-semibold text-sm text-white">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                <div className="p-4">{children}</div>
            </div>
        </div>
    );
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function FileManagerPanel({
    serverId,
    onClose,
    fullPage = false,
    onSelectionChange,
}: FileManagerPanelProps) {
    const isMobile = useIsMobile();

    const [currentPath, setCurrentPath] = useState('/');
    const [entries, setEntries] = useState<RemoteEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showHidden, setShowHidden] = useState(false);

    // Mobile-specific: tap-to-select mode
    const [selectMode, setSelectMode] = useState(false);

    // Modals
    const [renaming, setRenaming] = useState<RemoteEntry | null>(null);
    const [renameVal, setRenameVal] = useState('');
    const [renameLoading, setRenameLoading] = useState(false);
    const [showNewFolder, setShowNewFolder] = useState(false);
    const [folderName, setFolderName] = useState('');
    const [folderLoading, setFolderLoading] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<RemoteEntry[] | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    // Mobile action sheet
    const [mobileActionEntry, setMobileActionEntry] = useState<RemoteEntry | null>(null);

    // Uploads
    const [uploads, setUploads] = useState<UploadItem[]>([]);
    const [uploadsExpanded, setUploadsExpanded] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const dragCounterRef = useRef(0);

    // Breadcrumb ref for auto-scroll
    const breadcrumbRef = useRef<HTMLDivElement>(null);

    // ── Directory listing ──────────────────────────────────────────────────

    const loadDir = useCallback(async (path: string) => {
        setLoading(true);
        setError(null);
        setSelected(new Set());
        setSelectMode(false);
        try {
            const res = await fetch(`/api/servers/${serverId}/sftp/list?path=${encodeURIComponent(path)}`);
            const data = await res.json();
            if (data.success) {
                setEntries(data.data.entries);
                setCurrentPath(path);
            } else {
                setError(data.error ?? 'Cannot read directory');
            }
        } catch {
            setError('Network error');
        } finally {
            setLoading(false);
        }
    }, [serverId]);

    useEffect(() => { loadDir('/'); }, [loadDir]);

    // Scroll breadcrumb to end when path changes
    useEffect(() => {
        if (breadcrumbRef.current) {
            breadcrumbRef.current.scrollLeft = breadcrumbRef.current.scrollWidth;
        }
    }, [currentPath]);

    // Notify parent (transfer mode) whenever selection or path changes
    useEffect(() => {
        if (!onSelectionChange) return;
        onSelectionChange(
            entries.filter(e => selected.has(e.path)),
            currentPath
        );
    }, [selected, currentPath, entries, onSelectionChange]);

    // ── Visible entries ────────────────────────────────────────────────────

    const visible = entries
        .filter(e => showHidden || !e.name.startsWith('.'))
        .sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
            return a.name.localeCompare(b.name);
        });

    // ── Selection ──────────────────────────────────────────────────────────

    function toggle(path: string) {
        setSelected(p => {
            const n = new Set(p);
            n.has(path) ? n.delete(path) : n.add(path);
            return n;
        });
    }

    // ── Download ───────────────────────────────────────────────────────────

    function download(entry: RemoteEntry) {
        const a = document.createElement('a');
        a.href = `/api/servers/${serverId}/sftp/download?path=${encodeURIComponent(entry.path)}`;
        a.download = entry.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    // ── New folder ─────────────────────────────────────────────────────────

    async function createFolder() {
        if (!folderName.trim()) return;
        setFolderLoading(true);
        try {
            const path = currentPath.replace(/\/+$/, '') + '/' + folderName.trim();
            const res = await fetch(`/api/servers/${serverId}/sftp/mkdir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path }),
            });
            if ((await res.json()).success) {
                setShowNewFolder(false);
                setFolderName('');
                loadDir(currentPath);
            }
        } finally {
            setFolderLoading(false);
        }
    }

    // ── Rename ─────────────────────────────────────────────────────────────

    async function doRename() {
        if (!renaming || !renameVal.trim() || renameVal === renaming.name) return;
        setRenameLoading(true);
        const newPath = renaming.path.replace(/\/[^/]+$/, '') + '/' + renameVal.trim();
        try {
            const res = await fetch(`/api/servers/${serverId}/sftp/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldPath: renaming.path, newPath }),
            });
            if ((await res.json()).success) {
                setRenaming(null);
                loadDir(currentPath);
            }
        } finally {
            setRenameLoading(false);
        }
    }

    // ── Delete ─────────────────────────────────────────────────────────────

    async function doDelete() {
        if (!deleteTarget) return;
        setDeleteLoading(true);
        try {
            await Promise.all(deleteTarget.map(e =>
                fetch(`/api/servers/${serverId}/sftp/delete`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: e.path, isDirectory: e.type === 'dir' }),
                })
            ));
            setDeleteTarget(null);
            setSelected(new Set());
            setSelectMode(false);
            loadDir(currentPath);
        } finally {
            setDeleteLoading(false);
        }
    }

    // ── Upload ─────────────────────────────────────────────────────────────

    function uploadFiles(files: FileList | File[]) {
        setUploadsExpanded(true);
        Array.from(files).forEach(file => {
            const uid = Math.random().toString(36).slice(2);
            setUploads(p => [...p, { id: uid, name: file.name, size: file.size, progress: 0, status: 'uploading' }]);

            const xhr = new XMLHttpRequest();
            const fd = new FormData();
            fd.append('file', file);
            fd.append('path', currentPath);

            xhr.upload.onprogress = (ev) => {
                if (ev.lengthComputable) setUploads(p =>
                    p.map(u => u.id === uid ? { ...u, progress: Math.round((ev.loaded / ev.total) * 100) } : u)
                );
            };
            xhr.onload = () => {
                const ok = xhr.status >= 200 && xhr.status < 300;
                setUploads(p => p.map(u => u.id === uid
                    ? { ...u, status: ok ? 'done' : 'error', progress: 100, error: ok ? undefined : 'Failed' }
                    : u
                ));
                if (ok) loadDir(currentPath);
            };
            xhr.onerror = () =>
                setUploads(p => p.map(u => u.id === uid ? { ...u, status: 'error', error: 'Network error' } : u));

            xhr.open('POST', `/api/servers/${serverId}/sftp/upload`);
            xhr.send(fd);
        });
    }

    // ── Drag & drop ────────────────────────────────────────────────────────

    function onDragEnter(e: React.DragEvent) {
        e.preventDefault();
        dragCounterRef.current++;
        if (e.dataTransfer.types.includes('Files')) setDragging(true);
    }
    function onDragLeave(e: React.DragEvent) {
        e.preventDefault();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) setDragging(false);
    }
    function onDragOver(e: React.DragEvent) { e.preventDefault(); }
    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragging(false);
        dragCounterRef.current = 0;
        if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files);
    }

    // ── Mobile row tap ─────────────────────────────────────────────────────

    function handleRowTap(entry: RemoteEntry) {
        if (selectMode) {
            toggle(entry.path);
        } else if (entry.type === 'dir') {
            loadDir(entry.path);
        } else {
            setMobileActionEntry(entry);
        }
    }

    // ── Computed ───────────────────────────────────────────────────────────

    const activeUploads = uploads.filter(u => u.status !== 'done' || true);
    const pendingCount = uploads.filter(u => u.status === 'uploading').length;
    const segs = segments(currentPath);

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div
            className="relative flex flex-col h-full bg-slate-900 overflow-hidden"
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
        >
            {/* Drop overlay */}
            {dragging && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2
                    bg-slate-900/95 border-2 border-dashed border-sky-500 rounded-xl pointer-events-none">
                    <Upload className="w-8 h-8 text-sky-400" />
                    <p className="text-sm font-semibold text-sky-300">Drop to upload</p>
                </div>
            )}

            {/* ── Top bar ── */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-900">
                {/* Breadcrumb — scrollable so long paths don't truncate on mobile */}
                <div
                    ref={breadcrumbRef}
                    className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    <button
                        onClick={() => loadDir('/')}
                        className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0"
                        title="Root"
                    >
                        <Home className="w-4 h-4" />
                    </button>
                    {segs.slice(1).map((seg, i) => (
                        <span key={seg.path} className="flex items-center gap-0.5 shrink-0">
                            <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />
                            {i === segs.length - 2 ? (
                                <span className="text-xs text-white font-medium px-1 whitespace-nowrap">{seg.label}</span>
                            ) : (
                                <button
                                    onClick={() => loadDir(seg.path)}
                                    className="text-xs text-slate-400 hover:text-white px-1 hover:underline whitespace-nowrap"
                                >
                                    {seg.label}
                                </button>
                            )}
                        </span>
                    ))}
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-0.5 shrink-0">
                    {/* Select mode toggle — mobile only */}
                    {isMobile && (
                        <button
                            onClick={() => { setSelectMode(m => !m); if (selectMode) setSelected(new Set()); }}
                            className={`p-2 rounded transition-colors ${selectMode
                                ? 'text-sky-400 bg-sky-500/10'
                                : 'text-slate-500 hover:text-white hover:bg-slate-700'
                            }`}
                            title="Select files"
                        >
                            <CheckSquare className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={() => setShowHidden(h => !h)}
                        className={`p-1.5 rounded transition-colors ${showHidden
                            ? 'text-sky-400 bg-sky-500/10'
                            : 'text-slate-500 hover:text-white hover:bg-slate-700'
                        }`}
                        title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
                    >
                        {showHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={() => setShowNewFolder(true)}
                        className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        title="New folder"
                    >
                        <FolderPlus className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-1.5 rounded text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
                        title="Upload files"
                    >
                        <Upload className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => loadDir(currentPath)}
                        disabled={loading}
                        className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                        title="Refresh"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded text-slate-500 hover:text-white hover:bg-slate-700 transition-colors ml-0.5"
                            title="Close file manager"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Select mode banner */}
            {isMobile && selectMode && (
                <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-sky-500/10 border-b border-sky-500/20">
                    <span className="text-xs text-sky-300 font-medium">
                        {selected.size > 0 ? `${selected.size} selected` : 'Tap items to select'}
                    </span>
                    <button
                        onClick={() => { setSelectMode(false); setSelected(new Set()); }}
                        className="text-xs text-sky-400 active:text-white"
                    >
                        Done
                    </button>
                </div>
            )}

            {/* ── File list ── */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {error ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                        <AlertCircle className="w-6 h-6 text-red-400" />
                        <p className="text-sm text-red-400">{error}</p>
                        <button onClick={() => loadDir(currentPath)} className="btn btn-secondary btn-sm">
                            Retry
                        </button>
                    </div>
                ) : (
                    <div className="py-0.5">
                        {/* Go up row */}
                        {currentPath !== '/' && (
                            <button
                                onClick={() => loadDir(parent(currentPath))}
                                className={`w-full flex items-center gap-2.5 px-3 hover:bg-slate-800/60 active:bg-slate-800 transition-colors
                                    ${isMobile ? 'py-4' : 'py-2'}`}
                            >
                                <ChevronUp className="w-4 h-4 text-slate-600 shrink-0" />
                                <span className="text-xs text-slate-500 font-mono">..</span>
                                <span className="text-xs text-slate-600 ml-1">Parent directory</span>
                            </button>
                        )}

                        {/* Skeleton */}
                        {loading ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className={`flex items-center gap-2.5 px-3 ${isMobile ? 'py-3.5' : 'py-2'}`}>
                                    <div className="w-4 h-4 skeleton rounded shrink-0" />
                                    <div className={`h-4 skeleton rounded ${i % 3 === 0 ? 'w-32' : i % 3 === 1 ? 'w-44' : 'w-24'}`} />
                                </div>
                            ))
                        ) : visible.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2">
                                <Folder className="w-8 h-8 opacity-40" />
                                <p className="text-sm">Empty directory</p>
                            </div>
                        ) : isMobile ? (
                            /* ── Mobile rows ── */
                            visible.map(entry => {
                                const isSelected = selected.has(entry.path);
                                return (
                                    <div
                                        key={entry.path}
                                        className={`flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-slate-800/80
                                            ${isSelected ? 'bg-sky-500/10' : ''}`}
                                        onClick={() => handleRowTap(entry)}
                                    >
                                        {/* Circle checkbox — only in select mode */}
                                        {selectMode && (
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
                                                ${isSelected ? 'bg-sky-500 border-sky-500' : 'border-slate-600'}`}
                                            >
                                                {isSelected && <Check className="w-3 h-3 text-white" />}
                                            </div>
                                        )}

                                        <EntryIcon entry={entry} size="md" />

                                        <div className="flex-1 min-w-0">
                                            <span className={`text-sm truncate block font-medium leading-snug
                                                ${entry.type === 'dir' ? 'text-amber-300' : 'text-slate-200'}`}>
                                                {entry.name}
                                            </span>
                                            <span className="text-xs text-slate-500 block mt-0.5">
                                                {entry.type === 'dir' ? 'Folder' : fmt(entry.size)}
                                                {entry.modifiedAt ? ` · ${fmtDate(entry.modifiedAt)}` : ''}
                                            </span>
                                        </div>

                                        {/* More button */}
                                        {!selectMode && (
                                            <button
                                                onClick={e => { e.stopPropagation(); setMobileActionEntry(entry); }}
                                                className="p-2.5 rounded-full text-slate-500 active:bg-slate-700 shrink-0 -mr-1"
                                                aria-label="More options"
                                            >
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            /* ── Desktop rows ── */
                            visible.map(entry => (
                                <div
                                    key={entry.path}
                                    className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors
                                        ${selected.has(entry.path) ? 'bg-sky-500/10' : 'hover:bg-slate-800/60'}`}
                                    onClick={() => entry.type === 'dir' ? loadDir(entry.path) : toggle(entry.path)}
                                    onDoubleClick={() => entry.type === 'dir' && loadDir(entry.path)}
                                >
                                    {/* Checkbox */}
                                    <input
                                        type="checkbox"
                                        checked={selected.has(entry.path)}
                                        onChange={() => toggle(entry.path)}
                                        onClick={e => e.stopPropagation()}
                                        className="rounded border-slate-600 bg-slate-800 accent-sky-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                        style={selected.has(entry.path) ? { opacity: 1 } : {}}
                                    />

                                    <EntryIcon entry={entry} />

                                    <div className="flex-1 min-w-0">
                                        <span className={`text-sm truncate block ${entry.type === 'dir' ? 'text-amber-300 font-medium' : 'text-slate-200'}`}>
                                            {entry.name}
                                        </span>
                                    </div>

                                    <span className="text-[10px] text-slate-500 shrink-0 w-8 text-right">
                                        {entry.type === 'dir' ? '' : fmt(entry.size)}
                                    </span>

                                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                        {entry.type !== 'dir' && (
                                            <button
                                                onClick={e => { e.stopPropagation(); download(entry); }}
                                                className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-sky-400 transition-colors"
                                                title="Download"
                                            >
                                                <Download className="w-3 h-3" />
                                            </button>
                                        )}
                                        <button
                                            onClick={e => { e.stopPropagation(); setRenaming(entry); setRenameVal(entry.name); }}
                                            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-amber-400 transition-colors"
                                            title="Rename"
                                        >
                                            <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={e => { e.stopPropagation(); setDeleteTarget([entry]); }}
                                            className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* ── Bulk action bar ── */}
            {selected.size > 0 && (
                <div className={`shrink-0 flex items-center justify-between gap-2 px-3 border-t border-slate-700 bg-slate-800/80
                    ${isMobile ? 'py-3' : 'py-2'}`}>
                    <span className={`${isMobile ? 'text-sm' : 'text-xs'} text-slate-300`}>
                        {selected.size} selected
                    </span>
                    <button
                        onClick={() => setDeleteTarget(entries.filter(e => selected.has(e.path)))}
                        className={`btn btn-danger gap-1 ${isMobile ? '' : 'btn-sm'}`}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                    </button>
                </div>
            )}

            {/* ── Upload queue ── */}
            {activeUploads.length > 0 && (
                <div className="shrink-0 border-t border-slate-700 bg-slate-800/50">
                    <button
                        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                        onClick={() => setUploadsExpanded(e => !e)}
                    >
                        <span className="flex items-center gap-1.5">
                            {pendingCount > 0 && <Loader2 className="w-3 h-3 animate-spin text-sky-400" />}
                            Uploads ({uploads.filter(u => u.status === 'done').length}/{uploads.length})
                        </span>
                        <ChevronUp className={`w-3.5 h-3.5 transition-transform ${uploadsExpanded ? '' : 'rotate-180'}`} />
                    </button>
                    {uploadsExpanded && (
                        <div className="max-h-36 overflow-y-auto px-3 pb-2 space-y-1">
                            {activeUploads.map(u => (
                                <div key={u.id} className="flex items-center gap-2">
                                    <div className="shrink-0 w-3.5">
                                        {u.status === 'done' && <Check className="w-3.5 h-3.5 text-green-400" />}
                                        {u.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
                                        {u.status === 'uploading' && <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-300 truncate">{u.name}</p>
                                        {u.status === 'uploading' && (
                                            <div className="h-1 bg-slate-700 rounded-full mt-0.5 overflow-hidden">
                                                <div
                                                    className="h-full bg-sky-500 rounded-full transition-all"
                                                    style={{ width: `${u.progress}%` }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {u.status !== 'uploading' && (
                                        <button
                                            onClick={() => setUploads(p => p.filter(x => x.id !== u.id))}
                                            className="p-0.5 text-slate-600 hover:text-white"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Status bar ── */}
            <div className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-slate-800 bg-slate-900/60">
                <span className="text-[10px] text-slate-600">
                    {visible.length} item{visible.length !== 1 ? 's' : ''}
                    {!showHidden && entries.length !== visible.length ? ` · ${entries.length - visible.length} hidden` : ''}
                </span>
                <span className="text-[10px] text-slate-700 font-mono truncate max-w-[160px]">{currentPath}</span>
            </div>

            {/* ── Hidden file input ── */}
            <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="*/*"
                className="hidden"
                onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
            />

            {/* ── Mobile: entry action sheet ── */}
            {mobileActionEntry && (
                <BottomSheet
                    title={mobileActionEntry.name}
                    onClose={() => setMobileActionEntry(null)}
                >
                    {mobileActionEntry.type === 'dir' ? (
                        <SheetAction
                            icon={Folder}
                            label="Open folder"
                            onClick={() => { loadDir(mobileActionEntry.path); setMobileActionEntry(null); }}
                        />
                    ) : (
                        <SheetAction
                            icon={Download}
                            label="Download"
                            onClick={() => { download(mobileActionEntry); setMobileActionEntry(null); }}
                        />
                    )}
                    <SheetAction
                        icon={Pencil}
                        label="Rename"
                        onClick={() => {
                            setRenaming(mobileActionEntry);
                            setRenameVal(mobileActionEntry.name);
                            setMobileActionEntry(null);
                        }}
                    />
                    <SheetAction
                        icon={Trash2}
                        label="Delete"
                        variant="danger"
                        onClick={() => { setDeleteTarget([mobileActionEntry]); setMobileActionEntry(null); }}
                    />
                </BottomSheet>
            )}

            {/* ── Modals ── */}

            {showNewFolder && (
                <Modal title="New Folder" onClose={() => { setShowNewFolder(false); setFolderName(''); }}>
                    <div className="space-y-3">
                        <input
                            autoFocus
                            type="text"
                            value={folderName}
                            onChange={e => setFolderName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && createFolder()}
                            placeholder="folder-name"
                            className="input text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => { setShowNewFolder(false); setFolderName(''); }} className="btn btn-secondary btn-sm">
                                Cancel
                            </button>
                            <button
                                onClick={createFolder}
                                disabled={!folderName.trim() || folderLoading}
                                className="btn btn-primary btn-sm"
                            >
                                {folderLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
                                Create
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {renaming && (
                <Modal title="Rename" onClose={() => setRenaming(null)}>
                    <div className="space-y-3">
                        <input
                            autoFocus
                            type="text"
                            value={renameVal}
                            onChange={e => setRenameVal(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && doRename()}
                            className="input text-sm"
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setRenaming(null)} className="btn btn-secondary btn-sm">
                                Cancel
                            </button>
                            <button
                                onClick={doRename}
                                disabled={!renameVal.trim() || renameVal === renaming.name || renameLoading}
                                className="btn btn-primary btn-sm"
                            >
                                {renameLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Rename
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {deleteTarget && (
                <Modal title="Confirm Delete" onClose={() => setDeleteTarget(null)}>
                    <div className="space-y-3">
                        <div className="flex gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-xs text-slate-300">
                                Delete {deleteTarget.length === 1 ? `"${deleteTarget[0].name}"` : `${deleteTarget.length} items`}?
                                {deleteTarget.some(e => e.type === 'dir') && ' Directories will be removed recursively.'}
                                {' '}This cannot be undone.
                            </p>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setDeleteTarget(null)} className="btn btn-secondary btn-sm">
                                Cancel
                            </button>
                            <button onClick={doDelete} disabled={deleteLoading} className="btn btn-danger btn-sm">
                                {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}
