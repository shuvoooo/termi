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
    X,
    Monitor,
} from 'lucide-react';

// Dynamically import GuacamoleDisplay to avoid SSR issues
const GuacamoleDisplay = dynamic(
    () => import('@/components/terminal/GuacamoleDisplay'),
    { ssr: false }
);

export default function VNCConnectionPage() {
    const params = useParams();
    const router = useRouter();
    const serverId = params.id as string;

    const [server, setServer] = useState<{ name: string } | null>(null);
    const [connectionToken, setConnectionToken] = useState<string | null>(null);
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);

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
                        protocol: 'vnc',
                    }),
                });

                const tokenData = await tokenResponse.json();

                if (!tokenData.success) {
                    setError('Failed to get connection token');
                    setLoading(false);
                    return;
                }

                setConnectionToken(tokenData.data.token);
                setGatewayUrl(tokenData.data.gatewayUrl ?? null);
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

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

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
                        <div className="flex items-center gap-2">
                            <Monitor className="w-5 h-5 text-orange-400" />
                            <h1 className="font-medium">{server?.name}</h1>
                        </div>
                        <span className="text-sm text-dark-400">Virtual Network Computing (VNC)</span>
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
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="btn btn-ghost btn-icon text-red-400 hover:text-red-300"
                        title="Disconnect"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Display */}
            <div className="flex-1 min-h-0 bg-dark-800 rounded-lg overflow-hidden">
                <GuacamoleDisplay
                    serverId={serverId}
                    connectionToken={connectionToken}
                    protocol="vnc"
                    gatewayUrl={gatewayUrl ?? undefined}
                    onDisconnect={() => {
                        console.log('VNC disconnected');
                    }}
                    onError={(err) => {
                        console.error('VNC error:', err);
                    }}
                />
            </div>

            {/* Info */}
            <div className="mt-4 text-xs text-dark-400 text-center">
                <p>Use your mouse and keyboard to interact with the VNC session.</p>
                <p className="mt-1">Right-click is supported. Press ESC to release focus.</p>
            </div>
        </div>
    );
}
