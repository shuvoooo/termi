/**
 * Authentication Service
 */

import { prisma } from '@/lib/db';
import {
    hashPassword,
    verifyPassword,
    generateSalt,
    deriveMasterKey,
    hashDerivedKey,
    encryptField,
    generateSecureToken,
} from '@/lib/crypto';
import { createSession, getSession, validateSession } from './session';
import { verifyTOTP, generateRecoveryCodes, normalizeRecoveryCode } from './totp';
import { sendEmailOTP, verifyEmailOTP } from './email-otp';
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface RegisterInput {
    email: string;
    password: string;
    masterKey?: string;
}

export interface LoginInput {
    email: string;
    password: string;
    deviceInfo: string;
    ipAddress: string;
}

export interface AuthResult {
    success: boolean;
    error?: string;
    requires2FA?: boolean;
    twoFactorMethod?: 'TOTP' | 'EMAIL';
    userId?: string;
    email?: string;
    sessionToken?: string;
    suggestPasskeySetup?: boolean; // True when user has no passkeys yet
}

// ============================================================================
// HELPERS
// ============================================================================

const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/** Hash a recovery code with scrypt for storage */
function hashRecoveryCode(code: string): string {
    const salt = randomBytes(16);
    const hash = scryptSync(normalizeRecoveryCode(code), salt, 32);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Verify a recovery code against a stored hash (constant-time) */
function verifyRecoveryCodeHash(code: string, stored: string): boolean {
    try {
        const [saltHex, hashHex] = stored.split(':');
        const salt = Buffer.from(saltHex, 'hex');
        const storedHash = Buffer.from(hashHex, 'hex');
        const computedHash = scryptSync(normalizeRecoveryCode(code), salt, 32);
        return timingSafeEqual(computedHash, storedHash);
    } catch {
        return false;
    }
}

// ============================================================================
// REGISTRATION
// ============================================================================

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
    const { email, password, masterKey } = input;

    const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
    });

    if (existing) {
        return { success: false, error: 'Email already registered' };
    }

    const passwordHash = await hashPassword(password);

    let masterKeyHash: string | undefined;
    let masterKeySalt: string | undefined;

    if (masterKey) {
        const salt = generateSalt();
        const derived = deriveMasterKey(masterKey, salt);
        masterKeyHash = hashDerivedKey(derived);
        masterKeySalt = salt.toString('base64');
    }

    const user = await prisma.user.create({
        data: {
            email: email.toLowerCase(),
            passwordHash,
            masterKeyHash,
            masterKeySalt,
        },
    });

    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'USER_REGISTER',
            details: { hasMasterKey: !!masterKey },
        },
    });

    return { success: true, userId: user.id, email: user.email };
}

// ============================================================================
// LOGIN
// ============================================================================

export async function loginUser(input: LoginInput): Promise<AuthResult> {
    const { email, password, deviceInfo, ipAddress } = input;

    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
    });

    if (!user) {
        await prisma.auditLog.create({
            data: {
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'User not found' },
            },
        });
        return { success: false, error: 'Invalid email or password' };
    }

    if (!user.isActive) {
        return { success: false, error: 'Account is disabled' };
    }

    // Lockout check
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
        const remaining = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
        return {
            success: false,
            error: `Account temporarily locked. Try again in ${remaining} minute(s).`,
        };
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
        const newCount = user.failedLoginCount + 1;
        const lockout = newCount >= MAX_FAILED_ATTEMPTS
            ? new Date(Date.now() + LOCKOUT_DURATION_MS)
            : null;

        await prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginCount: newCount,
                ...(lockout ? { lockoutUntil: lockout } : {}),
            },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'Invalid password', attempt: newCount },
            },
        });

        return { success: false, error: 'Invalid email or password' };
    }

    // Reset failed count on success
    if (user.failedLoginCount > 0 || user.lockoutUntil) {
        await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: 0, lockoutUntil: null },
        });
    }

    // Check if 2FA is required
    if (user.twoFactorMethod !== 'NONE') {
        const session = await getSession();
        session.requires2FA = true;
        session.tempUserId = user.id;
        await session.save();

        // For email OTP: send the code now
        if (user.twoFactorMethod === 'EMAIL') {
            await sendEmailOTP(user.id, user.email, ipAddress);
        }

        return {
            success: true,
            requires2FA: true,
            twoFactorMethod: user.twoFactorMethod as 'TOTP' | 'EMAIL',
            userId: user.id,
        };
    }

    const sessionToken = await createSession(user.id, user.email, deviceInfo, ipAddress);

    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    await session.save();

    // Suggest passkey setup if the user has none registered yet
    const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });

    return { success: true, userId: user.id, email: user.email, sessionToken, suggestPasskeySetup: passkeyCount === 0 };
}

// ============================================================================
// 2FA VERIFICATION (TOTP + Recovery + Email OTP)
// ============================================================================

