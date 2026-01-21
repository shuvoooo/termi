/**
 * POST /api/auth/password - Change user password
 */

import { z } from 'zod';
import { getCurrentUser, changePassword } from '@/lib/auth';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

const passwordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain uppercase, lowercase, and a number'
        ),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const validation = await validateBody(request, passwordSchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { currentPassword, newPassword } = validation.data;

    try {
        const result = await changePassword(user.id, currentPassword, newPassword);

        if (!result.success) {
            return errorResponse(result.error || 'Failed to change password', 400);
        }

        return successResponse({
            message: 'Password changed successfully',
        });
    } catch (error) {
        console.error('Change password error:', error);
        return errorResponse('Failed to change password', 500);
    }
}
