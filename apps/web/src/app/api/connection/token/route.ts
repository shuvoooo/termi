/**
 * POST /api/connection/token
 * Generate a connection token for the gateway
 */

import { z } from 'zod';
import * as jose from 'jose';
import { getCurrentUser } from '@/lib/auth';
import { getServerForConnection } from '@/lib/services';
import { validateBody, successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';

const tokenSchema = z.object({
    serverId: z.string(),
    protocol: z.enum(['ssh', 'scp', 'rdp', 'vnc']),
});

const JWT_SECRET = new TextEncoder().encode(
    process.env.GATEWAY_JWT_SECRET || 'gateway-secret-key-change-in-production'
);

export async function POST(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const validation = await validateBody(request, tokenSchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { serverId, protocol } = validation.data;

    try {
        // Get server with decrypted credentials
        const server = await getServerForConnection(serverId, user.id);

        if (!server) {
            return notFoundResponse('Server not found');
        }

        // Create JWT for gateway
        const token = await new jose.SignJWT({
            userId: user.id,
            serverId: server.id,
            protocol,
            host: server.host,
            port: server.port,
            username: server.username,
            password: server.password,
            privateKey: server.privateKey,
            passphrase: server.passphrase,
        })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('5m')
            .sign(JWT_SECRET);

        return successResponse({ token });
    } catch (error) {
        console.error('Token generation error:', error);
        return errorResponse('Failed to generate connection token', 500);
    }
}
