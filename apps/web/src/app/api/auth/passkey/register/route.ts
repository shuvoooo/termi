/**
 * POST /api/auth/passkey/register
 * Verify WebAuthn registration response and persist the new passkey.
 */

import { z } from 'zod';
import { getCurrentUser, verifyPasskeyRegistration } from '@/lib/auth';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

const registerSchema = z.object({
    name: z.string().max(64).default('Passkey'),
    response: z.any(), // RegistrationResponseJSON — validated by simplewebauthn
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const validation = await validateBody(request, registerSchema);
    if ('error' in validation) return validation.error;

    const { name, response } = validation.data;

    try {
        const result = await verifyPasskeyRegistration(user.id, response, name);

        if (!result.success) {
            return errorResponse(result.error || 'Passkey registration failed');
        }

        return successResponse({ message: 'Passkey registered successfully' });
    } catch (err) {
        console.error('Passkey register error:', err);
        return errorResponse('Passkey registration failed', 500);
    }
}
