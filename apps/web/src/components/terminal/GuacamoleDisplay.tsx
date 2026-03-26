'use client';
/**
 * GuacamoleDisplay - uses guacamole-common-js 1.6 officially.
 * GatewayTunnel bridges our custom gateway WS protocol to Guacamole.Tunnel.
 */
import { useEffect, useRef, useState } from 'react';
import { createGatewayTunnel } from './GatewayTunnel';
interface GuacamoleDisplayProps {
    serverId: string;
    connectionToken: string;
    protocol: 'rdp' | 'vnc';
    gatewayUrl?: string;
    onDisconnect?: () => void;
    onError?: (error: string) => void;
}
/** Guacamole.Client.State numeric values to human labels */
const CLIENT_STATE_LABELS: Record<number, string> = {
    0: 'idle',
    1: 'connecting',
    2: 'waiting',
    3: 'connected',
    4: 'disconnecting',
    5: 'disconnected',
};
export default function GuacamoleDisplay({
    serverId,
    connectionToken,
    protocol,
    gatewayUrl,
    onDisconnect,
    onError,
}: GuacamoleDisplayProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    // 0=IDLE 1=CONNECTING 2=WAITING 3=CONNECTED 4=DISCONNECTING 5=DISCONNECTED
    const [clientState, setClientState] = useState<number>(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const onDisconnectRef = useRef(onDisconnect);
    onDisconnectRef.current = onDisconnect;
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;
    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let guacClient: any = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let windowKeyboard: any = null;
        let resizeObserver: ResizeObserver | null = null;
        let displayEl: HTMLElement | null = null;
        // guacamole-common-js uses browser globals - must be loaded client-side
        import('guacamole-common-js').then((module) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Guacamole = (module as any).default ?? module;
            // Gateway tunnel
            const gatewayBase =
                gatewayUrl || process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:8080';
            const wsUrl = `${gatewayBase}/connect`;
            // Send display dimensions so guacd uses the actual container size
            const width  = container.clientWidth  || 1280;
            const height = container.clientHeight || 800;
            const connectData =
                `token=${encodeURIComponent(connectionToken)}` +
                `&protocol=${protocol}` +
                `&serverId=${encodeURIComponent(serverId)}` +
                `&width=${width}&height=${height}`;
            const tunnel = createGatewayTunnel(Guacamole, wsUrl);
            // Client
            guacClient = new Guacamole.Client(tunnel);
            // Display
            const display = guacClient.getDisplay();
            displayEl = display.getElement() as HTMLElement;
            displayEl.style.position = 'absolute';
            displayEl.style.top = '0';
            displayEl.style.left = '0';
            displayEl.style.overflow = 'hidden';
            displayEl.setAttribute('tabindex', '0');
            displayEl.style.outline = 'none';
            container.style.position = 'relative';
            container.appendChild(displayEl);
            // Scale display to fit container
            const fitDisplay = () => {
                const cw = container.clientWidth;
                const ch = container.clientHeight;
                const dw = display.getWidth();
                const dh = display.getHeight();
                if (dw > 0 && dh > 0 && cw > 0 && ch > 0) {
                    display.scale(Math.min(cw / dw, ch / dh));
                }
            };
            resizeObserver = new ResizeObserver(fitDisplay);
            resizeObserver.observe(container);
            display.onresize = fitDisplay;
            // Client state changes
            guacClient.onstatechange = (state: number) => {
                console.log(`[Guacamole] State -> ${CLIENT_STATE_LABELS[state] ?? state}`);
                setClientState(state);
                if (state === 3 /* CONNECTED */) {
                    fitDisplay();
                    displayEl?.focus();
                }
                if (state === 5 /* DISCONNECTED */) {
                    onDisconnectRef.current?.();
                }
            };
            // Error — Guacamole.Status has .code (number) and .message (string)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            guacClient.onerror = (status: any) => {
                const msg: string =
                    status?.message
                    ?? (status?.code != null ? `Remote desktop error (code 0x${status.code.toString(16).toUpperCase()})` : 'Unknown remote desktop error');
                console.error('[Guacamole] Client error:', msg, status);
                setErrorMsg(msg);
                onErrorRef.current?.(msg);
            };
            // Clipboard receive from remote
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            guacClient.onclipboard = (stream: any, mimetype: string) => {
                if (mimetype === 'text/plain') {
                    let b64 = '';
                    stream.onblob = (chunk: string) => { b64 += chunk; };
                    stream.onend = () => {
                        try { navigator.clipboard?.writeText(atob(b64)); } catch { /* ignore */ }
                    };
                }
            };
            // Mouse: legacy handler API receives Guacamole.Mouse.State directly
            const mouse = new Guacamole.Mouse(displayEl);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const forwardMouse = (state: any) => guacClient.sendMouseState(state, true);
            mouse.onmousedown = forwardMouse;
            mouse.onmouseup   = forwardMouse;
            mouse.onmousemove = forwardMouse;
            mouse.onmouseout  = forwardMouse;
            // Suppress context menu so right-click is forwarded
            displayEl.addEventListener('contextmenu', (e: Event) => e.preventDefault());
            // Keyboard on the display element
            const keyboard = new Guacamole.Keyboard(displayEl);
            keyboard.onkeydown = (keysym: number) => guacClient.sendKeyEvent(true, keysym);
            keyboard.onkeyup   = (keysym: number) => guacClient.sendKeyEvent(false, keysym);
            // Window-level keyboard fallback when display is not focused
            windowKeyboard = new Guacamole.Keyboard(window);
            windowKeyboard.onkeydown = (keysym: number) => {
                const a = document.activeElement;
                if (a === displayEl || a === document.body || a === null) {
                    guacClient.sendKeyEvent(true, keysym);
                }
            };
            windowKeyboard.onkeyup = (keysym: number) => {
                const a = document.activeElement;
                if (a === displayEl || a === document.body || a === null) {
                    guacClient.sendKeyEvent(false, keysym);
                }
            };
            // Connect
            guacClient.connect(connectData);
        });
        return () => {
            try { guacClient?.disconnect(); } catch { /* ignore */ }
            try { windowKeyboard?.reset?.(); } catch { /* ignore */ }
            resizeObserver?.disconnect();
            if (displayEl && displayEl.parentNode === container) {
                container.removeChild(displayEl);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serverId, connectionToken, protocol]);
    const isConnecting = clientState === 1 || clientState === 2;
    const isConnected  = clientState === 3;
    const label        = CLIENT_STATE_LABELS[clientState] ?? String(clientState);
    return (
        <div className="relative h-full w-full bg-black overflow-hidden">
            {/* Status badge */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2 pointer-events-none">
                <span
                    className={`w-2 h-2 rounded-full ${
                        isConnected
                            ? 'bg-green-500'
                            : isConnecting
                            ? 'bg-yellow-500 animate-pulse'
                            : 'bg-red-500'
                    }`}
                />
                <span className="text-xs text-gray-400 capitalize bg-black/50 px-2 py-1 rounded">
                    {label}
                </span>
            </div>
            {/* Guacamole display is mounted here via useEffect */}
            <div ref={containerRef} className="h-full w-full" />
            {/* Connecting overlay */}
            {isConnecting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20 pointer-events-none">
                    <div className="text-center">
                        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-white">
                            Connecting to {protocol.toUpperCase()}...
                        </p>
                    </div>
                </div>
            )}
            {/* Error overlay */}
            {errorMsg && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20 pointer-events-none">
                    <div className="text-center px-4">
                        <p className="text-red-400 text-sm font-medium mb-1">Connection Error</p>
                        <p className="text-gray-300 text-xs">{errorMsg}</p>
                    </div>
                </div>
            )}
            {/* Disconnected overlay */}
            {!errorMsg && (clientState === 4 || clientState === 5) && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/75 z-20 pointer-events-none">
                    <p className="text-gray-300 text-sm">Disconnected</p>
                </div>
            )}
        </div>
    );
}
