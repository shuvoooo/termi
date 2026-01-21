'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Terminal,
    FolderOpen,
    Monitor,
    Loader2,
    Eye,
    EyeOff,
    Plus,
    X,
} from 'lucide-react';

interface Group {
    id: string;
    name: string;
    color: string | null;
}

const protocols = [
    { value: 'SSH', label: 'SSH', icon: Terminal, description: 'Secure shell terminal', color: 'green' },
    { value: 'SCP', label: 'SCP', icon: FolderOpen, description: 'Secure file transfer', color: 'blue' },
    { value: 'RDP', label: 'RDP', icon: Monitor, description: 'Windows Remote Desktop', color: 'purple' },
    { value: 'VNC', label: 'VNC', icon: Monitor, description: 'Virtual Network Computing', color: 'orange' },
];

const defaultPorts = {
    SSH: 22,
    SCP: 22,
    RDP: 3389,
    VNC: 5900,
};

export default function NewServerPage() {
    const router = useRouter();
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPassphrase, setShowPassphrase] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        groupId: '',
        protocol: 'SSH',
        host: '',
        port: 22,
        username: '',
        authMethod: 'password' as 'password' | 'key',
        password: '',
        privateKey: '',
        passphrase: '',
        notes: '',
        tags: [] as string[],
    });
    const [tagInput, setTagInput] = useState('');

    useEffect(() => {
        async function fetchGroups() {
            try {
                const response = await fetch('/api/groups');
                const data = await response.json();
                if (data.success) {
                    setGroups(data.data.groups);
                }
            } catch (error) {
                console.error('Failed to fetch groups:', error);
            }
        }
        fetchGroups();
    }, []);

    const handleProtocolChange = (protocol: string) => {
        setFormData({
            ...formData,
            protocol,
            port: defaultPorts[protocol as keyof typeof defaultPorts],
        });
    };

    const addTag = () => {
        const tag = tagInput.trim();
        if (tag && !formData.tags.includes(tag)) {
            setFormData({ ...formData, tags: [...formData.tags, tag] });
            setTagInput('');
        }
    };

    const removeTag = (tag: string) => {
        setFormData({
            ...formData,
            tags: formData.tags.filter((t) => t !== tag),
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/servers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formData.name,
                    description: formData.description || undefined,
                    groupId: formData.groupId || undefined,
                    protocol: formData.protocol,
                    host: formData.host,
                    port: formData.port,
                    username: formData.username,
                    password: formData.authMethod === 'password' ? formData.password : undefined,
                    privateKey: formData.authMethod === 'key' ? formData.privateKey : undefined,
                    passphrase: formData.authMethod === 'key' ? formData.passphrase : undefined,
                    notes: formData.notes || undefined,
                    tags: formData.tags.length > 0 ? formData.tags : undefined,
                }),
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Failed to create server');
                setLoading(false);
                return;
            }

            router.push('/dashboard');
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/dashboard" className="btn btn-ghost btn-icon">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="text-2xl font-bold">Add Server</h1>
                    <p className="text-dark-400 mt-1">
                        Configure a new server connection
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Protocol Selection */}
                <div>
                    <label className="label">Protocol</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {protocols.map((p) => (
                            <button
                                key={p.value}
                                type="button"
                                onClick={() => handleProtocolChange(p.value)}
                                className={`card p-3 text-center transition-all ${formData.protocol === p.value
                                        ? 'ring-2 ring-primary-500 border-primary-500'
                                        : 'hover:border-dark-600'
                                    }`}
                            >
                                <p.icon
                                    className={`w-6 h-6 mx-auto mb-1 ${formData.protocol === p.value
                                            ? 'text-primary-400'
                                            : 'text-dark-400'
                                        }`}
                                />
                                <span className="text-sm font-medium">{p.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Basic Info */}
                <div className="card p-6 space-y-4">
                    <h2 className="font-medium">Basic Information</h2>

                    <div>
                        <label htmlFor="name" className="label">
                            Server Name
                        </label>
                        <input
                            type="text"
                            id="name"
                            value={formData.name}
                            onChange={(e) =>
                                setFormData({ ...formData, name: e.target.value })
                            }
                            className="input"
                            placeholder="My Server"
                            required
                        />
                    </div>

                    <div>
                        <label htmlFor="description" className="label">
                            Description
                            <span className="text-dark-500 ml-1">(optional)</span>
                        </label>
                        <input
                            type="text"
                            id="description"
                            value={formData.description}
                            onChange={(e) =>
                                setFormData({ ...formData, description: e.target.value })
                            }
                            className="input"
                            placeholder="Production web server"
                        />
                    </div>

                    <div>
                        <label htmlFor="group" className="label">
                            Group
                            <span className="text-dark-500 ml-1">(optional)</span>
                        </label>
                        <select
                            id="group"
                            value={formData.groupId}
                            onChange={(e) =>
                                setFormData({ ...formData, groupId: e.target.value })
                            }
                            className="input"
                        >
                            <option value="">No group</option>
                            {groups.map((group) => (
                                <option key={group.id} value={group.id}>
                                    {group.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Connection */}
                <div className="card p-6 space-y-4">
                    <h2 className="font-medium">Connection</h2>

                    <div className="grid sm:grid-cols-3 gap-4">
                        <div className="sm:col-span-2">
                            <label htmlFor="host" className="label">
                                Host / IP Address
                            </label>
                            <input
                                type="text"
                                id="host"
                                value={formData.host}
                                onChange={(e) =>
                                    setFormData({ ...formData, host: e.target.value })
                                }
                                className="input"
                                placeholder="192.168.1.100 or example.com"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="port" className="label">
                                Port
                            </label>
                            <input
                                type="number"
                                id="port"
                                value={formData.port}
                                onChange={(e) =>
                                    setFormData({ ...formData, port: parseInt(e.target.value) })
                                }
                                className="input"
                                min={1}
                                max={65535}
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="username" className="label">
                            Username
                        </label>
                        <input
                            type="text"
                            id="username"
                            value={formData.username}
                            onChange={(e) =>
                                setFormData({ ...formData, username: e.target.value })
                            }
                            className="input"
                            placeholder="root"
                            required
                        />
                    </div>
                </div>

                {/* Authentication */}
                <div className="card p-6 space-y-4">
                    <h2 className="font-medium">Authentication</h2>

                    {(formData.protocol === 'SSH' || formData.protocol === 'SCP') && (
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setFormData({ ...formData, authMethod: 'password' })
                                }
                                className={`btn ${formData.authMethod === 'password'
                                        ? 'btn-primary'
                                        : 'btn-secondary'
                                    }`}
                            >
                                Password
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, authMethod: 'key' })}
                                className={`btn ${formData.authMethod === 'key' ? 'btn-primary' : 'btn-secondary'
                                    }`}
                            >
                                SSH Key
                            </button>
                        </div>
                    )}

                    {formData.authMethod === 'password' && (
                        <div>
                            <label htmlFor="password" className="label">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="password"
                                    value={formData.password}
                                    onChange={(e) =>
                                        setFormData({ ...formData, password: e.target.value })
                                    }
                                    className="input pr-12"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                                >
                                    {showPassword ? (
                                        <EyeOff className="w-5 h-5" />
                                    ) : (
                                        <Eye className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        </div>
                    )}

                    {formData.authMethod === 'key' && (
                        <>
                            <div>
                                <label htmlFor="privateKey" className="label">
                                    Private Key
                                </label>
                                <textarea
                                    id="privateKey"
                                    value={formData.privateKey}
                                    onChange={(e) =>
                                        setFormData({ ...formData, privateKey: e.target.value })
                                    }
                                    className="input min-h-[150px] font-mono text-sm"
                                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----"
                                />
                            </div>
                            <div>
                                <label htmlFor="passphrase" className="label">
                                    Key Passphrase
                                    <span className="text-dark-500 ml-1">(if encrypted)</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type={showPassphrase ? 'text' : 'password'}
                                        id="passphrase"
                                        value={formData.passphrase}
                                        onChange={(e) =>
                                            setFormData({ ...formData, passphrase: e.target.value })
                                        }
                                        className="input pr-12"
                                        placeholder="••••••••"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassphrase(!showPassphrase)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                                    >
                                        {showPassphrase ? (
                                            <EyeOff className="w-5 h-5" />
                                        ) : (
                                            <Eye className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Tags */}
                <div className="card p-6 space-y-4">
                    <h2 className="font-medium">Tags</h2>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    addTag();
                                }
                            }}
                            className="input flex-1"
                            placeholder="Add tag..."
                        />
                        <button
                            type="button"
                            onClick={addTag}
                            className="btn btn-secondary"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>

                    {formData.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {formData.tags.map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-dark-700 text-sm"
                                >
                                    {tag}
                                    <button
                                        type="button"
                                        onClick={() => removeTag(tag)}
                                        className="text-dark-400 hover:text-red-400"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                </div>

                {/* Notes */}
                <div className="card p-6">
                    <label htmlFor="notes" className="label">
                        Notes
                        <span className="text-dark-500 ml-1">(optional)</span>
                    </label>
                    <textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="input min-h-[100px]"
                        placeholder="Additional notes about this server..."
                    />
                </div>

                {/* Error */}
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <Link href="/dashboard" className="btn btn-secondary">
                        Cancel
                    </Link>
                    <button type="submit" disabled={loading} className="btn btn-primary flex-1">
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            'Create Server'
                        )}
                    </button>
                </div>
            </form>
        </div>
    );
}
