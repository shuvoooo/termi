/**
 * Authentication Service
 * 
 * Core authentication logic: registration, login, 2FA verification.
 * All operations create appropriate audit logs.
 */

import { prisma } from '@/lib/db';
import {
    hashPassword,
    verifyPassword,
    generateSalt,
    deriveMasterKey,
    hashDerivedKey,
    encryptField,
} from '@/lib/crypto';
import { createSession, getSession, validateSession } from './session';
import { verifyTOTP } from './totp';

// ============================================================================
// TYPES
// ============================================================================

export interface RegisterInput {
    email: string;
    password: string;
    masterKey?: string; // Optional master encryption key
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
    userId?: string;
    email?: string;
    sessionToken?: string;
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Register a new user
 */
export async function registerUser(input: RegisterInput): Promise<AuthResult> {
    const { email, password, masterKey } = input;

    // Check if user exists
    const existing = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
    });

    if (existing) {
        return { success: false, error: 'Email already registered' };
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Handle optional master key
    let masterKeyHash: string | undefined;
    let masterKeySalt: string | undefined;

    if (masterKey) {
        const salt = generateSalt();
        const derived = deriveMasterKey(masterKey, salt);
        masterKeyHash = hashDerivedKey(derived);
        masterKeySalt = salt.toString('base64');
    }

    // Create user
    const user = await prisma.user.create({
        data: {
            email: email.toLowerCase(),
            passwordHash,
            masterKeyHash,
            masterKeySalt,
        },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId: user.id,
            action: 'USER_REGISTER',
            details: { hasMasterKey: !!masterKey },
        },
    });

    return {
        success: true,
        userId: user.id,
        email: user.email,
    };
}

// ============================================================================
// LOGIN
// ============================================================================

/**
 * Authenticate a user
 * Returns requires2FA: true if user has 2FA enabled
 */
export async function loginUser(input: LoginInput): Promise<AuthResult> {
    const { email, password, deviceInfo, ipAddress } = input;

    // Find user
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
    });

    if (!user) {
        // Log failed attempt without exposing whether email exists
        await prisma.auditLog.create({
            data: {
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'Invalid credentials' },
            },
        });

        return { success: false, error: 'Invalid email or password' };
    }

    // Check if account is active
    if (!user.isActive) {
        return { success: false, error: 'Account is disabled' };
    }

    // Verify password
    const passwordValid = await verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'Invalid password' },
            },
        });

        return { success: false, error: 'Invalid email or password' };
    }

    // Check if 2FA is required
    if (user.totpEnabled) {
        // Store temporary session for 2FA flow
        const session = await getSession();
        session.requires2FA = true;
        session.tempUserId = user.id;
        await session.save();

        return {
            success: true,
            requires2FA: true,
            userId: user.id,
        };
    }

    // Create full session
    const sessionToken = await createSession(user.id, user.email, deviceInfo, ipAddress);

    // Update cookie session
    const session = await getSession();
    session.userId = user.id;
    session.email = user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    await session.save();

    return {
        success: true,
        userId: user.id,
        email: user.email,
        sessionToken,
    };
}

// ============================================================================
// 2FA VERIFICATION
// ============================================================================

/**
 * Verify 2FA code and complete login
 */
export async function verify2FA(
    code: string,
    deviceInfo: string,
    ipAddress: string
): Promise<AuthResult> {
    const session = await getSession();

    if (!session.requires2FA || !session.tempUserId) {
        return { success: false, error: '2FA not required or session expired' };
    }

    // Get user with TOTP secret
    const user = await prisma.user.findUnique({
        where: { id: session.tempUserId },
        select: {
            id: true,
            email: true,
            totpSecret: true,
            totpEnabled: true,
        },
    });

    if (!user || !user.totpSecret || !user.totpEnabled) {
        return { success: false, error: 'Invalid user or 2FA not configured' };
    }

    // Decrypt TOTP secret and verify
    // Note: The TOTP secret is stored encrypted with system key
    const { decryptCredentialField } = await import('@/lib/crypto/credentials');
    const totpSecret = decryptCredentialField(user.totpSecret);

    const isValid = verifyTOTP(totpSecret, code);

    if (!isValid) {
        await prisma.auditLog.create({
            data: {
                userId: user.id,
                action: 'USER_LOGIN_FAILED',
                ipAddress,
                userAgent: deviceInfo,
                details: { reason: 'Invalid 2FA code' },
            },
        });

        return { success: false, error: 'Invalid verification code' };
    }

    // Create full session
    const sessionToken = await createSession(user.id, user.email, deviceInfo, ipAddress);

    // Update session
    session.userId = user.id;
    session.email = user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    session.requires2FA = undefined;
    session.tempUserId = undefined;
    await session.save();

    return {
        success: true,
        userId: user.id,
        email: user.email,
        sessionToken,
    };
}

// ============================================================================
// 2FA SETUP
// ============================================================================

/**
 * Enable 2FA for a user
 */
export async function enable2FA(
    userId: string,
    totpSecret: string,
    verificationCode: string
): Promise<{ success: boolean; error?: string }> {
    // Verify the code first
    const isValid = verifyTOTP(totpSecret, verificationCode);

    if (!isValid) {
        return { success: false, error: 'Invalid verification code' };
    }

    // Encrypt and store the secret
    const encryptedSecret = encryptField(totpSecret);

    await prisma.user.update({
        where: { id: userId },
        data: {
            totpSecret: encryptedSecret,
            totpEnabled: true,
        },
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'USER_2FA_ENABLED',
        },
    });

    return { success: true };
}

/**
 * Disable 2FA for a user
 */
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

    // Require password confirmation
    const passwordValid = await verifyPassword(user.passwordHash, password);

    if (!passwordValid) {
        return { success: false, error: 'Invalid password' };
    }

    await prisma.user.update({
        where: { id: userId },
        data: {
            totpSecret: null,
            totpEnabled: false,
        },
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'USER_2FA_DISABLED',
        },
    });

    return { success: true };
}

// ============================================================================
// AUTH UTILITIES
// ============================================================================

/**
 * Get current authenticated user
 */
export async function getCurrentUser() {
    const session = await getSession();

    if (!session.isLoggedIn || !session.userId || !session.sessionToken) {
        return null;
    }

    // Validate session in database
    const valid = await validateSession(session.sessionToken);

    if (!valid) {
        return null;
    }

    // Fetch user data
    const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
            id: true,
            email: true,
            totpEnabled: true,
            masterKeyHash: true,
            isActive: true,
            createdAt: true,
        },
    });

    if (!user || !user.isActive) {
        return null;
    }

    return user;
}

/**
 * Change user password
 */
export async function changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
    });

    if (!user) {
        return { success: false, error: 'User not found' };
    }

    const passwordValid = await verifyPassword(user.passwordHash, currentPassword);

    if (!passwordValid) {
        return { success: false, error: 'Current password is incorrect' };
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash },
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'USER_PASSWORD_CHANGED',
        },
    });

    return { success: true };
}
