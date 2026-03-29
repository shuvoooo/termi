/**
 * SSH Connection Pool
 *
 * Maintains a map of live SSH2 client connections keyed by server ID.
 * Connections are authenticated once, kept alive with SSH keepalives, and
 * shared across metrics fetches, SFTP operations, and monitoring checks.
 *
 * Lifecycle
 * ─────────
 *  acquire(cfg)  – Returns an existing ready connection or opens a new one.
 *                  Parallel callers for the same key share a single connect
 *                  attempt (connect-coalescing).
 *  release(key)  – Signals the caller is done. When refCount reaches 0 an
 *                  idle timer starts; the connection is destroyed after
 *                  IDLE_TTL_MS of inactivity.
 *  destroy(key)  – Force-removes and ends a connection (e.g. on auth error).
 *
 * Isolation
 * ─────────
 * Always pass cfg.id = serverId so two servers that happen to share the same
 * host/port/username get separate pool entries.
 *
 * Persistence across hot reloads
 * ──────────────────────────────
 * The singleton is stored on globalThis so Next.js dev-mode module reloads
 * reuse the same pool instead of leaking connections.
 */

import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';

// ─── Tuning constants ─────────────────────────────────────────────────────────

const IDLE_TTL_MS     = 5 * 60_000;   // destroy connection after 5 min idle
const CONNECT_TIMEOUT = 15_000;        // maximum time to establish SSH connection
const KEEPALIVE_MS    = 20_000;        // send SSH keepalive every 20 s
const KEEPALIVE_MAX   = 3;             // give up after 3 missed keepalives (~60 s)

// ─── Public config type ───────────────────────────────────────────────────────

export interface SSHPoolConfig {
    /**
     * Stable discriminator used as pool key.
     * Pass the database serverId for proper per-server isolation.
     * Falls back to "username@host:port" when omitted.
     */
    id?: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface PoolEntry {
    client: Client;
    ready: boolean;
    /** Number of active callers using this connection right now. */
    refCount: number;
    /** Pending idle-destroy timer (active when refCount === 0). */
    idleTimer: ReturnType<typeof setTimeout> | null;
    lastUsed: number;
    /**
     * Cached SFTP subsystem channel for this connection.
     * ssh2 allows many concurrent SFTP requests on one channel via request IDs.
     * We open one channel per connection and reuse it.
     */
    sftp: SFTPWrapper | null;
    sftpPending: Promise<SFTPWrapper> | null;
}

// ─── Pool implementation ──────────────────────────────────────────────────────

export class SSHConnectionPool {
    private entries = new Map<string, PoolEntry>();
    /** Coalesces parallel first-connect attempts for the same key. */
    private connecting = new Map<string, Promise<Client>>();

    // ── Key ────────────────────────────────────────────────────────────────

    static makeKey(cfg: SSHPoolConfig): string {
        return cfg.id ?? `${cfg.username}@${cfg.host}:${cfg.port}`;
    }

    // ── acquire ────────────────────────────────────────────────────────────

    async acquire(cfg: SSHPoolConfig): Promise<{ client: Client; key: string }> {
        const key = SSHConnectionPool.makeKey(cfg);

        // Fast-path: reuse existing ready connection
        const existing = this.entries.get(key);
        if (existing?.ready) {
            existing.refCount++;
            existing.lastUsed = Date.now();
            this.cancelIdle(existing);
            return { client: existing.client, key };
        }

        // Coalesce: wait for any in-progress connect to the same key
        const inFlight = this.connecting.get(key);
        if (inFlight) {
            await inFlight.catch(() => null); // ignore – we'll check entry below
            const e = this.entries.get(key);
            if (e?.ready) {
                e.refCount++;
                e.lastUsed = Date.now();
                this.cancelIdle(e);
                return { client: e.client, key };
            }
            // The in-flight connection failed – fall through to retry
        }

        // Create a brand-new connection
        const connectPromise = this.openConnection(key, cfg);
        this.connecting.set(key, connectPromise);

        try {
            const client = await connectPromise;
            const e = this.entries.get(key);
            if (e) {
                e.refCount++;
                e.lastUsed = Date.now();
                this.cancelIdle(e);
            }
            return { client, key };
        } finally {
            this.connecting.delete(key);
        }
    }

    // ── release ────────────────────────────────────────────────────────────

    release(key: string): void {
        const e = this.entries.get(key);
        if (!e) return;
        e.refCount = Math.max(0, e.refCount - 1);
        e.lastUsed = Date.now();
        if (e.refCount === 0) {
            this.scheduleIdle(key, e);
        }
    }

