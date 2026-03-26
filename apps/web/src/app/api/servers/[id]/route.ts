/**
 * GET /api/servers/[id] - Get server details
 * PATCH /api/servers/[id] - Update server
 * DELETE /api/servers/[id] - Delete server
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import {
    getServerById,
    updateServer,
    deleteServer,
} from '@/lib/services';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';
import { Protocol } from '@/app/generated/prisma/client';
import { validateHost } from '@/lib/security/ssrf';

const updateServerSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    groupId: z.string().nullable().optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    protocol: z.nativeEnum(Protocol).optional(),
    username: z.string().min(1).optional(),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    passphrase: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    isFavorite: z.boolean().optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        const server = await getServerById(id, user.id);

        if (!server) {
            return notFoundResponse('Server not found');
        }

        // Never send credentials back to the client — only expose whether they are set.
        // Callers that need credentials use getServerForConnection() server-side.
        const { password, privateKey, passphrase, ...safeFields } = server;
        return successResponse({
            server: {
                ...safeFields,
                hasPassword:    !!password,
                hasPrivateKey:  !!privateKey,
                hasPassphrase:  !!passphrase,
            },
        });
    } catch (error) {
        console.error('Get server error:', error);
        return errorResponse('Failed to fetch server', 500);
    }
}

export async function PATCH(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;
    const validation = await validateBody(request, updateServerSchema);

    if ('error' in validation) {
        return validation.error;
    }

    // Re-validate host against SSRF rules if the host is being changed
    if (validation.data.host) {
        const ssrfCheck = await validateHost(
            validation.data.host,
            process.env.ALLOW_PRIVATE_NETWORKS === 'true'
        );
        if (!ssrfCheck.valid) {
            return errorResponse(ssrfCheck.error || 'Invalid host', 400);
        }
    }

    try {
        const server = await updateServer(id, user.id, validation.data);

        if (!server) {
            return notFoundResponse('Server not found');
        }

        return successResponse({ server });
    } catch (error) {
        console.error('Update server error:', error);
        return errorResponse('Failed to update server', 500);
    }
}

export async function DELETE(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        const deleted = await deleteServer(id, user.id);

        if (!deleted) {
            return notFoundResponse('Server not found');
        }

        return successResponse({ message: 'Server deleted' });
    } catch (error) {
        console.error('Delete server error:', error);
        return errorResponse('Failed to delete server', 500);
    }
}
