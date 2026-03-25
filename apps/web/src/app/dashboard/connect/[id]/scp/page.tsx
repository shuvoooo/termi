'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import FileManagerPanel from '@/components/scp/FileManagerPanel';

export default function SCPPage() {
    const { id: serverId } = useParams<{ id: string }>();
    const [serverName, setServerName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/servers/${serverId}`)
            .then(r => r.json())
            .then(data => {
                if (data.success) setServerName(data.data.server.name);
                else setError('Server not found');
            })
            .catch(() => setError('Failed to load server'))
            .finally(() => setLoading(false));
    }, [serverId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
                <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)] gap-4">
                <AlertCircle className="w-10 h-10 text-red-400" />
                <p className="text-red-400">{error}</p>
                <Link href="/dashboard" className="btn btn-primary">Back to Dashboard</Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)]">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                <Link href="/dashboard" className="btn btn-ghost btn-icon">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                    <h1 className="font-medium">{serverName}</h1>
                    <span className="text-sm text-dark-400">File Manager (SFTP)</span>
                </div>
            </div>

            {/* Full-height panel */}
            <div className="flex-1 min-h-0 rounded-xl border border-slate-700 overflow-hidden">
                <FileManagerPanel serverId={serverId} />
            </div>
        </div>
    );
}
