/**
 * POST /api/auth/verify-2fa
 * Verify TOTP code, email OTP, or recovery code and complete login
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
import { verify2FARateLimit } from '@/lib/rate-limit';

const verifySchema = z.object({
    // Allow 6-digit OTP or XXXX-XXXX recovery code
    code: z
        .string()
        .min(6)
        .max(9)
        .transform((v) => v.trim()),
});

export async function POST(request: Request) {
    const ipAddress = getClientIP(request);

    const rl = verify2FARateLimit(ipAddress);
    if (!rl.allowed) {
        return errorResponse('Too many verification attempts. Please try again later.', 429);
    }

    const validation = await validateBody(request, verifySchema);
    if ('error' in validation) return validation.error;

    const { code } = validation.data;
    const deviceInfo = getDeviceInfo(request);

    try {
        const result = await verify2FA(code, deviceInfo, ipAddress);

        if (!result.success) {
            return errorResponse(result.error || 'Verification failed', 401);
        }

        return successResponse({
            message: 'Login successful',
            user: { id: result.userId, email: result.email },
        });
    } catch (error) {
        console.error('2FA verification error:', error);
        return errorResponse('An error occurred during verification', 500);
    }
}
