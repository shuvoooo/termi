/**
 * Guacamole Protocol Handler for RDP and VNC connections
 * 
 * This handler directly communicates with the guacd daemon using
 * the Guacamole protocol over TCP sockets.
 */

import { WebSocket } from 'ws';
import { Socket } from 'net';
import type { TokenPayload } from '../auth/token.js';

// Guacd connection settings
const GUACD_HOST = process.env.GUACD_HOST || 'localhost';
const GUACD_PORT = parseInt(process.env.GUACD_PORT || '4822', 10);

/**
 * Encode a Guacamole protocol instruction
 */
function encodeInstruction(opcode: string, ...args: string[]): string {
    const parts = [opcode, ...args];
    return parts.map(p => `${p.length}.${p}`).join(',') + ';';
}

/**
 * Parse a Guacamole protocol instruction
 */
function parseInstruction(data: string): { opcode: string; args: string[] } | null {
    const match = data.match(/^(\d+)\.([^,;]*)/);
    if (!match) return null;

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
}

export class GuacamoleHandler {
    private ws: WebSocket;
    private guacdSocket: Socket;
    private buffer: string = '';
    private closing = false;

    constructor(ws: WebSocket, payload: TokenPayload, protocol: 'rdp' | 'vnc') {
        this.ws = ws;
        this.guacdSocket = new Socket();

        this.setupSocket();
        this.setupWebSocket();
        this.connect(payload, protocol).catch(err => {
            console.error('[Guacamole] Connection init error:', err);
            this.sendError('Failed to initialize connection');
        });
    }

