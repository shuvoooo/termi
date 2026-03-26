/**
 * Token Validation for Gateway
 *
 * Validates JWE tokens (A256GCM) issued by the web app.
 * Credentials are decrypted only inside the gateway process.
 */

import * as jose from 'jose';
import { createHash } from 'crypto';

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
    password?: string | null;
    privateKey?: string | null;
    passphrase?: string | null;
    displayWidth?: number;
    displayHeight?: number;
    colorDepth?: number;
    exp: number;
}

// ============================================================================
// KEY DERIVATION
// ============================================================================

function getJWEKey(): Uint8Array {
    const secret = process.env.GATEWAY_JWT_SECRET;
    if (!secret) throw new Error('GATEWAY_JWT_SECRET is required');
    return new Uint8Array(createHash('sha256').update(secret).digest());
}

// ============================================================================
// TOKEN VALIDATION
// ============================================================================

/**
 * Validate and decrypt a JWE connection token.
 * Only the gateway (holding the key) can read the payload.
 */
export async function validateToken(token: string): Promise<TokenPayload> {
    try {
        const key = getJWEKey();
        const { payload } = await jose.jwtDecrypt(token, key, {
            contentEncryptionAlgorithms: ['A256GCM'],
        });

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
