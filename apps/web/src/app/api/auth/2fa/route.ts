/**
 * GET /api/auth/2fa/setup - Generate TOTP setup
 * POST /api/auth/2fa/enable - Enable 2FA
 * POST /api/auth/2fa/disable - Disable 2FA
 */

import { z } from 'zod';
import { getCurrentUser, enable2FA, disable2FA } from '@/lib/auth';
import { generateTOTPSecret } from '@/lib/auth/totp';
import { validateBody, successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

// GET - Generate TOTP setup (QR code and secret)
export async function GET() {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    if (user.totpEnabled) {
        return errorResponse('2FA is already enabled', 400);
    }

    try {
        const { secret, uri, qrCode } = await generateTOTPSecret(user.email);

        return successResponse({
            secret,
            uri,
            qrCode,
        });
    } catch (error) {
        console.error('2FA setup error:', error);
        return errorResponse('Failed to generate 2FA setup', 500);
    }
}

// POST - Enable 2FA
const enableSchema = z.object({
    secret: z.string(),
    code: z.string().length(6),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const validation = await validateBody(request, enableSchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { secret, code } = validation.data;

    try {
        const result = await enable2FA(user.id, secret, code);

        if (!result.success) {
            return errorResponse(result.error || 'Failed to enable 2FA', 400);
        }

        return successResponse({
            message: '2FA enabled successfully',
        });
    } catch (error) {
        console.error('Enable 2FA error:', error);
        return errorResponse('Failed to enable 2FA', 500);
    }
}

// DELETE - Disable 2FA
const disableSchema = z.object({
    password: z.string(),
});

export async function DELETE(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const validation = await validateBody(request, disableSchema);

    if ('error' in validation) {
        return validation.error;
    }

    const { password } = validation.data;

    try {
        const result = await disable2FA(user.id, password);

        if (!result.success) {
            return errorResponse(result.error || 'Failed to disable 2FA', 400);
        }

        return successResponse({
            message: '2FA disabled successfully',
        });
    } catch (error) {
        console.error('Disable 2FA error:', error);
        return errorResponse('Failed to disable 2FA', 500);
    }
}