    private setupSocket() {
        this.guacdSocket.on('error', (err) => {
            console.error('[Guacamole] Socket error:', err.message);
            console.error('[Guacamole] Error details:', err);
            this.sendError(`Guacamole error: ${err.message}`);
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
        });

        this.guacdSocket.on('close', () => {
            console.log('[Guacamole] Connection closed');
            if (!this.closing && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'closed' }));
                this.ws.close();
            }
        });

        this.guacdSocket.on('data', (data) => {
            this.buffer += data.toString();

            // Process complete instructions
            while (this.buffer.includes(';')) {
                const endIndex = this.buffer.indexOf(';');
                const instruction = this.buffer.substring(0, endIndex + 1);
                this.buffer = this.buffer.substring(endIndex + 1);

                // Log first few instructions for debugging
                const parsed = parseInstruction(instruction);
                if (parsed && ['args', 'ready', 'error', 'size', 'png', 'jpeg'].includes(parsed.opcode)) {
                    console.log('[Guacamole] Instruction:', parsed.opcode, parsed.args.length > 0 ? `(${parsed.args.length} args)` : '');
                    if (parsed.opcode === 'error') {
                        console.error('[Guacamole] Error instruction from guacd:', parsed.args);
                    }
                }

                // Forward instruction to WebSocket
                if (this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(instruction);
                }
            }
        });
    }

    private setupWebSocket() {
        this.ws.on('message', (message) => {
            try {
                const data = message.toString();

                // Check if it's a Guacamole instruction (contains period-length prefix)
                if (data.match(/^\d+\./)) {
                    this.guacdSocket.write(data);
                } else {
                    // Try to parse as JSON
                    const parsed = JSON.parse(data);

                    if (parsed.type === 'ping') {
                        this.ws.send(JSON.stringify({ type: 'pong' }));
                    } else if (parsed.type === 'disconnect') {
                        this.guacdSocket.write(encodeInstruction('disconnect'));
                        this.guacdSocket.end();
                    }
                }
            } catch {
                // If not JSON, forward as raw Guacamole instruction
                this.guacdSocket.write(message.toString());
            }
        });

        this.ws.on('close', () => {
            console.log('[Guacamole] WebSocket closed');
            this.guacdSocket.end();
        });
    }

    private async connect(payload: TokenPayload, protocol: 'rdp' | 'vnc') {
        console.log(`[Guacamole] Starting ${protocol} connection to ${payload.host}:${payload.port}`);
        console.log(`[Guacamole] Connecting to guacd at ${GUACD_HOST}:${GUACD_PORT}`);

        try {
            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection to guacd timed out'));
                }, 10000);

                this.guacdSocket.connect(GUACD_PORT, GUACD_HOST, () => {
                    clearTimeout(timeout);
                    console.log('[Guacamole] Connected to guacd');
                    resolve();
                });

                this.guacdSocket.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
        } catch (err: any) {
            const errorMsg = `Failed to connect to guacd daemon at ${GUACD_HOST}:${GUACD_PORT}: ${err.message}`;
            console.error('[Guacamole]', errorMsg);
            this.sendError(errorMsg);
            this.ws.close();
            return;
        }

        // Send select instruction
        const guacProtocol = protocol === 'rdp' ? 'rdp' : 'vnc';
        console.log(`[Guacamole] Sending select instruction: ${guacProtocol}`);
        this.guacdSocket.write(encodeInstruction('select', guacProtocol));

        // Wait for args instruction and capture which args are expected
        let expectedArgs: string[];
        try {
            expectedArgs = await new Promise<string[]>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout waiting for args instruction from guacd'));
                }, 5000);

                const onData = (data: Buffer) => {
                    const instruction = parseInstruction(data.toString());
                    if (instruction?.opcode === 'args') {
                        clearTimeout(timeout);
                        this.guacdSocket.off('data', onData);
                        console.log('[Guacamole] guacd expects args:', instruction.args);
                        resolve(instruction.args);
                    } else if (instruction?.opcode === 'error') {
                        clearTimeout(timeout);
                        this.guacdSocket.off('data', onData);
                        reject(new Error(`guacd error: ${instruction.args.join(' ')}`));
                    }
                };
                this.guacdSocket.on('data', onData);
            });
        } catch (err: any) {
            const errorMsg = `Failed to get args from guacd: ${err.message}`;
            console.error('[Guacamole]', errorMsg);
            this.sendError(errorMsg);
            this.ws.close();
            return;
        }

        // Build connection args based on what guacd expects
        const connectionArgs: string[] = [];

        // Map of available parameter values
        const paramMap: Record<string, string> = {
            // Version (guacd 1.5.0+)
            'VERSION_1_5_0': 'VERSION_1_5_0',

            // Basic connection
            'hostname': payload.host,
            'port': String(payload.port || (protocol === 'rdp' ? 3389 : 5900)),
            'username': payload.username || '',
            'password': payload.password || '',
            'domain': '',
            'timeout': '',

            // Display settings
            'width': String(payload.displayWidth || 1024),
            'height': String(payload.displayHeight || 768),
            'dpi': '96',
            'color-depth': String(payload.colorDepth || 16),

            // Audio
            'disable-audio': 'true',
            'enable-audio-input': 'false',
            'console-audio': '',

            // Printing and file sharing
            'enable-printing': 'false',
            'printer-name': '',
            'enable-drive': 'false',
            'drive-name': '',
            'drive-path': '',
            'create-drive-path': 'false',
            'disable-download': '',
            'disable-upload': '',

            // RDP-specific settings
            'security': 'any',
            'ignore-cert': 'true',
            'cert-tofu': '',
            'cert-fingerprints': '',
            'disable-auth': '',
            'server-layout': '',
            'timezone': '',
            'console': '',
            'initial-program': '',
            'client-name': '',
            'preconnection-id': '',
            'preconnection-blob': '',
            'load-balance-info': '',

            // RemoteApp
            'remote-app': '',
            'remote-app-dir': '',
            'remote-app-args': '',

            // Performance optimization
            'enable-wallpaper': 'false',
            'enable-theming': 'false',
            'enable-font-smoothing': 'false',
            'enable-full-window-drag': 'false',
            'enable-desktop-composition': 'false',
            'enable-menu-animations': 'false',
            'disable-bitmap-caching': 'false',
            'disable-offscreen-caching': 'false',
            'disable-glyph-caching': 'false',
            'disable-gfx': '',

            // SFTP settings
            'enable-sftp': '',
            'sftp-hostname': '',
            'sftp-host-key': '',
            'sftp-port': '',
            'sftp-timeout': '',
            'sftp-username': '',
            'sftp-password': '',
            'sftp-private-key': '',
            'sftp-passphrase': '',
            'sftp-public-key': '',
            'sftp-directory': '',
            'sftp-root-directory': '',
            'sftp-server-alive-interval': '',
            'sftp-disable-download': '',
            'sftp-disable-upload': '',

            // Recording
            'recording-path': '',
            'recording-name': '',
            'recording-exclude-output': '',
            'recording-exclude-mouse': '',
            'recording-exclude-touch': '',
            'recording-include-keys': '',
            'create-recording-path': '',
            'recording-write-existing': '',

            // Other settings
            'static-channels': '',
            'resize-method': 'display-update',
            'enable-touch': '',
            'read-only': '',
            'disable-copy': '',
            'disable-paste': '',

            // Gateway settings
            'gateway-hostname': '',
            'gateway-port': '',
            'gateway-domain': '',
            'gateway-username': '',
            'gateway-password': '',

            // Wake-on-LAN
            'wol-send-packet': '',
            'wol-mac-addr': '',
            'wol-broadcast-addr': '',
            'wol-udp-port': '',
            'wol-wait-time': '',

            // Quality
            'force-lossless': '',
            'normalize-clipboard': '',
        };

        // Send args in the order guacd expects
        for (const arg of expectedArgs) {
            const value = paramMap[arg] || '';
            connectionArgs.push(value);
        }

        console.log('[Guacamole] Sending', connectionArgs.length, 'args to guacd');
        console.log('[Guacamole] Connection params:', {
            hostname: paramMap['hostname'],
            port: paramMap['port'],
            username: paramMap['username'] ? '***' : '(empty)',
            password: paramMap['password'] ? '***' : '(empty)',
            width: paramMap['width'],
            height: paramMap['height'],
            'color-depth': paramMap['color-depth'],
            'ignore-cert': paramMap['ignore-cert'],
            security: paramMap['security']
        });

        // Send connect instruction
        this.guacdSocket.write(encodeInstruction('connect', ...connectionArgs));

        this.ws.send(JSON.stringify({ type: 'connected' }));
    }

    private sendError(message: string): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'error',
                message,
            }));
        }
    }

    public close(): void {
        if (this.closing) {
            return;
        }
        this.closing = true;

        this.guacdSocket.end();
    }
}
