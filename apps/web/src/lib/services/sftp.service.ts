/**
 * SFTP Service
 *
 * Agentless file transfer via SSH2's SFTP subsystem.
 * Each exported function opens a fresh connection, performs the operation,
 * and closes the connection — no persistent state.
 */

import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';

// ============================================================================
// TYPES
// ============================================================================

export interface SFTPConfig {
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

export interface RemoteEntry {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'symlink' | 'other';
    size: number;
    modifiedAt: number; // unix timestamp (seconds)
    permissions: string; // e.g. "drwxr-xr-x"
    mode: number;
}

// ============================================================================
// CONNECTION
// ============================================================================

interface OpenedSFTP {
    sftp: SFTPWrapper;
    client: Client;
}

function openSFTP(config: SFTPConfig, timeoutMs = 15000): Promise<OpenedSFTP> {
    return new Promise((resolve, reject) => {
        const client = new Client();

        const timer = setTimeout(() => {
            client.destroy();
            reject(new Error('SSH connection timed out'));
        }, timeoutMs);

        client.on('ready', () => {
            client.sftp((err, sftp) => {
                clearTimeout(timer);
                if (err) { client.end(); reject(err); return; }
                resolve({ sftp, client });
            });
        });

        client.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        // Many servers (Ubuntu/Debian default sshd) advertise keyboard-interactive
        // instead of plain password auth. Handling this event makes the password
        // work transparently regardless of which method the server prefers.
        if (config.password) {
            client.on('keyboard-interactive', (_name, _instructions, _lang, _prompts, finish) => {
                finish([config.password!]);
            });
        }

        const cc: ConnectConfig = {
            host: config.host,
            port: config.port,
            username: config.username,
            readyTimeout: timeoutMs,
        };

        // Set key auth if private key is present (non-empty string)
        if (config.privateKey?.trim()) {
            cc.privateKey = config.privateKey;
            if (config.passphrase?.trim()) cc.passphrase = config.passphrase;
        }

        // Set password auth if password is present.
        // Also enable tryKeyboard so ssh2 attempts keyboard-interactive,
        // which is handled by the event listener above.
        if (config.password?.trim()) {
            cc.password = config.password;
            cc.tryKeyboard = true;
        }

        client.connect(cc);
    });
}

// ============================================================================
// HELPERS
// ============================================================================

function entryType(mode: number): RemoteEntry['type'] {
    const t = mode & 0o170000;
    if (t === 0o040000) return 'dir';
    if (t === 0o120000) return 'symlink';
    if (t === 0o100000) return 'file';
    return 'other';
}

function modeToPermissions(mode: number): string {
    const typeChar: Record<number, string> = {
        0o140000: 's', 0o120000: 'l', 0o100000: '-',
        0o060000: 'b', 0o040000: 'd', 0o020000: 'c', 0o010000: 'p',
    };
    const t = typeChar[mode & 0o170000] ?? '-';
    const bits = 'rwxrwxrwx';
    const p = bits.split('').map((c, i) => (mode & (1 << (8 - i))) ? c : '-').join('');
    return t + p;
}

function joinPath(...parts: string[]): string {
    return parts.join('/').replace(/\/+/g, '/').replace(/(.)\/$/, '$1') || '/';
}

// ============================================================================
// LIST DIRECTORY
// ============================================================================

export async function listDirectory(config: SFTPConfig, dirPath: string): Promise<RemoteEntry[]> {
    const { sftp, client } = await openSFTP(config);
    try {
        return await new Promise((resolve, reject) => {
            sftp.readdir(dirPath, (err, list) => {
                if (err) { reject(err); return; }
                const entries: RemoteEntry[] = list
                    .filter(e => e.filename !== '.' && e.filename !== '..')
                    .map(e => ({
                        name: e.filename,
                        path: joinPath(dirPath, e.filename),
                        type: entryType(e.attrs.mode ?? 0),
                        size: e.attrs.size ?? 0,
                        modifiedAt: e.attrs.mtime ?? 0,
                        permissions: modeToPermissions(e.attrs.mode ?? 0),
                        mode: e.attrs.mode ?? 0,
                    }))
                    .sort((a, b) => {
                        if (a.type === 'dir' && b.type !== 'dir') return -1;
                        if (a.type !== 'dir' && b.type === 'dir') return 1;
                        return a.name.localeCompare(b.name);
                    });
                resolve(entries);
            });
        });
    } finally {
        client.end();
    }
}

// ============================================================================
// MAKE DIRECTORY
// ============================================================================

export async function makeDirectory(config: SFTPConfig, dirPath: string): Promise<void> {
    const { sftp, client } = await openSFTP(config);
    try {
        await new Promise<void>((resolve, reject) => {
            sftp.mkdir(dirPath, (err) => { err ? reject(err) : resolve(); });
        });
    } finally {
        client.end();
    }
}

// ============================================================================
// DELETE (file or directory — directory is recursive)
// ============================================================================

async function rmRecursive(sftp: SFTPWrapper, dirPath: string): Promise<void> {
    const entries = await new Promise<Array<{ filename: string; attrs: { mode?: number } }>>(
        (resolve, reject) => sftp.readdir(dirPath, (err, list) => err ? reject(err) : resolve(list))
    );

    for (const entry of entries) {
        if (entry.filename === '.' || entry.filename === '..') continue;
        const child = joinPath(dirPath, entry.filename);
        if (entryType(entry.attrs.mode ?? 0) === 'dir') {
            await rmRecursive(sftp, child);
        } else {
            await new Promise<void>((resolve, reject) =>
                sftp.unlink(child, (err) => err ? reject(err) : resolve())
            );
        }
    }

    await new Promise<void>((resolve, reject) =>
        sftp.rmdir(dirPath, (err) => err ? reject(err) : resolve())
    );
}

export async function deleteEntry(config: SFTPConfig, entryPath: string, isDirectory: boolean): Promise<void> {
    const { sftp, client } = await openSFTP(config);
    try {
        if (isDirectory) {
            await rmRecursive(sftp, entryPath);
        } else {
            await new Promise<void>((resolve, reject) =>
                sftp.unlink(entryPath, (err) => err ? reject(err) : resolve())
            );
        }
    } finally {
        client.end();
    }
}

// ============================================================================
// RENAME / MOVE
// ============================================================================

export async function renameEntry(config: SFTPConfig, oldPath: string, newPath: string): Promise<void> {
    const { sftp, client } = await openSFTP(config);
    try {
        await new Promise<void>((resolve, reject) =>
            sftp.rename(oldPath, newPath, (err) => err ? reject(err) : resolve())
        );
    } finally {
        client.end();
    }
}

// ============================================================================
// DOWNLOAD (returns a Web ReadableStream — keep SSH open while streaming)
// ============================================================================

export function createDownloadStream(config: SFTPConfig, filePath: string): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            openSFTP(config)
                .then(({ sftp, client }) => {
                    const rs = sftp.createReadStream(filePath);
                    rs.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
                    rs.on('end', () => { client.end(); controller.close(); });
                    rs.on('error', (err: Error) => { client.end(); controller.error(err); });
                })
                .catch((err) => controller.error(err));
        },
    });
}

