/**
 * Passkey (WebAuthn / FIDO2) Service
 *
 * Implements Apple Passkey / WebAuthn credential registration and authentication
 * using @simplewebauthn/server.
 */

import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
    RegistrationResponseJSON,
    AuthenticationResponseJSON,
    AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import { prisma } from '@/lib/db';
import { createSession, getSession } from './session';

// ============================================================================
// HELPERS
// ============================================================================

function getRpDetails() {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://termi.dp.shuvoo.com';
    const url = new URL(appUrl);
    return {
        rpID: url.hostname,
        rpName: 'Termi',
        origin: url.origin,
    };
}

// ============================================================================
// REGISTRATION
// ============================================================================

/**
 * Generate WebAuthn registration options for an authenticated user.
 * Stores the challenge in the iron-session so it can be verified later.
 */
export async function generatePasskeyRegistrationOptions(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, passkeys: { select: { credentialID: true, transports: true } } },
    });

    if (!user) throw new Error('User not found');

    const { rpID, rpName } = getRpDetails();

    const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: user.email,
        attestationType: 'none',
        excludeCredentials: user.passkeys.map((p) => ({
            id: p.credentialID,
            transports: p.transports as AuthenticatorTransportFuture[],
        })),
        authenticatorSelection: {
            residentKey: 'preferred',
            userVerification: 'preferred',
        },
    });

    // Persist challenge to session
    const session = await getSession();
    session.passkeyChallenge = options.challenge;
    await session.save();

    return options;
}

/**
 * Verify the registration response and store the new passkey in the database.
 */
export async function verifyPasskeyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    name: string
): Promise<{ success: boolean; error?: string }> {
    const session = await getSession();
    const challenge = session.passkeyChallenge;

    if (!challenge) {
        return { success: false, error: 'Registration challenge not found or expired' };
    }

    const { rpID, origin } = getRpDetails();

    let verification;
    try {
        verification = await verifyRegistrationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: false,
        });
    } catch (err) {
        console.error('Passkey registration verification error:', err);
        return { success: false, error: 'Passkey verification failed' };
    }

    if (!verification.verified || !verification.registrationInfo) {
        return { success: false, error: 'Passkey verification failed' };
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    await prisma.$transaction([
        prisma.passkey.create({
            data: {
                userId,
                name: name.trim() || 'Passkey',
                credentialID: credential.id,
                credentialPublicKey: Buffer.from(credential.publicKey),
                counter: credential.counter,
                deviceType: credentialDeviceType,
                backedUp: credentialBackedUp,
                transports: (credential.transports ?? []) as string[],
            },
        }),
        prisma.user.update({
            where: { id: userId },
            data: { passkeyEnabled: true },
        }),
        prisma.auditLog.create({
            data: {
                userId,
                action: 'PASSKEY_REGISTERED',
                details: { name: name.trim() || 'Passkey', deviceType: credentialDeviceType, backedUp: credentialBackedUp },
            },
        }),
    ]);

    // Clear challenge
    session.passkeyChallenge = undefined;
    await session.save();

    return { success: true };
}

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Generate WebAuthn authentication options.
 * If email is provided, scope allowCredentials to that user's passkeys.
 * Stores the challenge + optional userId in the session.
 */
export async function generatePasskeyAuthenticationOptions(email?: string) {
    const { rpID } = getRpDetails();

    let userId: string | undefined;
    let allowCredentials: { id: string; transports: AuthenticatorTransportFuture[] }[] = [];

    if (email) {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, passkeys: { select: { credentialID: true, transports: true } } },
        });

        if (user && user.passkeys.length > 0) {
            userId = user.id;
            allowCredentials = user.passkeys.map((p) => ({
                id: p.credentialID,
                transports: p.transports as AuthenticatorTransportFuture[],
            }));
        }
    }

    const options = await generateAuthenticationOptions({
        rpID,
        allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
        userVerification: 'preferred',
    });

    const session = await getSession();
    session.passkeyChallenge = options.challenge;
    session.passkeyAuthUserId = userId;
    await session.save();

    return options;
}

/**
 * Verify the authentication assertion and create a full session.
 */
