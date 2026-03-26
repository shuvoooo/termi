/**
 * POST /api/auth/2fa/email - Enable email OTP 2FA
 * PUT  /api/auth/2fa/email - Resend OTP during login flow
 */

import { getCurrentUser, enableEmailOTP } from '@/lib/auth';
import { sendEmailOTP } from '@/lib/auth/email-otp';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';
import { getClientIP } from '@/lib/api';
import { emailOtpRateLimit } from '@/lib/rate-limit';
import { getSession } from '@/lib/auth/session';

// POST - Enable email OTP as 2FA method
export async function POST() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    if (user.twoFactorMethod !== 'NONE') {
        return errorResponse('2FA is already enabled. Disable the current method first.', 400);
    }

    try {
        const result = await enableEmailOTP(user.id);
        if (!result.success) {
            return errorResponse(result.error || 'Failed to enable email 2FA', 400);
        }
        return successResponse({ message: 'Email OTP 2FA enabled. A code will be sent to your email on each login.' });
    } catch (error) {
        console.error('Enable email OTP error:', error);
        return errorResponse('Failed to enable email 2FA', 500);
    }
}

// PUT - Resend OTP during an active 2FA login flow
export async function PUT(request: Request) {
    const ipAddress = getClientIP(request);
    const session = await getSession();

    if (!session.requires2FA || !session.tempUserId) {
        return errorResponse('No active 2FA session', 400);
    }

    const rl = emailOtpRateLimit(session.tempUserId);
    if (!rl.allowed) {
        return errorResponse('Too many OTP requests. Please wait before requesting another code.', 429);
    }

    try {
        const { prisma } = await import('@/lib/db');
        const user = await prisma.user.findUnique({
            where: { id: session.tempUserId },
            select: { email: true, twoFactorMethod: true },
        });

        if (!user || user.twoFactorMethod !== 'EMAIL') {
            return errorResponse('Email OTP not configured for this account', 400);
        }

        await sendEmailOTP(session.tempUserId, user.email, ipAddress);
        return successResponse({ message: 'Verification code resent to your email' });
    } catch (error) {
        console.error('Resend OTP error:', error);
        return errorResponse('Failed to resend verification code', 500);
    }
}