    // ── acquireSFTP ────────────────────────────────────────────────────────
    /**
     * Acquire a pooled SSH client AND obtain (or reuse) a single shared SFTP
     * subsystem channel on that connection. Multiple concurrent SFTP operations
     * are multiplexed over that one channel via ssh2's internal request IDs.
     */
    async acquireSFTP(cfg: SSHPoolConfig): Promise<{ sftp: SFTPWrapper; key: string }> {
        const { client, key } = await this.acquire(cfg);
        const entry = this.entries.get(key);

        if (!entry) {
            // Shouldn't happen, but be defensive
            this.release(key);
            throw new Error(`Pool entry for ${key} disappeared after acquire`);
        }

        // Return cached SFTP channel if still healthy
        if (entry.sftp) {
            return { sftp: entry.sftp, key };
        }

        // Coalesce parallel SFTP-open requests
        if (!entry.sftpPending) {
            entry.sftpPending = new Promise<SFTPWrapper>((resolve, reject) => {
                client.sftp((err, sftp) => {
                    entry.sftpPending = null;
                    if (err) {
                        reject(err);
                        return;
                    }
                    entry.sftp = sftp;
                    // Reset cache when the SFTP channel closes
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (sftp as any).on?.('close', () => {
                        if (entry.sftp === sftp) entry.sftp = null;
                    });
                    resolve(sftp);
                });
            });
        }

        const sftp = await entry.sftpPending;
        return { sftp, key };
    }

    // ── destroy ────────────────────────────────────────────────────────────
    /** Force-remove a connection (permanent auth failure, etc.) */
    destroy(key: string): void {
        const e = this.entries.get(key);
        if (!e) return;
        this.cancelIdle(e);
        e.ready = false;
        e.sftp  = null;
        this.entries.delete(key);
        try { e.client.end(); } catch { /* already gone */ }
    }

    // ── stats ──────────────────────────────────────────────────────────────
    get size(): number { return this.entries.size; }

    // ── internal helpers ───────────────────────────────────────────────────

    private openConnection(key: string, cfg: SSHPoolConfig): Promise<Client> {
        return new Promise<Client>((resolve, reject) => {
            const client = new Client();

            client.once('ready', () => {
                this.entries.set(key, {
                    client,
                    ready: true,
                    refCount: 0,
                    idleTimer: null,
                    lastUsed: Date.now(),
                    sftp: null,
                    sftpPending: null,
                });
                resolve(client);
            });

            client.on('error', (err) => {
                const e = this.entries.get(key);
                if (e?.client === client) {
                    this.cancelIdle(e);
                    this.entries.delete(key);
                }
                // reject() is a no-op after the first call
                reject(err);
            });

            client.on('close', () => {
                const e = this.entries.get(key);
                if (e?.client === client) {
                    this.cancelIdle(e);
                    e.ready = false;
                    e.sftp  = null;
                    this.entries.delete(key);
                }
            });

            if (cfg.password) {
                client.on('keyboard-interactive', (_n, _i, _l, _p, finish) => {
                    finish([cfg.password!]);
                });
            }

            const cc: ConnectConfig = {
                host:             cfg.host,
                port:             cfg.port,
                username:         cfg.username,
                readyTimeout:     CONNECT_TIMEOUT,
                keepaliveInterval: KEEPALIVE_MS,
                keepaliveCountMax: KEEPALIVE_MAX,
            };

            if (cfg.privateKey?.trim()) {
                cc.privateKey = cfg.privateKey;
                if (cfg.passphrase?.trim()) cc.passphrase = cfg.passphrase;
            } else if (cfg.password?.trim()) {
                cc.password     = cfg.password;
                cc.tryKeyboard  = true;
            }

            try {
                client.connect(cc);
            } catch (err) {
                this.entries.delete(key);
                reject(err);
            }
        });
    }

    private scheduleIdle(key: string, entry: PoolEntry): void {
        this.cancelIdle(entry);
        entry.idleTimer = setTimeout(() => {
            const e = this.entries.get(key);
            if (e?.refCount === 0) {
                e.ready = false;
                e.sftp  = null;
                this.entries.delete(key);
                try { e.client.end(); } catch { /* ignore */ }
                console.log(`[SSH Pool] Idle connection closed: ${key}`);
            }
        }, IDLE_TTL_MS);
    }

    private cancelIdle(entry: PoolEntry): void {
        if (entry.idleTimer) {
            clearTimeout(entry.idleTimer);
            entry.idleTimer = null;
        }
    }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

declare global {
    // eslint-disable-next-line no-var
    var __sshPool: SSHConnectionPool | undefined;
}

export const sshPool = (globalThis.__sshPool ??= new SSHConnectionPool());

