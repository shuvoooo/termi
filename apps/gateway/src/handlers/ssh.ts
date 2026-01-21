/**
 * SSH Connection Handler
 * 
 * Proxies WebSocket messages to an SSH connection using ssh2.
 */

import { WebSocket } from 'ws';
import { Client, ClientChannel } from 'ssh2';
import { TokenPayload } from '../auth/token.js';

export class SSHHandler {
    private ws: WebSocket;
    private ssh: Client;
    private stream: ClientChannel | null = null;
    private connected = false;
    private closing = false;

    constructor(ws: WebSocket, token: TokenPayload) {
        this.ws = ws;
        this.ssh = new Client();

        this.setupSSH(token);
        this.setupWebSocket();
    }

    private setupSSH(token: TokenPayload): void {
        const config: Parameters<Client['connect']>[0] = {
            host: token.host,
            port: token.port,
            username: token.username,
            readyTimeout: 10000,
            keepaliveInterval: 10000,
        };

        // Use password or private key
        if (token.privateKey) {
            config.privateKey = token.privateKey;
            if (token.passphrase) {
                config.passphrase = token.passphrase;
            }
        } else if (token.password) {
            config.password = token.password;
        }

        // SSH events
        this.ssh.on('ready', () => {
            this.connected = true;

            this.ssh.shell({
                term: 'xterm-256color',
                cols: 80,
                rows: 24,
            }, (err, stream) => {
                if (err) {
                    this.sendError('Failed to open shell: ' + err.message);
                    this.close();
                    return;
                }

                this.stream = stream;

                this.ws.send(JSON.stringify({ type: 'shell-ready' }));

                // Stream data to WebSocket
                stream.on('data', (data: Buffer) => {
                    if (this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            type: 'data',
                            data: data.toString('base64'),
                        }));
                    }
                });

                stream.on('close', () => {
                    this.ws.send(JSON.stringify({ type: 'closed' }));
                    this.close();
                });

                stream.stderr.on('data', (data: Buffer) => {
                    if (this.ws.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify({
                            type: 'data',
                            data: data.toString('base64'),
                        }));
                    }
                });
            });
        });

        this.ssh.on('error', (err) => {
            this.sendError('SSH error: ' + err.message);
            this.close();
        });

        this.ssh.on('close', () => {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'disconnected' }));
            }
        });

        // Connect
        try {
            this.ssh.connect(config);
        } catch (error) {
            this.sendError('Connection failed: ' + (error as Error).message);
            this.close();
        }
    }

    private setupWebSocket(): void {
        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                console.error('Invalid message:', error);
            }
        });
    }

    private handleMessage(message: { type: string; data?: string; cols?: number; rows?: number }): void {
        switch (message.type) {
            case 'data':
                // Terminal input from browser
                if (this.stream && message.data) {
                    const buffer = Buffer.from(message.data, 'base64');
                    this.stream.write(buffer);
                }
                break;

            case 'resize':
                // Terminal resize
                if (this.stream && message.cols && message.rows) {
                    this.stream.setWindow(message.rows, message.cols, 0, 0);
                }
                break;

            case 'ping':
                // Keep-alive ping
                this.ws.send(JSON.stringify({ type: 'pong' }));
                break;
        }
    }

    private sendError(message: string): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'error', message }));
        }
    }

    public close(): void {
        if (this.closing) {
            return;
        }
        this.closing = true;

        if (this.stream) {
            this.stream.end();
            this.stream = null;
        }

        if (this.ssh) {
            this.ssh.end();
        }

        this.connected = false;
    }

    public isConnected(): boolean {
        return this.connected;
    }
}
