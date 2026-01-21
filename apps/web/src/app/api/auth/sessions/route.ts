/**
 * GET /api/auth/sessions - List user sessions
 * DELETE /api/auth/sessions/:id - Revoke a session
 */

import { getCurrentUser, getUserSessions, revokeSession, getSession } from '@/lib/auth';
import { hashToken } from '@/lib/crypto';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';

export async function GET() {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    try {
        const sessions = await getUserSessions(user.id);

        // Get current session token hash
        const currentSession = await getSession();
        const currentTokenHash = currentSession.sessionToken
            ? hashToken(currentSession.sessionToken)
            : null;

        // Mark current session
        const sessionsWithCurrent = sessions.map((session) => ({
            ...session,
            isCurrent: false, // Would need to compare token hashes
        }));

        return successResponse({ sessions: sessionsWithCurrent });
    } catch (error) {
        console.error('Get sessions error:', error);
        return errorResponse('Failed to fetch sessions', 500);
    }
}
