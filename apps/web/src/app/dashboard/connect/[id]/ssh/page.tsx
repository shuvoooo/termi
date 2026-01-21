'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
    ArrowLeft,
    Maximize2,
    Minimize2,
    RotateCcw,
    Upload,
    Download,
    X,
} from 'lucide-react';

// Dynamically import SSHTerminal to avoid SSR issues with xterm
const SSHTerminal = dynamic(
    () => import('@/components/terminal/SSHTerminal'),
    { ssr: false }
);

const VirtualKeyboard = dynamic(
    () => import('@/components/terminal/VirtualKeyboard'),
    { ssr: false }
);

export default function SSHConnectionPage() {
    const params = useParams();
    const router = useRouter();
    const serverId = params.id as string;

    const [server, setServer] = useState<{ name: string } | null>(null);
    const [connectionToken, setConnectionToken] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const terminalKeyHandler = useRef<((key: string) => void) | null>(null);

    useEffect(() => {
        async function initConnection() {
            try {
                // Fetch server details
                const serverResponse = await fetch(`/api/servers/${serverId}`);
                const serverData = await serverResponse.json();

                if (!serverData.success) {
                    setError('Server not found');
                    setLoading(false);
                    return;
                }

                setServer(serverData.data.server);

                // Get connection token
                const tokenResponse = await fetch(`/api/connection/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        serverId,
                        protocol: 'ssh',
                    }),
                });

                const tokenData = await tokenResponse.json();

                if (!tokenData.success) {
                    setError('Failed to get connection token');
                    setLoading(false);
                    return;
                }

                setConnectionToken(tokenData.data.token);
                setLoading(false);
            } catch (err) {
                console.error('Connection error:', err);
                setError('Failed to initialize connection');
                setLoading(false);
            }
        }

        initConnection();
    }, [serverId]);

    const toggleFullscreen = async () => {
        if (!document.fullscreenElement) {
            await containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            await document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Detect mobile
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
                <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !connectionToken) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-8rem)]">
                <p className="text-red-400 mb-4">{error || 'Connection failed'}</p>
                <Link href="/dashboard" className="btn btn-primary">
                    Back to Dashboard
                </Link>
            </div>
        );
    }

    return (
        <div ref={containerRef} className="flex flex-col h-[calc(100vh-8rem)] lg:h-[calc(100vh-6rem)]">
            {/* Header */}
            <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <Link href="/dashboard" className="btn btn-ghost btn-icon">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="font-medium">{server?.name}</h1>
                        <span className="text-sm text-dark-400">SSH Terminal</span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => window.location.reload()}
                        className="btn btn-ghost btn-icon"
                        title="Reconnect"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={toggleFullscreen}
                        className="btn btn-ghost btn-icon hidden sm:flex"
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? (
                            <Minimize2 className="w-4 h-4" />
                        ) : (
                            <Maximize2 className="w-4 h-4" />
                        )}
                    </button>
                    {isMobile && (
                        <button
                            onClick={() => setShowKeyboard(!showKeyboard)}
                            className={`btn ${showKeyboard ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                        >
                            ⌨️
                        </button>
                    )}
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="btn btn-ghost btn-icon text-red-400 hover:text-red-300"
                        title="Disconnect"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Terminal */}
            <div className={`flex-1 min-h-0 ${showKeyboard ? 'pb-32' : ''}`}>
                <SSHTerminal
                    serverId={serverId}
                    connectionToken={connectionToken}
                    onDisconnect={() => {
                        // Could show reconnect dialog
                    }}
                    onError={(err) => {
                        console.error('Terminal error:', err);
                    }}
                />
            </div>

            {/* Mobile Keyboard */}
            {isMobile && showKeyboard && (
                <VirtualKeyboard
                    onKey={(key) => {
                        terminalKeyHandler.current?.(key);
                    }}
                />
            )}
        </div>
    );
}
