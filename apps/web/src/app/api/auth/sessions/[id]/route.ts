/**
 * DELETE /api/auth/sessions/:id - Revoke a specific session
 */

import { getCurrentUser, revokeSession } from '@/lib/auth';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        await revokeSession(id, user.id, 'User revoked');

        return successResponse({
            message: 'Session revoked successfully',
        });
    } catch (error) {
        console.error('Revoke session error:', error);
        return errorResponse('Failed to revoke session', 500);
    }
}
