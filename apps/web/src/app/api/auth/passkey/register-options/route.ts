/**
 * GET /api/auth/passkey/register-options
 * Generate WebAuthn registration options for the authenticated user.
 */

import { getCurrentUser, generatePasskeyRegistrationOptions } from '@/lib/auth';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        const options = await generatePasskeyRegistrationOptions(user.id);
        return successResponse(options);
    } catch (err) {
        console.error('Passkey register-options error:', err);
        return errorResponse('Failed to generate registration options', 500);
    }
}
