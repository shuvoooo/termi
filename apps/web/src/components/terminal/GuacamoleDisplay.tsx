'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface GuacamoleDisplayProps {
    serverId: string;
    connectionToken: string;
    protocol: 'rdp' | 'vnc';
    onDisconnect?: () => void;
    onError?: (error: string) => void;
}

export default function GuacamoleDisplay({
    serverId,
    connectionToken,
    protocol,
    onDisconnect,
    onError,
}: GuacamoleDisplayProps) {
    const displayRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const statusRef = useRef<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const layersRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const mouseStateRef = useRef({ x: 0, y: 0, buttonMask: 0 });

    const updateStatus = useCallback((newStatus: typeof status) => {
        statusRef.current = newStatus;
        setStatus(newStatus);
    }, []);

    // Parse Guacamole instruction
    const parseInstruction = useCallback((data: string): { opcode: string; args: string[] } | null => {
        const parts: string[] = [];
        let remaining = data;

        while (remaining.length > 0 && !remaining.startsWith(';')) {
            const lengthMatch = remaining.match(/^(\d+)\.([^,;]*)/);
            if (!lengthMatch) break;

            const length = parseInt(lengthMatch[1], 10);
            const value = remaining.substring(lengthMatch[1].length + 1, lengthMatch[1].length + 1 + length);
            parts.push(value);

            remaining = remaining.substring(lengthMatch[1].length + 1 + length);
            if (remaining.startsWith(',')) {
                remaining = remaining.substring(1);
            }
        }

        if (parts.length === 0) return null;

        return {
            opcode: parts[0],
            args: parts.slice(1),
        };
    }, []);

    // Encode Guacamole instruction
    const encodeInstruction = useCallback((opcode: string, ...args: string[]): string => {
        const parts = [opcode, ...args];
        return parts.map(p => `${p.length}.${p}`).join(',') + ';';
    }, []);

    // Handle Guacamole instructions
    const handleInstruction = useCallback((instruction: { opcode: string; args: string[] }) => {
        const { opcode, args } = instruction;

        // Log important instructions for debugging
        if (['ready', 'error', 'size', 'png', 'jpeg', 'img', 'blob'].includes(opcode)) {
            console.log('[Guacamole] Instruction:', opcode, args.length > 0 ? `(${args.length} args)` : '');
        }

        switch (opcode) {
            case 'sync':
                // Send sync response
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(encodeInstruction('sync', args[0]));
                }
                break;

            case 'size':
                // Layer size instruction
                const layerIndex = parseInt(args[0], 10);
                const width = parseInt(args[1], 10);
                const height = parseInt(args[2], 10);

                console.log(`[Guacamole] Size update: layer=${layerIndex}, ${width}x${height}`);

                if (layerIndex === 0 && canvasRef.current) {
                    canvasRef.current.width = width;
                    canvasRef.current.height = height;
                }
                break;

            case 'png':
            case 'jpeg':
            case 'webp':
                // Image data - Format: layer, channelMask, x, y, imageData
                const imgLayerIndex = parseInt(args[0], 10);
                // channelMask indicates which channels are included (not needed for basic rendering)
                // const channelMask = parseInt(args[1], 10);
                const imgX = parseInt(args[2], 10);
                const imgY = parseInt(args[3], 10);
                const imgData = args[4];

                const canvas = imgLayerIndex === 0 ? canvasRef.current : layersRef.current.get(imgLayerIndex);
                if (canvas && imgData) {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        const img = new Image();
                        img.onload = () => {
                            ctx.drawImage(img, imgX, imgY);
                        };
                        img.onerror = (e) => {
                            console.error('[Guacamole] Image load error:', e);
                        };
                        img.src = `data:image/${opcode};base64,${imgData}`;
                    }
                }
                break;

            case 'img':
                // Stream image data (blob follows)
                // Format: img,layer,channelmask,x,y
                // Just acknowledge for now
                break;

            case 'blob':
                // Binary blob data
                // This is handled differently - would need binary WebSocket support
                break;

            case 'copy':
                // Copy rectangle from one layer to another
                const srcLayer = parseInt(args[0], 10);
                const srcX = parseInt(args[1], 10);
                const srcY = parseInt(args[2], 10);
                const copyWidth = parseInt(args[3], 10);
                const copyHeight = parseInt(args[4], 10);
                const dstLayer = parseInt(args[5], 10);
                const dstX = parseInt(args[6], 10);
                const dstY = parseInt(args[7], 10);

                const srcCanvas = srcLayer === 0 ? canvasRef.current : layersRef.current.get(srcLayer);
                const dstCanvas = dstLayer === 0 ? canvasRef.current : layersRef.current.get(dstLayer);

                if (srcCanvas && dstCanvas) {
                    const srcCtx = srcCanvas.getContext('2d');
                    const dstCtx = dstCanvas.getContext('2d');
                    if (srcCtx && dstCtx) {
                        const imageData = srcCtx.getImageData(srcX, srcY, copyWidth, copyHeight);
                        dstCtx.putImageData(imageData, dstX, dstY);
                    }
                }
                break;

            case 'cursor':
                // Cursor image
                // TODO: Implement cursor handling
                break;

            case 'ready':
                console.log('[Guacamole] Connection ready!');
                updateStatus('connected');
                break;

            case 'error':
                const errorMsg = args[0] || 'Connection error';
                console.error('[Guacamole] Error:', errorMsg);
                updateStatus('error');
                onError?.(errorMsg);
                break;

            case 'disconnect':
                console.log('[Guacamole] Disconnected');
                updateStatus('disconnected');
                onDisconnect?.();
                break;

            case 'name':
                // Connection name
                console.log('[Guacamole] Connection name:', args[0]);
                break;

            case 'args':
                // Arguments request (usually handled on server)
                break;

            default:
                // Log unknown instructions
                if (opcode && !['nop', 'mouse', 'key'].includes(opcode)) {
                    console.log('[Guacamole] Unhandled instruction:', opcode);
                }
        }
    }, [encodeInstruction, updateStatus, onError, onDisconnect]);

    // Connect to gateway
    const connect = useCallback(() => {
        const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'ws://localhost:8080';
        const wsUrl = `${gatewayUrl}/connect?token=${connectionToken}&protocol=${protocol}&serverId=${serverId}`;

        console.log('[Guacamole] Connecting to:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        let buffer = '';

        ws.onopen = () => {
            console.log(`[Guacamole] ${protocol.toUpperCase()} WebSocket connected`);
        };

        ws.onmessage = (event) => {
            const data = event.data;

            // Check if it's JSON (control message)
            try {
                const message = JSON.parse(data);

                console.log('[Guacamole] Control message:', message);

                switch (message.type) {
                    case 'connected':
                        console.log('[Guacamole] Gateway connected, waiting for ready...');
                        updateStatus('connecting');
                        break;
                    case 'closed':
                    case 'disconnected':
                        console.log('[Guacamole] Connection closed');
                        updateStatus('disconnected');
                        onDisconnect?.();
                        break;
                    case 'error':
                        console.error('[Guacamole] Server error:', message.message);
                        updateStatus('error');
                        onError?.(message.message);
                        break;
                }
                return;
            } catch {
                // Not JSON, must be Guacamole instruction
            }

            // Handle Guacamole protocol instructions
            buffer += data;

            while (buffer.includes(';')) {
                const endIndex = buffer.indexOf(';');
                const instructionStr = buffer.substring(0, endIndex + 1);
                buffer = buffer.substring(endIndex + 1);

                const instruction = parseInstruction(instructionStr);
                if (instruction) {
                    handleInstruction(instruction);
                } else {
                    console.warn('[Guacamole] Failed to parse instruction:', instructionStr.substring(0, 50));
                }
            }
        };

        ws.onclose = (event) => {
            console.log('[Guacamole] WebSocket closed:', event.code, event.reason);
            if (statusRef.current !== 'disconnected' && statusRef.current !== 'error') {
                updateStatus('disconnected');
            }
        };

        ws.onerror = (event) => {
            console.error('[Guacamole] WebSocket error:', event);
            updateStatus('error');
            onError?.('WebSocket connection failed');
        };
    }, [serverId, connectionToken, protocol, onDisconnect, onError, updateStatus, parseInstruction, handleInstruction]);

    // Send mouse event
    const sendMouse = useCallback((x: number, y: number, buttonMask: number) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(encodeInstruction('mouse', String(x), String(y), String(buttonMask)));
        }
    }, [encodeInstruction]);

    // Send key event
    const sendKey = useCallback((keysym: number, pressed: boolean) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(encodeInstruction('key', String(keysym), pressed ? '1' : '0'));
        }
    }, [encodeInstruction]);

    useEffect(() => {
        if (!displayRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;

        // Initialize canvas with default size
        canvas.width = 1024;
        canvas.height = 768;

        // Draw a test pattern to verify canvas is working
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#333';
            ctx.font = '16px monospace';
            ctx.fillText('Connecting to remote desktop...', 20, 40);
        }

        console.log('[Guacamole] Canvas initialized:', canvas.width, 'x', canvas.height);

        // Mouse event handlers
        const handleMouseMove = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
            const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));

            mouseStateRef.current.x = x;
            mouseStateRef.current.y = y;
            sendMouse(x, y, mouseStateRef.current.buttonMask);
        };

        const handleMouseDown = (e: MouseEvent) => {
            e.preventDefault();
            let buttonMask = mouseStateRef.current.buttonMask;

            if (e.button === 0) buttonMask |= 1;      // Left
            else if (e.button === 1) buttonMask |= 4; // Middle
            else if (e.button === 2) buttonMask |= 2; // Right

            mouseStateRef.current.buttonMask = buttonMask;
            sendMouse(mouseStateRef.current.x, mouseStateRef.current.y, buttonMask);
        };

        const handleMouseUp = (e: MouseEvent) => {
            e.preventDefault();
            let buttonMask = mouseStateRef.current.buttonMask;

            if (e.button === 0) buttonMask &= ~1;      // Left
            else if (e.button === 1) buttonMask &= ~4; // Middle
            else if (e.button === 2) buttonMask &= ~2; // Right

            mouseStateRef.current.buttonMask = buttonMask;
            sendMouse(mouseStateRef.current.x, mouseStateRef.current.y, buttonMask);
        };

        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            return false;
        };

        // Keyboard event handlers
        const handleKeyDown = (e: KeyboardEvent) => {
            e.preventDefault();
            const keysym = getKeysym(e);
            if (keysym) sendKey(keysym, true);
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            e.preventDefault();
            const keysym = getKeysym(e);
            if (keysym) sendKey(keysym, false);
        };

        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        // Connect
        connect();

        // Cleanup
        return () => {
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            wsRef.current?.close();
        };
    }, [connect, sendMouse, sendKey]);

    // Send ping every 30 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="relative h-full w-full bg-black">
            {/* Status indicator */}
            <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                <span
                    className={`w-2 h-2 rounded-full ${
                        status === 'connected'
                            ? 'bg-green-500'
                            : status === 'connecting'
                            ? 'bg-yellow-500 animate-pulse'
                            : 'bg-red-500'
                    }`}
                />
                <span className="text-xs text-gray-400 capitalize bg-black bg-opacity-50 px-2 py-1 rounded">
                    {status}
                </span>
            </div>

            {/* Display canvas */}
            <div
                ref={displayRef}
                className="h-full w-full flex items-center justify-center overflow-auto bg-dark-900"
            >
                <canvas
                    ref={canvasRef}
                    className="max-w-full max-h-full border border-dark-700"
                    style={{ imageRendering: 'auto', display: 'block' }}
                />
            </div>

            {/* Loading overlay */}
            {status === 'connecting' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-75">
                    <div className="text-center">
                        <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                        <p className="text-white">Connecting to {protocol.toUpperCase()}...</p>
                    </div>
                </div>
            )}
        </div>
    );
}

