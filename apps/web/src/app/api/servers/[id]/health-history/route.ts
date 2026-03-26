/**
 * GET /api/servers/[id]/health-history
 *
 * Returns the last N health check records for a server (for graph rendering).
 */

import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { prisma } from '@/lib/db';
import {
    successResponse,
    unauthorizedResponse,
    notFoundResponse,
    errorResponse,
} from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');

    try {
        const { searchParams } = new URL(request.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);

        const records = await prisma.serverHealthRecord.findMany({
            where: { serverId: id },
            orderBy: { checkedAt: 'desc' },
            take: limit,
            select: {
                reachable: true,
                latencyMs: true,
                cpuPercent: true,
                ramPercent: true,
                diskPercent: true,
                checkedAt: true,
            },
        });

        // Return in chronological order for charting
        return successResponse({ records: records.reverse() });
    } catch (err) {
        console.error('[HealthHistory] Error:', err);
        return errorResponse('Failed to fetch health history', 500);
    }
}
