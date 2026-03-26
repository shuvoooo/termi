/**
 * POST /api/auth/login
 * Authenticate user with email and password
 */

import { z } from 'zod';
import { loginUser } from '@/lib/auth';
import {
    validateBody,
    successResponse,
    errorResponse,
    getClientIP,
    getDeviceInfo,
} from '@/lib/api';
import { loginRateLimit } from '@/lib/rate-limit';

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

export async function POST(request: Request) {
    const ipAddress = getClientIP(request);

    // Rate limiting
    const rl = loginRateLimit(ipAddress);
    if (!rl.allowed) {
        return errorResponse('Too many login attempts. Please try again later.', 429);
    }

    const validation = await validateBody(request, loginSchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { email, password } = validation.data;
    const deviceInfo = getDeviceInfo(request);

    try {
        const result = await loginUser({
            email,
            password,
            deviceInfo,
            ipAddress,
        });

        if (!result.success) {
            return errorResponse(result.error || 'Login failed', 401);
        }

        if (result.requires2FA) {
            return successResponse({
                requires2FA: true,
                twoFactorMethod: result.twoFactorMethod,
                message:
                    result.twoFactorMethod === 'EMAIL'
                        ? 'A verification code has been sent to your email'
                        : 'Please enter your authenticator app code',
            });
        }

        return successResponse({
            message: 'Login successful',
            user: {
                id: result.userId,
                email: result.email,
            },
            suggestPasskeySetup: result.suggestPasskeySetup,
        });
    } catch (error) {
        console.error('Login error:', error);
        return errorResponse('An error occurred during login', 500);
    }
}
