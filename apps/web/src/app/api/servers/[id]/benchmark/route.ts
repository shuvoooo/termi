/**
 * POST /api/servers/[id]/benchmark
 *
 * Streams benchmark progress as Server-Sent Events (text/event-stream).
 * Each event is a JSON-serialised BenchmarkProgress object.
 * Only supported for SSH servers (requires shell access).
 */

import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { runBenchmark } from '@/lib/services/benchmark.service';
import { unauthorizedResponse, notFoundResponse, errorResponse } from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');

    if (server.protocol !== 'SSH') {
        return errorResponse('Benchmark requires an SSH server', 400);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: object) => {
                try {
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                    );
                } catch {
                    // Client disconnected — ignore
                }
            };

            await runBenchmark(
                {
                    host:       server.host,
                    port:       server.port,
                    username:   server.username,
                    password:   server.password   ?? undefined,
                    privateKey: server.privateKey ?? undefined,
                    passphrase: server.passphrase ?? undefined,
                },
                send
            );

            try { controller.close(); } catch { /* ignore */ }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection':    'keep-alive',
        },
    });
}
