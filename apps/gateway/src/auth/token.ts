/**
 * Token Validation for Gateway
 * 
 * Validates JWT tokens issued by the web app for establishing connections.
 */

import * as jose from 'jose';

// ============================================================================
// TYPES
// ============================================================================

export interface TokenPayload {
    userId: string;
    serverId: string;
    protocol: 'ssh' | 'scp' | 'rdp' | 'vnc';
    host: string;
    port: number;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    displayWidth?: number;
    displayHeight?: number;
    colorDepth?: number;
    exp: number;
}

// ============================================================================
// TOKEN VALIDATION
// ============================================================================

const JWT_SECRET = new TextEncoder().encode(
    process.env.GATEWAY_JWT_SECRET || 'gateway-secret-key-change-in-production'
);

/**
 * Validate and decode a connection token
 */
export async function validateToken(token: string): Promise<TokenPayload> {
    try {
        const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
            algorithms: ['HS256'],
        });

        // Validate required fields
        if (!payload.userId || !payload.serverId || !payload.host || !payload.username) {
            throw new Error('Invalid token payload');
        }

        return payload as unknown as TokenPayload;
    } catch (error) {
        if (error instanceof jose.errors.JWTExpired) {
            throw new Error('Token expired');
        }
        throw new Error('Invalid token');
    }
}

/**
 * Generate a connection token (used by web app)
 */
export async function generateToken(payload: Omit<TokenPayload, 'exp'>): Promise<string> {
    const token = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime('5m') // Token valid for 5 minutes
        .sign(JWT_SECRET);

    return token;
}