export async function verifyPasskeyAuthentication(
    response: AuthenticationResponseJSON,
    deviceInfo: string,
    ipAddress: string
): Promise<{ success: boolean; error?: string; userId?: string; email?: string; sessionToken?: string }> {
    const session = await getSession();
    const challenge = session.passkeyChallenge;

    if (!challenge) {
        return { success: false, error: 'Authentication challenge not found or expired' };
    }

    // Find the passkey by credential ID
    const passkey = await prisma.passkey.findUnique({
        where: { credentialID: response.id },
        include: { user: { select: { id: true, email: true, isActive: true, lockoutUntil: true } } },
    });

    if (!passkey) {
        return { success: false, error: 'Passkey not registered' };
    }

    if (!passkey.user.isActive) {
        return { success: false, error: 'Account is disabled' };
    }

    if (passkey.user.lockoutUntil && passkey.user.lockoutUntil > new Date()) {
        const remaining = Math.ceil((passkey.user.lockoutUntil.getTime() - Date.now()) / 60000);
        return { success: false, error: `Account temporarily locked. Try again in ${remaining} minute(s).` };
    }

    const { rpID, origin } = getRpDetails();

    let verification;
    try {
        verification = await verifyAuthenticationResponse({
            response,
            expectedChallenge: challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
                id: passkey.credentialID,
                publicKey: new Uint8Array(passkey.credentialPublicKey),
                counter: Number(passkey.counter),
                transports: passkey.transports as AuthenticatorTransportFuture[],
            },
            requireUserVerification: false,
        });
    } catch (err) {
        console.error('Passkey authentication verification error:', err);
        return { success: false, error: 'Passkey authentication failed' };
    }

    if (!verification.verified) {
        return { success: false, error: 'Passkey authentication failed' };
    }

    // Update counter (replay protection)
    await prisma.$transaction([
        prisma.passkey.update({
            where: { id: passkey.id },
            data: {
                counter: verification.authenticationInfo.newCounter,
                lastUsedAt: new Date(),
            },
        }),
        prisma.auditLog.create({
            data: {
                userId: passkey.userId,
                action: 'PASSKEY_USED',
                ipAddress,
                userAgent: deviceInfo,
                details: { passkeyName: passkey.name },
            },
        }),
    ]);

    // Create full session
    const sessionToken = await createSession(passkey.userId, passkey.user.email, deviceInfo, ipAddress);

    session.userId = passkey.userId;
    session.email = passkey.user.email;
    session.sessionToken = sessionToken;
    session.isLoggedIn = true;
    session.passkeyChallenge = undefined;
    session.passkeyAuthUserId = undefined;
    await session.save();

    return {
        success: true,
        userId: passkey.userId,
        email: passkey.user.email,
        sessionToken,
    };
}

// ============================================================================
// MANAGEMENT
// ============================================================================

/** List all passkeys for the authenticated user */
export async function listPasskeys(userId: string) {
    return prisma.passkey.findMany({
        where: { userId },
        select: {
            id: true,
            name: true,
            deviceType: true,
            backedUp: true,
            transports: true,
            createdAt: true,
            lastUsedAt: true,
        },
        orderBy: { createdAt: 'asc' },
    });
}

/** Delete a specific passkey by ID (must belong to user) */
export async function deletePasskey(
    passkeyId: string,
    userId: string
): Promise<{ success: boolean; error?: string }> {
    const passkey = await prisma.passkey.findFirst({
        where: { id: passkeyId, userId },
    });

    if (!passkey) {
        return { success: false, error: 'Passkey not found' };
    }

    const remaining = await prisma.passkey.count({ where: { userId } });

    await prisma.$transaction([
        prisma.passkey.delete({ where: { id: passkeyId } }),
        // If no passkeys remain, disable passkeyEnabled
        ...(remaining <= 1
            ? [prisma.user.update({ where: { id: userId }, data: { passkeyEnabled: false } })]
            : []),
        prisma.auditLog.create({
            data: {
                userId,
                action: 'PASSKEY_REMOVED',
                details: { passkeyName: passkey.name },
            },
        }),
    ]);

    return { success: true };
}
