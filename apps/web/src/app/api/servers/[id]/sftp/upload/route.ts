/**
 * POST /api/servers/[id]/sftp/upload
 * Multipart form: file (File) + path (string — remote directory)
 */

import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { uploadBuffer } from '@/lib/services/sftp.service';
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return errorResponse('Invalid form data');
    }

    const file = formData.get('file');
    const remotePath = formData.get('path');

    if (!(file instanceof File)) return errorResponse('Missing file');
    if (typeof remotePath !== 'string' || !remotePath) return errorResponse('Missing path');

    const destPath = remotePath.replace(/\/+$/, '') + '/' + file.name;

    try {
        const server = await getServerById(id, user.id);
        if (!server) return notFoundResponse('Server not found');

        const buffer = Buffer.from(await file.arrayBuffer());

        await uploadBuffer(
            {
                host: server.host,
                port: server.port,
                username: server.username,
                password: server.password ?? undefined,
                privateKey: server.privateKey ?? undefined,
                passphrase: server.passphrase ?? undefined,
            },
            destPath,
            buffer
        );

        return successResponse({ uploaded: true, path: destPath });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed';
        return errorResponse(message, 500);
    }
}
