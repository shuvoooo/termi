/**
 * GET /api/servers/[id]/metrics
 *
 * Returns server reachability and, for SSH servers, CPU/RAM/disk/network
 * metrics collected agentlessly via a short-lived SSH session.
 */

import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { checkReachability, getSSHMetrics } from '@/lib/services/metrics.service';
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    try {
        const server = await getServerById(id, user.id);
        if (!server) return notFoundResponse('Server not found');

        const { reachable, latencyMs } = await checkReachability(server.host, server.port);

        if (!reachable) {
            return successResponse({ metrics: { reachable: false } });
        }

        if (server.protocol === 'SSH') {
            const metrics = await getSSHMetrics({
                id:          server.id,
                host:        server.host,
                port:        server.port,
                username:    server.username,
                password:    server.password ?? undefined,
                privateKey:  server.privateKey ?? undefined,
                passphrase:  server.passphrase ?? undefined,
            });
            return successResponse({ metrics: { ...metrics, latencyMs } });
        }

        // RDP / VNC / SCP — reachability only
        return successResponse({ metrics: { reachable: true, latencyMs } });
    } catch (error) {
        console.error('Metrics route error:', error);
        return errorResponse('Failed to fetch metrics', 500);
    }
}
