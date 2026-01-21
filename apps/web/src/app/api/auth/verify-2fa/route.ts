/**
 * POST /api/auth/verify-2fa
 * Verify TOTP code and complete login
 */

import { z } from 'zod';
import { verify2FA } from '@/lib/auth';
import {
    validateBody,
    successResponse,
    errorResponse,
    getClientIP,
    getDeviceInfo,
} from '@/lib/api';

const verifySchema = z.object({
    code: z.string().length(6, 'Code must be 6 digits').regex(/^\d+$/, 'Code must be numeric'),
});

export async function POST(request: Request) {
    const validation = await validateBody(request, verifySchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { code } = validation.data;
    const ipAddress = getClientIP(request);
    const deviceInfo = getDeviceInfo(request);

    try {
        const result = await verify2FA(code, deviceInfo, ipAddress);

        if (!result.success) {
            return errorResponse(result.error || 'Verification failed', 401);
        }

        return successResponse({
            message: 'Login successful',
            user: {
                id: result.userId,
                email: result.email,
            },
        });
    } catch (error) {
        console.error('2FA verification error:', error);
        return errorResponse('An error occurred during verification', 500);
    }
}
