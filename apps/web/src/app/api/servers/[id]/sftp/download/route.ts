/**
 * GET /api/servers/[id]/sftp/download?path=/remote/file.txt
 * Streams a remote file to the browser as a download.
 */

import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { createDownloadStream } from '@/lib/services/sftp.service';
import { unauthorizedResponse, notFoundResponse, errorResponse } from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;
    const filePath = new URL(request.url).searchParams.get('path');

    if (!filePath) return errorResponse('Missing path parameter');

    try {
        const server = await getServerById(id, user.id);
        if (!server) return notFoundResponse('Server not found');

        const fileName = filePath.split('/').pop() || 'download';
        const stream = createDownloadStream(
            {
                id:         server.id,
                host:       server.host,
                port:       server.port,
                username:   server.username,
                password:   server.password ?? undefined,
                privateKey: server.privateKey ?? undefined,
                passphrase: server.passphrase ?? undefined,
            },
            filePath
        );

        return new Response(stream, {
            headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        console.error('SFTP download error:', err);
        return errorResponse('Download failed', 500);
    }
}
