/**
 * Email OTP Authentication
 *
 * Generates, stores (hashed), and verifies email one-time passwords.
 * Uses nodemailer to send OTP emails.
 */

import { randomInt, scryptSync, timingSafeEqual, randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/db';

// ============================================================================
// CONSTANTS
// ============================================================================

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// HELPERS
// ============================================================================

/** Generate a random 6-digit OTP */
function generateOTP(): string {
    return String(randomInt(100000, 999999));
}

/** Hash an OTP code with scrypt for storage */
function hashOTP(code: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(code, salt, 32);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Verify an OTP against a stored hash */
function verifyOTPHash(code: string, stored: string): boolean {
    try {
        const [saltHex, hashHex] = stored.split(':');
        const salt = Buffer.from(saltHex, 'hex');
        const storedHash = Buffer.from(hashHex, 'hex');
        const computedHash = scryptSync(code, salt, 32);
        return timingSafeEqual(computedHash, storedHash);
    } catch {
        return false;
    }
}

// ============================================================================
// MAILER
// ============================================================================

function createTransporter() {
    // Support both SMTP and services like Gmail/Mailgun via env vars.
    // In development, logs to console if SMTP_HOST is not set.
    if (!process.env.SMTP_HOST) {
        // Ethereal / console fallback for development
        return nodemailer.createTransport({
            streamTransport: true,
            newline: 'unix',
        });
    }

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    const transporter = createTransporter();
    await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Termi Security" <noreply@termi.app>',
        to,
        subject,
        html,
    });

    // In dev (no SMTP configured), log that an email would have been sent.
    // Never log the OTP code — even in dev logs may be aggregated or monitored.
    if (!process.env.SMTP_HOST) {
        console.log('[EmailOTP] No SMTP configured — email would have been sent to:', to);
        console.log('[EmailOTP] Subject:', subject);
    }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Send an email OTP to the user and store the hash in DB.
 * Clears any existing unused OTPs for the user first.
 */
export async function sendEmailOTP(userId: string, email: string, ipAddress: string): Promise<void> {
    // Invalidate previous OTPs
    await prisma.emailOTP.deleteMany({
        where: { userId, usedAt: null },
    });

    const code = generateOTP();
    const codeHash = hashOTP(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await prisma.emailOTP.create({
        data: { userId, codeHash, expiresAt, ipAddress },
    });

    await sendEmail(
        email,
        'Your Termi verification code',
        `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="margin-bottom:8px">Verification Code</h2>
          <p style="color:#666;margin-bottom:24px">Use this code to sign in to Termi. It expires in 10 minutes.</p>
          <div style="background:#f4f4f4;border-radius:8px;padding:24px;text-align:center;letter-spacing:8px;font-size:32px;font-weight:bold;font-family:monospace">
            ${code}
          </div>
          <p style="color:#999;font-size:12px;margin-top:24px">If you did not request this code, ignore this email.</p>
        </div>
        `
    );
}

/**
 * Verify an email OTP code for a user.
 * Returns true and marks the OTP as used, or returns false.
 */
export async function verifyEmailOTP(userId: string, code: string): Promise<boolean> {
    const otps = await prisma.emailOTP.findMany({
        where: {
            userId,
            usedAt: null,
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        take: 3,
    });

    for (const otp of otps) {
        if (verifyOTPHash(code, otp.codeHash)) {
            await prisma.emailOTP.update({
                where: { id: otp.id },
                data: { usedAt: new Date() },
            });
            return true;
        }
    }

    return false;
}

