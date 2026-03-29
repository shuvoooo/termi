/**
 * POST /api/servers/[id]/sftp/delete
 * Body: { path: string; isDirectory: boolean }
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { deleteEntry } from '@/lib/services/sftp.service';
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
    validateBody,
} from '@/lib/api';

const schema = z.object({
    path: z.string().min(1),
    isDirectory: z.boolean(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;
    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    try {
        const server = await getServerById(id, user.id);
        if (!server) return notFoundResponse('Server not found');

        await deleteEntry(
            {
                id:         server.id,
                host:       server.host,
                port:       server.port,
                username:   server.username,
                password:   server.password ?? undefined,
                privateKey: server.privateKey ?? undefined,
                passphrase: server.passphrase ?? undefined,
            },
            validation.data.path,
            validation.data.isDirectory
        );

        return successResponse({ deleted: true });
    } catch (err) {
        console.error('SFTP delete error:', err);
        return errorResponse('Delete failed', 500);
    }
}
