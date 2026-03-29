/**
 * POST /api/connection/token
 *
 * Generates an encrypted JWE token (A256GCM) for the gateway.
 * Credentials in the payload are fully encrypted — interception reveals nothing.
 */

import { z } from 'zod';
import * as jose from 'jose';
import { getCurrentUser } from '@/lib/auth';
import { getServerForConnection } from '@/lib/services';
import { validateBody, successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';
import { createHash } from 'crypto';
import { connectionTokenRateLimit } from '@/lib/rate-limit';

const tokenSchema = z.object({
    serverId: z.string(),
    protocol: z.enum(['ssh', 'scp', 'rdp', 'vnc']),
});

function getJWEKey(): Uint8Array {
    const secret = process.env.GATEWAY_JWT_SECRET;
    if (!secret || secret === 'gateway-secret-key-change-in-production') {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('GATEWAY_JWT_SECRET must be set to a strong random value in production');
        }
        // Dev fallback
        return new Uint8Array(createHash('sha256').update('dev-gateway-secret').digest());
    }
    return new Uint8Array(createHash('sha256').update(secret).digest());
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    // Rate limit: 30 token requests per 5 minutes per user
    const rl = connectionTokenRateLimit(user.id);
    if (!rl.allowed) {
        return errorResponse('Too many connection requests. Please wait before trying again.', 429);
    }

    const validation = await validateBody(request, tokenSchema);
    if ('error' in validation) return validation.error;

    const { serverId, protocol } = validation.data;

    try {
        const server = await getServerForConnection(serverId, user.id);
        if (!server) return notFoundResponse('Server not found');

        const key = getJWEKey();

        // Use JWE (encrypted JWT) — payload is AES-256-GCM encrypted
        const token = await new jose.EncryptJWT({
            userId: user.id,
            serverId: server.id,
            protocol,
            host: server.host,
            port: server.port,
            username: server.username,
            password: server.password ?? null,
            privateKey: server.privateKey ?? null,
            passphrase: server.passphrase ?? null,
            displayWidth: server.displayWidth ?? 1920,
            displayHeight: server.displayHeight ?? 1080,
            colorDepth: server.colorDepth ?? 24,
        })
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .setExpirationTime('5m')
            .setIssuedAt()
            .encrypt(key);

        // Return gatewayUrl alongside the token so client components can read
        // it at runtime rather than relying on the NEXT_PUBLIC_ build-time bake-in.
        const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'https://gateway.termi.dp.shuvoo.com';

        return successResponse({ token, gatewayUrl });
    } catch (error) {
        if (error instanceof Error && error.message.includes('GATEWAY_JWT_SECRET')) {
            console.error('Connection token error:', error.message);
            return errorResponse('Server configuration error', 500);
        }
        console.error('Token generation error:', error);
        return errorResponse('Failed to generate connection token', 500);
    }
}
