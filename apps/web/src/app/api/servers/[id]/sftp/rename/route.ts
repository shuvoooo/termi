/**
 * POST /api/servers/[id]/sftp/rename
 * Body: { oldPath: string; newPath: string }
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { renameEntry } from '@/lib/services/sftp.service';
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
    validateBody,
} from '@/lib/api';

const schema = z.object({
    oldPath: z.string().min(1),
    newPath: z.string().min(1),
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

        await renameEntry(
            {
                host: server.host,
                port: server.port,
                username: server.username,
                password: server.password ?? undefined,
                privateKey: server.privateKey ?? undefined,
                passphrase: server.passphrase ?? undefined,
            },
            validation.data.oldPath,
            validation.data.newPath
        );

        return successResponse({ renamed: true });
    } catch (err) {
        console.error('SFTP rename error:', err);
        return errorResponse('Rename failed', 500);
    }
}