export async function verify2FA(
    code: string,
    deviceInfo: string,
    ipAddress: string
): Promise<AuthResult> {
    const session = await getSession();

    if (!session.requires2FA || !session.tempUserId) {
        return { success: false, error: '2FA not required or session expired' };
    }

    const user = await prisma.user.findUnique({
        where: { id: session.tempUserId },
        select: {
            id: true,
            email: true,
            totpSecret: true,
            totpEnabled: true,
            twoFactorMethod: true,
        },
    });

    if (!user) {
        return { success: false, error: 'Invalid user or 2FA not configured' };
    }

    let isValid = false;
    let usedRecoveryCode = false;

    if (user.twoFactorMethod === 'EMAIL') {
        // Verify email OTP
        isValid = await verifyEmailOTP(user.id, code);
    } else if (user.twoFactorMethod === 'TOTP') {
        // Check if code looks like a recovery code (XXXX-XXXX or 8 chars)
        const normalized = normalizeRecoveryCode(code);
        if (normalized.length === 8) {
            // Try recovery codes
            const recoveryCodes = await prisma.recoveryCode.findMany({
                where: { userId: user.id, usedAt: null },
            });

            for (const rc of recoveryCodes) {
                if (verifyRecoveryCodeHash(code, rc.codeHash)) {
                    await prisma.recoveryCode.update({
                        where: { id: rc.id },
                        data: { usedAt: new Date() },
                    });
                    isValid = true;
                    usedRecoveryCode = true;
                    break;
                }
            }
        } else if (user.totpSecret && user.totpEnabled) {
            const { decryptCredentialField } = await import('@/lib/crypto/credentials');
            const totpSecret = decryptCredentialField(user.totpSecret);
            isValid = verifyTOTP(totpSecret, code);
        }
    }

    if (!isValid) {
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'Invalid 2FA code', method: user.twoFactorMethod },
            },
        });
        return { success: false, error: 'Invalid verification code' };
    }

    if (usedRecoveryCode) {
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_RECOVERY_CODE_USED',
                ipAddress,
                userAgent: deviceInfo,
            },
        });
    }

    const sessionToken = await createSession(user.id, user.email, deviceInfo, ipAddress);

    session.userId = user.id;
    session.email = user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    session.requires2FA = undefined;
    session.tempUserId = undefined;
    await session.save();

    const passkeyCount = await prisma.passkey.count({ where: { userId: user.id } });

    return { success: true, userId: user.id, email: user.email, sessionToken, suggestPasskeySetup: passkeyCount === 0 };
}

// ============================================================================
// 2FA SETUP — TOTP
// ============================================================================

/**
 * Enable TOTP 2FA. Returns plaintext recovery codes (shown once to user).
 */
export async function enable2FA(
    userId: string,
    totpSecret: string,
    verificationCode: string
): Promise<{ success: boolean; error?: string; recoveryCodes?: string[] }> {
    const isValid = verifyTOTP(totpSecret, verificationCode);
    if (!isValid) {
        return { success: false, error: 'Invalid verification code' };
    }

    const encryptedSecret = encryptField(totpSecret);

    // Generate & store recovery codes
    const plainCodes = generateRecoveryCodes();
    const codeHashes = plainCodes.map(hashRecoveryCode);

    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: {
                totpSecret: encryptedSecret,
                totpEnabled: true,
                twoFactorMethod: 'TOTP',
            },
        }),
        prisma.recoveryCode.deleteMany({ where: { userId } }),
        ...codeHashes.map((codeHash) =>
            prisma.recoveryCode.create({ data: { userId, codeHash } })
        ),
        prisma.auditLog.create({
            data: { userId, action: 'USER_2FA_ENABLED', details: { method: 'TOTP' } },
        }),
    ]);

    return { success: true, recoveryCodes: plainCodes };
}

// ============================================================================
// 2FA SETUP — EMAIL OTP
// ============================================================================

/**
 * Enable Email OTP as 2FA method.
 */
export async function enableEmailOTP(
    userId: string
): Promise<{ success: boolean; error?: string }> {
    await prisma.user.update({
        where: { id: userId },
        data: {
            emailOtpEnabled: true,
            twoFactorMethod: 'EMAIL',
        },
    });

    await prisma.auditLog.create({
        data: { userId, action: 'USER_2FA_ENABLED', details: { method: 'EMAIL' } },
    });

    return { success: true };
}

// ============================================================================
// 2FA DISABLE
// ============================================================================

export async function disable2FA(
    userId: string,
    password: string
): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
    });

    if (!user) {
        return { success: false, error: 'User not found' };
    }

    const passwordValid = await verifyPassword(user.passwordHash, password);
    if (!passwordValid) {
        return { success: false, error: 'Invalid password' };
    }

    await prisma.$transaction([
        prisma.user.update({
            where: { id: userId },
            data: {
                totpSecret: null,
                totpEnabled: false,
                emailOtpEnabled: false,
                twoFactorMethod: 'NONE',
            },
        }),
        prisma.recoveryCode.deleteMany({ where: { userId } }),
        prisma.auditLog.create({
            data: { userId, action: 'USER_2FA_DISABLED' },
        }),
    ]);

    return { success: true };
}

// ============================================================================
// AUTH UTILITIES
// ============================================================================

export async function getCurrentUser() {
    const session = await getSession();

    if (!session.isLoggedIn || !session.userId || !session.sessionToken) {
        return null;
    }

    const valid = await validateSession(session.sessionToken);
    if (!valid) return null;

    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
            id: true,
            email: true,
            totpEnabled: true,
            emailOtpEnabled: true,
            twoFactorMethod: true,
            masterKeyHash: true,
            passkeyEnabled: true,
            isActive: true,
            isVerified: true,
            createdAt: true,
        },
    });

    if (!user || !user.isActive) return null;
    return user;
}

export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
    });

    if (!user) return { success: false, error: 'User not found' };

    const passwordValid = await verifyPassword(user.passwordHash, currentPassword);
    if (!passwordValid) return { success: false, error: 'Current password is incorrect' };

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
    });

    await prisma.auditLog.create({
        data: { userId, action: 'USER_PASSWORD_CHANGED' },
    });

    return { success: true };
}
