/**
 * POST /api/auth/passkey/authenticate-options
 * Generate WebAuthn authentication options (public endpoint, no session required).
 * Optionally accepts an email to scope allowCredentials to that user's passkeys.
 */

import { z } from 'zod';
import { generatePasskeyAuthenticationOptions } from '@/lib/auth';
import { validateBody, successResponse, errorResponse } from '@/lib/api';
import { passkeyAuthRateLimit } from '@/lib/rate-limit';
import { getClientIP } from '@/lib/api';

const optionsSchema = z.object({
    email: z.string().email().optional(),
});

export async function POST(request: Request) {
    const ip = getClientIP(request);
    const rl = passkeyAuthRateLimit(ip);
    if (!rl.allowed) {
        return errorResponse('Too many requests. Please try again later.', 429);
    }

    const validation = await validateBody(request, optionsSchema);
    if ('error' in validation) return validation.error;

    try {
        const options = await generatePasskeyAuthenticationOptions(validation.data.email);
        return successResponse(options);
    } catch (err) {
        console.error('Passkey authenticate-options error:', err);
        return errorResponse('Failed to generate authentication options', 500);
    }
}
