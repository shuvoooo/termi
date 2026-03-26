/**
 * GET  /api/auth/passkey  — list current user's passkeys
 */

import { getCurrentUser, listPasskeys } from '@/lib/auth';
import { successResponse, unauthorizedResponse, errorResponse } from '@/lib/api';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        const passkeys = await listPasskeys(user.id);
        return successResponse({ passkeys });
    } catch (err) {
        console.error('List passkeys error:', err);
        return errorResponse('Failed to list passkeys', 500);
    }
}
