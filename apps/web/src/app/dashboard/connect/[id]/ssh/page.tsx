'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
    ArrowLeft,
    Maximize2,
    Minimize2,
    RotateCcw,
    FolderOpen,
    X,
    KeyRound,
    Keyboard,
} from 'lucide-react';
import FileManagerPanel from '@/components/scp/FileManagerPanel';
import type { RevealField } from '@/components/auth/PasskeyRevealModal';

const PasskeyRevealModal = dynamic(
    () => import('@/components/auth/PasskeyRevealModal'),
    { ssr: false }
);

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

    const [server, setServer] = useState<{ name: string; hasPassword?: boolean } | null>(null);
    const [revealField, setRevealField] = useState<RevealField | null>(null);
    const [connectionToken, setConnectionToken] = useState<string | null>(null);
    const [gatewayUrl, setGatewayUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [showFiles, setShowFiles] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const terminalKeyHandler = useRef<((key: string) => void) | null>(null);

    const handleDisconnect = useCallback(() => {}, []);
    const handleError = useCallback((err: string) => {
        console.error('Terminal error:', err);
    }, []);

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    useEffect(() => {
        async function initConnection() {
            try {
                const serverResponse = await fetch(`/api/servers/${serverId}`);
                const serverData = await serverResponse.json();

                if (!serverData.success) {
                    setError('Server not found');
                    setLoading(false);
                    return;
                }

                setServer(serverData.data.server);

                const tokenResponse = await fetch(`/api/connection/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ serverId, protocol: 'ssh' }),
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

    // keyboard is ~120px tall (2 key rows + padding); shrink container so xterm reflows above it
    const kbHeight = 120;

    return (
        <div
            ref={containerRef}
            className="flex flex-col lg:h-[calc(100vh-6rem)]"
            style={{
                height: isMobile && showKeyboard
                    ? `calc(100dvh - 8rem - ${kbHeight}px)`
                    : 'calc(100dvh - 8rem)',
            }}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <Link href="/dashboard" className="btn btn-ghost btn-icon shrink-0">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="min-w-0">
                        <h1 className="font-medium truncate">{server?.name}</h1>
                        <span className="text-sm text-dark-400">SSH Terminal</span>
                    </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Copy password */}
                    {server?.hasPassword && (
                        <button
                            onClick={() => setRevealField('password')}
                            className="btn btn-ghost btn-icon"
                            title="Copy password (passkey required)"
                        >
                            <KeyRound className="w-4 h-4" />
                        </button>
                    )}

                    {/* Files toggle */}
                    <button
                        onClick={() => setShowFiles(f => !f)}
                        className={`btn btn-sm gap-1.5 ${showFiles ? 'btn-primary' : 'btn-ghost'}`}
                        title={showFiles ? 'Hide file manager' : 'Open file manager'}
                    >
                        <FolderOpen className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Files</span>
                    </button>

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
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>

                    {isMobile && (
                        <button
                            onClick={() => setShowKeyboard(!showKeyboard)}
                            className={`btn btn-icon ${showKeyboard ? 'btn-primary' : 'btn-ghost'}`}
                            title={showKeyboard ? 'Hide keyboard' : 'Show keyboard'}
                        >
                            <Keyboard className="w-4 h-4" />
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

            {/* ── Main area: terminal + optional file panel ── */}
            <div className="flex flex-1 min-h-0 gap-3">
                {/* Terminal */}
                <div className="flex-1 min-w-0 min-h-0">
                    <SSHTerminal
                        serverId={serverId}
                        connectionToken={connectionToken}
                        gatewayUrl={gatewayUrl ?? undefined}
                        onDisconnect={handleDisconnect}
                        onError={handleError}
                        onKeyHandlerReady={(handler) => { terminalKeyHandler.current = handler; }}
                    />
                </div>

                {/* File manager panel — desktop: side panel | mobile: full overlay */}
                {showFiles && (
                    <>
                        {/* Desktop side panel */}
                        <div className="hidden md:flex w-80 lg:w-96 shrink-0 flex-col rounded-xl border border-slate-700 overflow-hidden">
                            <FileManagerPanel
                                serverId={serverId}
                                onClose={() => setShowFiles(false)}
                            />
                        </div>

                        {/* Mobile full overlay */}
                        <div className="md:hidden absolute inset-0 z-20 rounded-xl overflow-hidden border border-slate-700">
                            <FileManagerPanel
                                serverId={serverId}
                                onClose={() => setShowFiles(false)}
                            />
                        </div>
                    </>
                )}
            </div>

            {/* Mobile keyboard */}
            {isMobile && showKeyboard && (
                <VirtualKeyboard onKey={(key) => { terminalKeyHandler.current?.(key); }} />
            )}

            {/* Passkey credential reveal */}
            {revealField && server && (
                <PasskeyRevealModal
                    serverId={serverId}
                    serverName={server.name}
                    field={revealField}
                    onClose={() => setRevealField(null)}
                />
            )}
        </div>
    );
}
