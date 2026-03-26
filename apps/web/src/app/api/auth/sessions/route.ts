/**
 * GET /api/auth/sessions - List user sessions
 * DELETE /api/auth/sessions/:id - Revoke a session
 */

import { getCurrentUser, getUserSessions, revokeSession, getSession } from '@/lib/auth';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    try {
        const currentSession = await getSession();
        const sessions = await getUserSessions(user.id, currentSession.sessionToken);
        return successResponse({ sessions });
    } catch (error) {
        console.error('Get sessions error:', error);
        return errorResponse('Failed to fetch sessions', 500);
    }
}