// ============================================================================
// SERVER-TO-SERVER TRANSFER (pipes directly between two SFTP connections)
// ============================================================================

export interface TransferResult {
    ok: string[];
    failed: { path: string; error: string }[];
}

export async function transferFiles(
    from: SFTPConfig,
    fromPaths: string[],
    to: SFTPConfig,
    toDir: string
): Promise<TransferResult> {
    const [fromConn, toConn] = await Promise.all([openSFTP(from), openSFTP(to)]);
    const ok: string[] = [];
    const failed: { path: string; error: string }[] = [];

    try {
        for (const srcPath of fromPaths) {
            const fileName = srcPath.split('/').pop()!;
            const destPath = toDir.replace(/\/+$/, '') + '/' + fileName;
            try {
                await new Promise<void>((resolve, reject) => {
                    const rs = fromConn.sftp.createReadStream(srcPath);
                    const ws = toConn.sftp.createWriteStream(destPath);
                    rs.on('error', reject);
                    ws.on('error', reject);
                    ws.on('close', resolve);
                    rs.pipe(ws as NodeJS.WritableStream);
                });
                ok.push(srcPath);
            } catch (err) {
                failed.push({
                    path: srcPath,
                    error: err instanceof Error ? err.message : 'Transfer failed',
                });
            }
        }
    } finally {
        fromConn.client.end();
        toConn.client.end();
    }

    return { ok, failed };
}

// ============================================================================
// UPLOAD
// ============================================================================

export async function uploadBuffer(config: SFTPConfig, remotePath: string, data: Buffer): Promise<void> {
    const { sftp, client } = await openSFTP(config);
    try {
        await new Promise<void>((resolve, reject) => {
            const ws = sftp.createWriteStream(remotePath);
            ws.on('close', resolve);
            ws.on('error', reject);
            ws.end(data);
        });
    } finally {
        client.end();
    }
}
