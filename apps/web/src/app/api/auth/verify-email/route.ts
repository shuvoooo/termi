/**
 * GET /api/auth/verify-email?token=...
 */

import { NextResponse } from 'next/server';
import { verifyEmailToken } from '@/lib/auth/email-verification';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return NextResponse.redirect(new URL('/login?error=invalid-token', request.url));
    }

    const result = await verifyEmailToken(token);

    if (!result.success) {
        return NextResponse.redirect(
            new URL(`/login?error=verification-failed&message=${encodeURIComponent(result.error || '')}`, request.url)
        );
    }

    return NextResponse.redirect(new URL('/login?verified=1', request.url));
}

