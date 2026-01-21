/**
 * POST /api/auth/logout
 * End user session
 */

import { destroySession } from '@/lib/auth';
import { successResponse, errorResponse } from '@/lib/api';

export async function POST() {
    try {
        await destroySession();

        return successResponse({
            message: 'Logged out successfully',
        });
    } catch (error) {
        console.error('Logout error:', error);
        return errorResponse('An error occurred during logout', 500);
    }
}
