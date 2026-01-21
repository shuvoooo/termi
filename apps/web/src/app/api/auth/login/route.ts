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

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

export async function POST(request: Request) {
    const validation = await validateBody(request, loginSchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { email, password } = validation.data;
    const ipAddress = getClientIP(request);
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
                message: 'Please enter your verification code',
            });
        }

        return successResponse({
            message: 'Login successful',
            user: {
                id: result.userId,
                email: result.email,
            },
        });
    } catch (error) {
        console.error('Login error:', error);
        return errorResponse('An error occurred during login', 500);
    }
}
