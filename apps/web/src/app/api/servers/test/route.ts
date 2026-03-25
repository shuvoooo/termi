/**
 * POST /api/servers/test
 *
 * For SSH/SCP — attempts a real SSH authentication handshake so the user
 * knows their credentials work, not just that the port is open.
 * For RDP/VNC  — falls back to TCP reachability (we have no RDP auth client).
 */

import net from 'net';
import { Client, type ConnectConfig } from 'ssh2';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';

const schema = z.object({
    host:       z.string().min(1),
    port:       z.number().int().min(1).max(65535),
    protocol:   z.enum(['SSH', 'SCP', 'RDP', 'VNC']).default('SSH'),
    username:   z.string().optional(),
    password:   z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
});

// ── TCP reachability (RDP / VNC) ─────────────────────────────────────────────

function tcpCheck(
    host: string,
    port: number,
    timeoutMs = 6000,
): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        socket.setTimeout(timeoutMs);

        socket.once('connect', () => {
            const latencyMs = Date.now() - start;
            socket.destroy();
            resolve({ ok: true, latencyMs });
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve({ ok: false, error: 'Connection timed out' });
        });
        socket.once('error', (err: NodeJS.ErrnoException) => {
            socket.destroy();
            const msg =
                err.code === 'ECONNREFUSED' ? 'Connection refused — port is closed' :
                err.code === 'ENOTFOUND'    ? 'Host not found — check the address' :
                err.code === 'ETIMEDOUT'    ? 'Connection timed out' :
                err.code === 'ENETUNREACH'  ? 'Network unreachable' :
                err.message;
            resolve({ ok: false, error: msg });
        });
        socket.connect(port, host);
    });
}

// ── SSH authentication test ───────────────────────────────────────────────────

function sshAuthTest(config: {
    host: string; port: number; username: string;
    password?: string; privateKey?: string; passphrase?: string;
}, timeoutMs = 12000): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    return new Promise((resolve) => {
        const client = new Client();
        const start = Date.now();
        let settled = false;

        const done = (result: { ok: boolean; latencyMs?: number; error?: string }) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { client.end(); } catch { /* ignore */ }
            resolve(result);
        };

        const timer = setTimeout(
            () => done({ ok: false, error: 'Connection timed out after 12 seconds' }),
            timeoutMs,
        );

        client.on('ready', () => done({ ok: true, latencyMs: Date.now() - start }));

        client.on('error', (err) => {
            let msg = err.message;
            if (/All configured authentication methods failed/i.test(msg)) {
                msg = 'Authentication failed — wrong username or credentials';
            } else if (/ECONNREFUSED/.test(msg)) {
                msg = 'Connection refused — port is closed';
            } else if (/ENOTFOUND/.test(msg)) {
                msg = 'Host not found — check the address';
            } else if (/ETIMEDOUT|timed out/i.test(msg)) {
                msg = 'Connection timed out';
            } else if (/ENETUNREACH/.test(msg)) {
                msg = 'Network unreachable';
            } else if (/Encrypted private key detected/.test(msg)) {
                msg = 'Private key is encrypted — provide the passphrase';
            } else if (/Cannot parse privateKey/.test(msg)) {
                msg = 'Invalid private key format';
            }
            done({ ok: false, error: msg });
        });

        // Support servers that advertise keyboard-interactive instead of password
        if (config.password) {
            client.on('keyboard-interactive', (_n, _i, _l, _p, finish) => {
                finish([config.password!]);
            });
        }

        const cc: ConnectConfig = {
            host: config.host,
            port: config.port,
            username: config.username,
            readyTimeout: timeoutMs,
        };

        if (config.privateKey?.trim()) {
            cc.privateKey = config.privateKey;
            if (config.passphrase?.trim()) cc.passphrase = config.passphrase;
        }

        if (config.password?.trim()) {
            cc.password = config.password;
            cc.tryKeyboard = true;
        }

        client.connect(cc);
    });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); }
    catch { return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 }); }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return Response.json({ success: false, error: 'Invalid parameters' }, { status: 400 });
    }

    const { host, port, protocol, username, password, privateKey, passphrase } = parsed.data;

    const isSSH = protocol === 'SSH' || protocol === 'SCP';

    if (isSSH && username) {
        const result = await sshAuthTest({ host, port, username, password, privateKey, passphrase });
        return Response.json({
            success: result.ok,
            latency: result.latencyMs,
            error: result.error,
        });
    }

    // RDP / VNC — TCP check only
    const result = await tcpCheck(host, port);
    return Response.json({
        success: result.ok,
        latency: result.latencyMs,
        error: result.error,
    });
}
