/**
 * GET /api/servers/[id]/sftp/list?path=/some/dir
 * List a remote directory's contents.
 */

import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { listDirectory } from '@/lib/services/sftp.service';
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;
    const dirPath = new URL(request.url).searchParams.get('path') || '/';

    try {
        const server = await getServerById(id, user.id);
        if (!server) return notFoundResponse('Server not found');

        const entries = await listDirectory(
            {
                host: server.host,
                port: server.port,
                username: server.username,
                password: server.password ?? undefined,
                privateKey: server.privateKey ?? undefined,
                passphrase: server.passphrase ?? undefined,
            },
            dirPath
        );

        return successResponse({ entries, path: dirPath });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to list directory';
        return errorResponse(message, 500);
    }
}
