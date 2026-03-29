/**
 * POST /api/servers/[id]/sftp/upload
 * Multipart form: file (File) + path (string — remote directory)
 */

import path from 'path';
import { getCurrentUser } from '@/lib/auth';
import { getServerById } from '@/lib/services';
import { uploadBuffer } from '@/lib/services/sftp.service';
import {
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

// Hard cap: 500 MB per upload
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

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

    // Enforce upload size limit before reading into memory
    if (file.size > MAX_UPLOAD_BYTES) {
        return errorResponse(`File too large. Maximum allowed size is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`, 413);
    }

    // Sanitise the filename to prevent path traversal (e.g. "../../etc/passwd")
    const safeFileName = path.basename(file.name);
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
        return errorResponse('Invalid file name', 400);
    }

    const destPath = remotePath.replace(/\/+$/, '') + '/' + safeFileName;

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
        console.error('SFTP upload error:', err);
        return errorResponse('Upload failed', 500);
    }
}