// Convert keyboard event to X11 keysym
function getKeysym(e: KeyboardEvent): number | null {
    const key = e.key;
    const code = e.code;

    // Control keys
    if (key === 'Backspace') return 0xff08;
    if (key === 'Tab') return 0xff09;
    if (key === 'Enter') return 0xff0d;
    if (key === 'Escape') return 0xff1b;
    if (key === 'Delete') return 0xffff;
    if (key === 'Home') return 0xff50;
    if (key === 'End') return 0xff57;
    if (key === 'PageUp') return 0xff55;
    if (key === 'PageDown') return 0xff56;
    if (key === 'ArrowLeft') return 0xff51;
    if (key === 'ArrowUp') return 0xff52;
    if (key === 'ArrowRight') return 0xff53;
    if (key === 'ArrowDown') return 0xff54;

    // Function keys
    if (code.startsWith('F') && code.length <= 3) {
        const fNum = parseInt(code.substring(1), 10);
        if (fNum >= 1 && fNum <= 12) {
            return 0xffbe + fNum - 1;
        }
    }

    // Modifier keys
    if (key === 'Shift') return 0xffe1;
    if (key === 'Control') return 0xffe3;
    if (key === 'Alt') return 0xffe9;
    if (key === 'Meta') return 0xffe7;

    // Printable characters
    if (key.length === 1) {
        return key.charCodeAt(0);
    }

    return null;
}
