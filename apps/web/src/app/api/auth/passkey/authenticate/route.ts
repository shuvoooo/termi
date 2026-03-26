/**
 * POST /api/auth/passkey/authenticate
 * Verify WebAuthn authentication assertion and create a session.
 */

import { z } from 'zod';
import { verifyPasskeyAuthentication } from '@/lib/auth';
import { validateBody, successResponse, errorResponse, getClientIP, getDeviceInfo } from '@/lib/api';
import { passkeyAuthRateLimit } from '@/lib/rate-limit';

const authenticateSchema = z.object({
    response: z.any(), // AuthenticationResponseJSON — validated by simplewebauthn
});

export async function POST(request: Request) {
    const ip = getClientIP(request);
    const rl = passkeyAuthRateLimit(ip);
    if (!rl.allowed) {
        return errorResponse('Too many requests. Please try again later.', 429);
    }

    const validation = await validateBody(request, authenticateSchema);
    if ('error' in validation) return validation.error;

    const deviceInfo = getDeviceInfo(request);

    try {
        const result = await verifyPasskeyAuthentication(validation.data.response, deviceInfo, ip);

        if (!result.success) {
            return errorResponse(result.error || 'Passkey authentication failed', 401);
        }

        return successResponse({
            message: 'Signed in with passkey',
            user: { id: result.userId, email: result.email },
        });
    } catch (err) {
        console.error('Passkey authenticate error:', err);
        return errorResponse('Passkey authentication failed', 500);
    }
}
