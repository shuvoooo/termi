/**
 * POST /api/servers/test
 * Test TCP connectivity to a host:port before saving
 */

import net from 'net';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';

const testSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
    }

    const result = testSchema.safeParse(body);
    if (!result.success) {
        return Response.json({ success: false, error: 'Invalid parameters' }, { status: 400 });
    }

    const { host, port } = result.data;

    return new Promise<Response>((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();

        socket.setTimeout(5000);

        socket.once('connect', () => {
            const latency = Date.now() - start;
            socket.destroy();
            resolve(Response.json({ success: true, latency }));
        });

        socket.once('timeout', () => {
            socket.destroy();
            resolve(Response.json({ success: false, error: 'Connection timed out (5s)' }));
        });

        socket.once('error', (err: NodeJS.ErrnoException) => {
            socket.destroy();
            let message = err.message;
            if (err.code === 'ECONNREFUSED') message = 'Connection refused — port is closed';
            else if (err.code === 'ENOTFOUND') message = 'Host not found — check the address';
            else if (err.code === 'ETIMEDOUT') message = 'Connection timed out';
            else if (err.code === 'ENETUNREACH') message = 'Network unreachable';
            resolve(Response.json({ success: false, error: message }));
        });

        socket.connect(port, host);
    });
}
