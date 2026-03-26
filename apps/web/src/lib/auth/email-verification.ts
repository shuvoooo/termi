/**
 * Email Verification
 *
 * Sends a verification link after registration and verifies the token.
 */

import { randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function createTransporter() {
    if (!process.env.SMTP_HOST) {
        return nodemailer.createTransport({ streamTransport: true, newline: 'unix' });
    }
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
}

export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await prisma.user.update({
        where: { id: userId },
        data: {
            emailVerificationToken: token,
            emailVerificationExpiresAt: expiresAt,
        },
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://termi.dp.shuvoo.com';
    const verifyUrl = `${appUrl}/api/auth/verify-email?token=${token}`;

    const transporter = createTransporter();
    await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Termi" <noreply@termi.app>',
        to: email,
        subject: 'Verify your Termi account',
        html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2>Verify your email</h2>
          <p>Click the button below to verify your Termi account. The link expires in 24 hours.</p>
          <a href="${verifyUrl}" style="display:inline-block;background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
            Verify Email
          </a>
          <p style="color:#999;font-size:12px">If you didn't create a Termi account, ignore this email.</p>
        </div>
        `,
    });

    if (!process.env.SMTP_HOST) {
        console.log('[EmailVerification] Verify URL:', verifyUrl);
    }
}

export async function verifyEmailToken(token: string): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findFirst({
        where: {
            emailVerificationToken: token,
            emailVerificationExpiresAt: { gt: new Date() },
            isVerified: false,
        },
    });

    if (!user) {
        return { success: false, error: 'Invalid or expired verification link' };
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            isVerified: true,
            emailVerificationToken: null,
            emailVerificationExpiresAt: null,
        },
    });

    await prisma.auditLog.create({
        data: { userId: user.id, action: 'USER_EMAIL_VERIFIED' },
    });

    return { success: true };
}

