/**
 * GET /api/auth/me
 * Get current authenticated user
 */

import { getCurrentUser } from '@/lib/auth';
import { successResponse, unauthorizedResponse } from '@/lib/api';

export async function GET() {
    try {
        const user = await getCurrentUser();

        if (!user) {
            return unauthorizedResponse('Not authenticated');
        }

        return successResponse({
            user: {
                id: user.id,
                email: user.email,
                totpEnabled: user.totpEnabled,
                emailOtpEnabled: user.emailOtpEnabled,
                twoFactorMethod: user.twoFactorMethod,
                hasMasterKey: !!user.masterKeyHash,
                passkeyEnabled: user.passkeyEnabled,
                isVerified: user.isVerified,
                createdAt: user.createdAt,
            },
        });
    } catch (error) {
        console.error('Get user error:', error);
        return unauthorizedResponse('Not authenticated');
    }
}
