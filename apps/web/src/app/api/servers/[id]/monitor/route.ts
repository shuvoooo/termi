/**
 * GET  /api/servers/[id]/monitor  — get monitoring config
 * POST /api/servers/[id]/monitor  — create or update monitoring config
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { prisma } from '@/lib/db';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

const monitorSchema = z.object({
    enabled: z.boolean(),
    checkIntervalMinutes: z.union([
        z.literal(1),
        z.literal(5),
        z.literal(10),
        z.literal(15),
        z.literal(30),
        z.literal(60),
    ]).optional(),
    alertEmail: z.boolean().optional(),
    alertPush: z.boolean().optional(),
    failureThreshold: z.number().int().min(1).max(10).optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');

    const config = await prisma.serverMonitorConfig.findUnique({
        where: { serverId: id },
        select: {
            enabled: true,
            checkIntervalMinutes: true,
            alertEmail: true,
            alertPush: true,
            failureThreshold: true,
            consecutiveFailures: true,
            alertSent: true,
            lastCheckedAt: true,
            lastStatus: true,
        },
    });

    return successResponse({ config });
}

export async function POST(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    const server = await getServerById(id, user.id);
    if (!server) return notFoundResponse('Server not found');

    const result = await validateBody(request, monitorSchema);
    if ('error' in result) return result.error;

    const data = result.data;

    try {
        // Read existing config to detect a toggle change
        const existing = await prisma.serverMonitorConfig.findUnique({
            where: { serverId: id },
            select: { enabled: true },
        });

        const isToggleChange = !existing || existing.enabled !== data.enabled;

        // Whenever the enabled flag changes (on→off or off→on), reset all
        // runtime state so the next check starts completely fresh and stale
        // failure counters can't trigger false alerts.
        const resetState = isToggleChange
            ? {
                consecutiveFailures: 0,
                alertSent: false,
                lastCheckedAt: null,
                lastStatus: true,
              }
            : {};

        const config = await prisma.serverMonitorConfig.upsert({
            where: { serverId: id },
            update: {
                enabled: data.enabled,
                ...(data.checkIntervalMinutes !== undefined && { checkIntervalMinutes: data.checkIntervalMinutes }),
                ...(data.alertEmail !== undefined && { alertEmail: data.alertEmail }),
                ...(data.alertPush !== undefined && { alertPush: data.alertPush }),
                ...(data.failureThreshold !== undefined && { failureThreshold: data.failureThreshold }),
                ...resetState,
            },
            create: {
                serverId: id,
                userId: user.id,
                enabled: data.enabled,
                checkIntervalMinutes: data.checkIntervalMinutes ?? 5,
                alertEmail: data.alertEmail ?? true,
                alertPush: data.alertPush ?? true,
                failureThreshold: data.failureThreshold ?? 3,
                // New configs always start with clean state
                consecutiveFailures: 0,
                alertSent: false,
            },
            select: {
                enabled: true,
                checkIntervalMinutes: true,
                alertEmail: true,
                alertPush: true,
                failureThreshold: true,
                consecutiveFailures: true,
                alertSent: true,
                lastCheckedAt: true,
                lastStatus: true,
            },
        });

        return successResponse({ config });
    } catch (err) {
        console.error('[Monitor] Failed to save config:', err);
        return errorResponse('Failed to save monitoring configuration', 500);
    }
}
