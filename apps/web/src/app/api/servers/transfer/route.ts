/**
 * POST /api/servers/transfer
 * Body: { fromServerId, fromPaths: string[], toServerId, toPath: string }
 *
 * Pipes files directly between two SFTP connections server-side —
 * data never passes through the browser.
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { transferFiles } from '@/lib/services/sftp.service';
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
    validateBody,
} from '@/lib/api';

const schema = z.object({
    fromServerId: z.string().min(1),
    fromPaths: z.array(z.string().min(1)).min(1),
    toServerId: z.string().min(1),
    toPath: z.string().min(1),
});

function toSFTPConfig(server: Awaited<ReturnType<typeof getServerById>> & object, serverId: string) {
    return {
        id:         serverId,
        host:       server.host,
        port:       server.port,
        username:   server.username,
        password:   server.password ?? undefined,
        privateKey: server.privateKey ?? undefined,
        passphrase: server.passphrase ?? undefined,
    };
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, schema);
    if ('error' in validation) return validation.error;

    const { fromServerId, fromPaths, toServerId, toPath } = validation.data;

    try {
        const [fromServer, toServer] = await Promise.all([
            getServerById(fromServerId, user.id),
            getServerById(toServerId, user.id),
        ]);

        if (!fromServer) return notFoundResponse('Source server not found');
        if (!toServer) return notFoundResponse('Destination server not found');

        const result = await transferFiles(
            toSFTPConfig(fromServer, fromServerId),
            fromPaths,
            toSFTPConfig(toServer, toServerId),
            toPath
        );

        return successResponse(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Transfer failed';
        return errorResponse(message, 500);
    }
}
