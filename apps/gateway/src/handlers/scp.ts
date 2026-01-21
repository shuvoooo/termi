/**
 * SCP File Transfer Handler
 * 
 * Proxies WebSocket messages for file upload/download via SCP.
 */

import { WebSocket } from 'ws';
import { Client, SFTPWrapper } from 'ssh2';
import { TokenPayload } from '../auth/token.js';

interface FileEntry {
    name: string;
    type: 'file' | 'directory';
    size: number;
    modified: Date;
    permissions: string;
}

export class SCPHandler {
    private ws: WebSocket;
    private ssh: Client;
    private sftp: SFTPWrapper | null = null;
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
        };

        if (token.privateKey) {
            config.privateKey = token.privateKey;
            if (token.passphrase) {
                config.passphrase = token.passphrase;
            }
        } else if (token.password) {
            config.password = token.password;
        }

        this.ssh.on('ready', () => {
            this.ssh.sftp((err, sftp) => {
                if (err) {
                    this.sendError('Failed to initialize SFTP: ' + err.message);
                    this.close();
                    return;
                }

                this.sftp = sftp;
                this.connected = true;

                this.ws.send(JSON.stringify({ type: 'sftp-ready' }));

                // List home directory by default
                this.listDirectory('/');
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

        this.ws.on('close', () => {
            this.close();
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.close();
        });
    }

    private handleMessage(message: {
        type: string;
        path?: string;
        data?: string;
        name?: string;
        newPath?: string;
        chunk?: number;
        totalChunks?: number;
    }): void {
        switch (message.type) {
            case 'list':
                if (message.path) {
                    this.listDirectory(message.path);
                }
                break;

            case 'download':
                if (message.path) {
                    this.downloadFile(message.path);
                }
                break;

            case 'upload':
                if (message.path && message.data) {
                    this.uploadFile(message.path, message.data, message.chunk, message.totalChunks);
                }
                break;

            case 'mkdir':
                if (message.path) {
                    this.createDirectory(message.path);
                }
                break;

            case 'delete':
                if (message.path) {
                    this.deleteFile(message.path);
                }
                break;

            case 'rename':
                if (message.path && message.newPath) {
                    this.renameFile(message.path, message.newPath);
                }
                break;

            case 'ping':
                this.ws.send(JSON.stringify({ type: 'pong' }));
                break;
        }
    }

    private async listDirectory(path: string): Promise<void> {
        if (!this.sftp) return;

        this.sftp.readdir(path, (err, list) => {
            if (err) {
                this.sendError('Failed to list directory: ' + err.message);
                return;
            }

            const files: FileEntry[] = list.map((item) => ({
                name: item.filename,
                type: item.attrs.isDirectory() ? 'directory' : 'file',
                size: item.attrs.size,
                modified: new Date(item.attrs.mtime * 1000),
                permissions: this.formatPermissions(item.attrs.mode),
            }));

            // Sort: directories first, then alphabetically
            files.sort((a, b) => {
                if (a.type !== b.type) {
                    return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
            });

            this.ws.send(JSON.stringify({
                type: 'list',
                path,
                files,
            }));
        });
    }

    private downloadFile(path: string): void {
        if (!this.sftp) return;

        // Get file stats first
        this.sftp.stat(path, (err, stats) => {
            if (err) {
                this.sendError('File not found: ' + err.message);
                return;
            }

            const stream = this.sftp!.createReadStream(path);
            const chunks: Buffer[] = [];
            let bytesRead = 0;

            stream.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
                bytesRead += chunk.length;

                // Send progress
                this.ws.send(JSON.stringify({
                    type: 'download-progress',
                    path,
                    bytesRead,
                    totalBytes: stats.size,
                }));
            });

            stream.on('end', () => {
                const data = Buffer.concat(chunks);

                this.ws.send(JSON.stringify({
                    type: 'download-complete',
                    path,
                    data: data.toString('base64'),
                    size: stats.size,
                }));
            });

            stream.on('error', (err: Error) => {
                this.sendError('Download failed: ' + err.message);
            });
        });
    }

    private uploadChunks = new Map<string, Buffer[]>();

    private uploadFile(
        path: string,
        data: string,
        chunk = 0,
        totalChunks = 1
    ): void {
        if (!this.sftp) return;

        const buffer = Buffer.from(data, 'base64');

        // Handle chunked uploads
        if (totalChunks > 1) {
            if (!this.uploadChunks.has(path)) {
                this.uploadChunks.set(path, []);
            }
            this.uploadChunks.get(path)![chunk] = buffer;

            // Check if all chunks received
            const chunks = this.uploadChunks.get(path)!;
            const receivedCount = chunks.filter((c) => c).length;

            if (receivedCount < totalChunks) {
                this.ws.send(JSON.stringify({
                    type: 'upload-progress',
                    path,
                    chunksReceived: receivedCount,
                    totalChunks,
                }));
                return;
            }

            // All chunks received, combine
            const fullData = Buffer.concat(chunks);
            this.uploadChunks.delete(path);
            this.writeFile(path, fullData);
        } else {
            this.writeFile(path, buffer);
        }
    }

    private writeFile(path: string, data: Buffer): void {
        if (!this.sftp) return;

        const stream = this.sftp.createWriteStream(path);

        stream.on('error', (err: Error) => {
            this.sendError('Upload failed: ' + err.message);
        });

        stream.on('close', () => {
            this.ws.send(JSON.stringify({
                type: 'upload-complete',
                path,
                size: data.length,
            }));
        });

        stream.end(data);
    }

    private createDirectory(path: string): void {
        if (!this.sftp) return;

        this.sftp.mkdir(path, (err) => {
            if (err) {
                this.sendError('Failed to create directory: ' + err.message);
                return;
            }

            this.ws.send(JSON.stringify({
                type: 'mkdir-complete',
                path,
            }));
        });
    }

    private deleteFile(path: string): void {
        if (!this.sftp) return;

        // Check if directory or file
        this.sftp.stat(path, (err, stats) => {
            if (err) {
                this.sendError('File not found: ' + err.message);
                return;
            }

            const deleteFunc = stats.isDirectory()
                ? this.sftp!.rmdir.bind(this.sftp)
                : this.sftp!.unlink.bind(this.sftp);

            deleteFunc(path, (err: any) => {
                if (err) {
                    this.sendError('Delete failed: ' + err.message);
                    return;
                }

                this.ws.send(JSON.stringify({
                    type: 'delete-complete',
                    path,
                }));
            });
        });
    }

    private renameFile(oldPath: string, newPath: string): void {
        if (!this.sftp) return;

        this.sftp.rename(oldPath, newPath, (err) => {
            if (err) {
                this.sendError('Rename failed: ' + err.message);
                return;
            }

            this.ws.send(JSON.stringify({
                type: 'rename-complete',
                oldPath,
                newPath,
            }));
        });
    }

    private formatPermissions(mode: number): string {
        const perms = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
        const owner = (mode >> 6) & 7;
        const group = (mode >> 3) & 7;
        const other = mode & 7;

        return perms[owner] + perms[group] + perms[other];
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

        if (this.sftp) {
            this.sftp.end();
            this.sftp = null;
        }

        if (this.ssh) {
            this.ssh.end();
        }

        this.connected = false;
        this.uploadChunks.clear();
    }

    public isConnected(): boolean {
        return this.connected;
    }
}
