/**
 * SFTP Service
 *
 * Agentless file transfer via SSH2's SFTP subsystem.
 * All operations share a pooled SSH connection (via ssh-pool) so repeated
 * file-manager actions do not re-authenticate on every request.
 */

import { SFTPWrapper } from 'ssh2';
import { sshPool, SSHPoolConfig } from './ssh-pool';

// ============================================================================
// TYPES
// ============================================================================

export interface SFTPConfig extends SSHPoolConfig {}

export interface RemoteEntry {
    name: string;
    path: string;
    type: 'file' | 'dir' | 'symlink' | 'other';
    size: number;
    modifiedAt: number;
    permissions: string;
    mode: number;
}

// ============================================================================
// POOLED SFTP HELPER
// ============================================================================

/**
 * Acquire a pooled SSH connection, get (or reuse) the cached SFTP channel,
 * run `fn`, then release the connection back to the pool.
 *
 * The SFTP channel itself is shared across concurrent calls on the same
 * connection; ssh2 multiplexes requests internally via request IDs.
 */
async function withPooledSFTP<T>(
    config: SFTPConfig,
    fn: (sftp: SFTPWrapper) => Promise<T>,
): Promise<T> {
    const { sftp, key } = await sshPool.acquireSFTP(config);
    try {
        return await fn(sftp);
    } finally {
        sshPool.release(key);
    }
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
    return withPooledSFTP(config, (sftp) => new Promise((resolve, reject) => {
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
    }));
}

// ============================================================================
// MAKE DIRECTORY
// ============================================================================

export async function makeDirectory(config: SFTPConfig, dirPath: string): Promise<void> {
    return withPooledSFTP(config, (sftp) => new Promise<void>((resolve, reject) => {
        sftp.mkdir(dirPath, (err) => { err ? reject(err) : resolve(); });
    }));
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
    return withPooledSFTP(config, async (sftp) => {
        if (isDirectory) {
            await rmRecursive(sftp, entryPath);
        } else {
            await new Promise<void>((resolve, reject) =>
                sftp.unlink(entryPath, (err) => err ? reject(err) : resolve())
            );
        }
    });
}

// ============================================================================
// RENAME / MOVE
// ============================================================================

export async function renameEntry(config: SFTPConfig, oldPath: string, newPath: string): Promise<void> {
    return withPooledSFTP(config, (sftp) => new Promise<void>((resolve, reject) =>
        sftp.rename(oldPath, newPath, (err) => err ? reject(err) : resolve())
    ));
}

// ============================================================================
// DOWNLOAD (returns a Web ReadableStream — holds pool slot until stream ends)
// ============================================================================

export function createDownloadStream(config: SFTPConfig, filePath: string): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            sshPool.acquireSFTP(config)
                .then(({ sftp, key }) => {
                    const rs = sftp.createReadStream(filePath);
                    rs.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
                    rs.on('end', () => {
                        sshPool.release(key);
                        controller.close();
                    });
                    rs.on('error', (err: Error) => {
                        sshPool.release(key);
                        controller.error(err);
                    });
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
    toDir: string,
): Promise<TransferResult> {
    // Acquire two independent pool slots (may be the same connection if same server)
    const [fromAcq, toAcq] = await Promise.all([
        sshPool.acquireSFTP(from),
        sshPool.acquireSFTP(to),
    ]);

    const ok: string[] = [];
    const failed: { path: string; error: string }[] = [];

    try {
        for (const srcPath of fromPaths) {
            const fileName = srcPath.split('/').pop()!;
            const destPath = toDir.replace(/\/+$/, '') + '/' + fileName;
            try {
                await new Promise<void>((resolve, reject) => {
                    const rs = fromAcq.sftp.createReadStream(srcPath);
                    const ws = toAcq.sftp.createWriteStream(destPath);
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
        sshPool.release(fromAcq.key);
        sshPool.release(toAcq.key);
    }

    return { ok, failed };
}

// ============================================================================
// UPLOAD
// ============================================================================

export async function uploadBuffer(config: SFTPConfig, remotePath: string, data: Buffer): Promise<void> {
    return withPooledSFTP(config, (sftp) => new Promise<void>((resolve, reject) => {
        const ws = sftp.createWriteStream(remotePath);
        ws.on('close', resolve);
        ws.on('error', reject);
        ws.end(data);
    }));
}
