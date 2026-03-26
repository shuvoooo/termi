/**
 * Termo Session Management
 * 
 * Uses iron-session for secure, encrypted, cookie-based sessions.
 * Session data is encrypted and stored in an HTTP-only cookie.
 */

import { SessionOptions, getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { generateSecureToken, hashToken } from '@/lib/crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionData {
    userId?: string;
    email?: string;
    sessionToken?: string;
    isLoggedIn: boolean;
    requires2FA?: boolean;
    tempUserId?: string; // For 2FA flow
    masterKey?: string;  // Encrypted master key for session
    lastActivity?: number;
    passkeyChallenge?: string; // Base64URL challenge for WebAuthn registration/auth
    passkeyAuthUserId?: string; // userId resolved during passkey auth options (before assertion verified)
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function getSessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret.length < 32) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error(
                'SESSION_SECRET must be set and at least 32 characters long. ' +
                'Generate one with: openssl rand -base64 32'
            );
        }
        // Dev fallback — never used in production
        return 'dev-only-fallback-secret-at-least-32-chars!!';
    }
    return secret;
}

export const sessionOptions: SessionOptions = {
    password: getSessionSecret(),
    cookieName: 'termo_session',
    cookieOptions: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: SESSION_TTL,
    },
};

// Default session state
const defaultSession: SessionData = {
    isLoggedIn: false,
};

// ============================================================================
// SESSION FUNCTIONS
// ============================================================================

/**
 * Get the current session from cookies
 */
export async function getSession(): Promise<IronSession<SessionData>> {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    // Initialize with defaults if empty
    if (!session.isLoggedIn) {
        session.isLoggedIn = defaultSession.isLoggedIn;
    }

    return session;
}

/**
 * Create a new session for a logged-in user
 */
export async function createSession(
    userId: string,
    email: string,
    deviceInfo: string,
    ipAddress: string
): Promise<string> {
    // Generate session token
    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);

    // Calculate expiry
    const expiresAt = new Date(Date.now() + SESSION_TTL * 1000);

    // Store session in database
    await prisma.session.create({
        data: {
            userId,
            tokenHash,
            deviceInfo,
            ipAddress,
            expiresAt,
        },
    });

    // Update user's last login
    await prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
    });

    // Create audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SESSION_CREATED',
            ipAddress,
            userAgent: deviceInfo,
        },
    });

    return token;
}

/**
 * Validate a session token
 */
export async function validateSession(token: string): Promise<{ userId: string } | null> {
    const tokenHash = hashToken(token);

    const session = await prisma.session.findUnique({
        where: { tokenHash },
        select: {
            id: true,
            userId: true,
            expiresAt: true,
            isRevoked: true,
        },
    });

    if (!session) {
        return null;
    }

    // Check if revoked
    if (session.isRevoked) {
        return null;
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
        // Mark as expired in audit log
        await prisma.auditLog.create({
            data: {
                userId: session.userId,
                action: 'SESSION_EXPIRED',
                resource: `session:${session.id}`,
            },
        });
        return null;
    }

    // Update last active time
    await prisma.session.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() },
    });

    return { userId: session.userId };
}

/**
 * Revoke a session
 */
export async function revokeSession(
    sessionId: string,
    userId: string,
    reason?: string
): Promise<void> {
    await prisma.session.update({
        where: { id: sessionId },
        data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: reason || 'User revoked',
        },
    });

    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SESSION_REVOKED',
            resource: `session:${sessionId}`,
            details: { reason },
        },
    });
}

/**
 * Revoke all sessions for a user except current
 */
export async function revokeAllUserSessions(
    userId: string,
    exceptTokenHash?: string
): Promise<number> {
    const result = await prisma.session.updateMany({
        where: {
            userId,
            isRevoked: false,
            ...(exceptTokenHash && { tokenHash: { not: exceptTokenHash } }),
        },
        data: {
            isRevoked: true,
            revokedAt: new Date(),
            revokedReason: 'Revoked all sessions',
        },
    });

    return result.count;
}

/**
 * Get all active sessions for a user.
 * Pass the current session token so isCurrent is marked correctly.
 */
export async function getUserSessions(userId: string, currentToken?: string) {
    const currentTokenHash = currentToken ? hashToken(currentToken) : null;

    const sessions = await prisma.session.findMany({
        where: {
            userId,
            isRevoked: false,
            expiresAt: { gt: new Date() },
        },
        select: {
            id: true,
            tokenHash: true,
            deviceInfo: true,
            ipAddress: true,
            createdAt: true,
            lastActiveAt: true,
        },
        orderBy: { lastActiveAt: 'desc' },
    });

    return sessions.map(({ tokenHash, ...s }) => ({
        ...s,
        isCurrent: currentTokenHash ? tokenHash === currentTokenHash : false,
    }));
}

/**
 * Destroy the current cookie session
 */
export async function destroySession(): Promise<void> {
    const session = await getSession();

    if (session.sessionToken) {
        const tokenHash = hashToken(session.sessionToken);

        // Revoke database session
        await prisma.session.updateMany({
            where: { tokenHash },
            data: {
                isRevoked: true,
                revokedAt: new Date(),
                revokedReason: 'User logged out',
            },
        });

        // Audit log
        if (session.userId) {
            await prisma.auditLog.create({
                data: {
                    userId: session.userId,
                    action: 'USER_LOGOUT',
                },
            });
        }
    }

    // Clear session data
    session.userId = undefined;
    session.email = undefined;
    session.sessionToken = undefined;
    session.isLoggedIn = false;
    session.requires2FA = undefined;
    session.tempUserId = undefined;
    session.masterKey = undefined;
    session.passkeyChallenge = undefined;
    session.passkeyAuthUserId = undefined;

    await session.save();
}

/**
 * Clean up expired sessions (run periodically)
 */
export async function cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.session.deleteMany({
        where: {
            OR: [
                { expiresAt: { lt: new Date() } },
                {
                    isRevoked: true,
                    revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days
                },
            ],
        },
    });

    return result.count;
}
