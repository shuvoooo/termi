/**
 * POST /api/auth/register
 * Register a new user account
 */

import { z } from 'zod';
import { registerUser } from '@/lib/auth';
import {
    validateBody,
    successResponse,
    errorResponse
} from '@/lib/api';

const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .max(128, 'Password too long')
        .regex(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
            'Password must contain uppercase, lowercase, and a number'
        ),
    masterKey: z.string().min(8).optional(),
});

export async function POST(request: Request) {
    const validation = await validateBody(request, registerSchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { email, password, masterKey } = validation.data;

    try {
        const result = await registerUser({ email, password, masterKey });

        if (!result.success) {
            return errorResponse(result.error || 'Registration failed');
        }

        return successResponse({
            message: 'Account created successfully',
            userId: result.userId,
        }, 201);
    } catch (error) {
        console.error('Registration error:', error);
        return errorResponse('An error occurred during registration', 500);
    }
}
