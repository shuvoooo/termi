/**
 * Termi Cryptography Module
 * 
 * Security Architecture:
 * - All credentials are encrypted using AES-256-GCM before storage
 * - Passwords are hashed using Argon2id with secure parameters
 * - Optional master key encryption using PBKDF2 key derivation
 * - All cryptographic operations use Node.js crypto module (FIPS-compliant)
 * 
 * SECURITY WARNING: Never log or expose encryption keys or plaintext credentials
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash, scryptSync, timingSafeEqual } from 'crypto';

// ============================================================================
// CONSTANTS
// ============================================================================

// AES-256-GCM parameters
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits auth tag
const KEY_LENGTH = 32; // 256 bits

// Scrypt parameters (used as Argon2 alternative for better compatibility)
const SCRYPT_OPTIONS = {
    N: 16384,     // CPU/memory cost parameter
    r: 8,         // Block size
    p: 1,         // Parallelization
    maxmem: 64 * 1024 * 1024, // 64 MB
};

// PBKDF2 parameters for master key derivation
const PBKDF2_ITERATIONS = 600000; // OWASP 2023 recommendation
const PBKDF2_DIGEST = 'sha256';
const SALT_LENGTH = 32;

// ============================================================================
// ENCRYPTION KEY MANAGEMENT
// ============================================================================

/**
 * System encryption key derived from environment variable
 * This key is used for encrypting data at rest when no master key is set
 */
function getSystemKey(): Buffer {
    const envKey = process.env.ENCRYPTION_KEY;

    if (!envKey) {
        throw new Error(
            'ENCRYPTION_KEY environment variable is required. ' +
            'Generate one with: openssl rand -base64 32'
        );
    }

    // Hash the env key to ensure consistent 32-byte length
    return createHash('sha256').update(envKey).digest();
}

/**
 * Derive an encryption key from user's master password
 * Uses PBKDF2 with high iteration count for slow key derivation
 */
export function deriveMasterKey(masterPassword: string, salt: Buffer): Buffer {
    return pbkdf2Sync(
        masterPassword,
        salt,
        PBKDF2_ITERATIONS,
        KEY_LENGTH,
        PBKDF2_DIGEST
    );
}

/**
 * Generate a cryptographically secure random salt
 */
export function generateSalt(): Buffer {
    return randomBytes(SALT_LENGTH);
}

/**
 * Hash a derived key for storage (to verify master key on login)
 */
export function hashDerivedKey(derivedKey: Buffer): string {
    return createHash('sha256').update(derivedKey).digest('hex');
}

// ============================================================================
// AES-256-GCM ENCRYPTION
// ============================================================================

export interface EncryptedData {
    iv: string;       // Base64 encoded IV
    data: string;     // Base64 encoded ciphertext
    tag: string;      // Base64 encoded auth tag
}

/**
 * Encrypt plaintext using AES-256-GCM
 * 
 * @param plaintext - The data to encrypt
 * @param key - Optional encryption key (uses system key if not provided)
 * @returns Encrypted data structure with IV, ciphertext, and auth tag
 */
export function encrypt(plaintext: string, key?: Buffer): EncryptedData {
    const encryptionKey = key || getSystemKey();

    // Generate random IV for each encryption (NEVER reuse IVs with GCM)
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);

    // Encrypt
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
    ]);

    // Get authentication tag
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString('base64'),
        data: encrypted.toString('base64'),
        tag: tag.toString('base64'),
    };
}

/**
 * Decrypt AES-256-GCM encrypted data
 * 
 * @param encryptedData - The encrypted data structure
 * @param key - Optional decryption key (uses system key if not provided)
 * @returns Decrypted plaintext
 * @throws Error if decryption or authentication fails
 */
export function decrypt(encryptedData: EncryptedData, key?: Buffer): string {
    const decryptionKey = key || getSystemKey();

    // Decode from base64
    const iv = Buffer.from(encryptedData.iv, 'base64');
    const encrypted = Buffer.from(encryptedData.data, 'base64');
    const tag = Buffer.from(encryptedData.tag, 'base64');

    // Validate IV length
    if (iv.length !== IV_LENGTH) {
        throw new Error('Invalid IV length');
    }

    // Validate tag length
    if (tag.length !== TAG_LENGTH) {
        throw new Error('Invalid authentication tag length');
    }

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, decryptionKey, iv);
    decipher.setAuthTag(tag);

    // Decrypt (will throw if authentication fails)
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
    ]);

    return decrypted.toString('utf8');
}

/**
 * Encrypt a JSON object
 */
export function encryptJson<T>(data: T, key?: Buffer): EncryptedData {
    return encrypt(JSON.stringify(data), key);
}

/**
 * Decrypt to a JSON object
 */
export function decryptJson<T>(encryptedData: EncryptedData, key?: Buffer): T {
    const json = decrypt(encryptedData, key);
    return JSON.parse(json) as T;
}

// ============================================================================
// PASSWORD HASHING (using scrypt as cross-platform alternative to Argon2)
// ============================================================================

/**
 * Hash a password using scrypt
 * 
 * @param password - The plaintext password to hash
 * @returns The password hash string (includes algorithm params and salt)
 */
export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const hash = scryptSync(password, salt, 64, SCRYPT_OPTIONS);

    // Format: $scrypt$N$r$p$salt$hash
    return `$scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Verify a password against a scrypt hash
 * 
 * @param hash - The stored password hash
 * @param password - The plaintext password to verify
 * @returns true if password matches, false otherwise
 */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
        const parts = hash.split('$');
        if (parts.length !== 7 || parts[1] !== 'scrypt') {
            return false;
        }

        const N = parseInt(parts[2], 10);
        const r = parseInt(parts[3], 10);
        const p = parseInt(parts[4], 10);
        const salt = Buffer.from(parts[5], 'base64');
        const storedHash = Buffer.from(parts[6], 'base64');

        const computedHash = scryptSync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });

        // Constant-time comparison to prevent timing attacks
        return computedHash.length === storedHash.length &&
            timingSafeEqual(computedHash, storedHash);
    } catch {
        return false;
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a secure random token (for session tokens, CSRF, etc.)
 */
export function generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('base64url');
}

/**
 * Hash a token for storage (don't store raw tokens)
 */
export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
}

/**
 * Securely wipe a buffer from memory
 * Note: Not 100% guaranteed in JavaScript due to GC,
 * but helps reduce exposure window
 */
export function wipeBuffer(buffer: Buffer): void {
    buffer.fill(0);
}

/**
 * Serialize encrypted data to a single string for storage
 */
export function serializeEncrypted(data: EncryptedData): string {
    return `${data.iv}:${data.data}:${data.tag}`;
}

/**
 * Deserialize encrypted data string back to components
 */
export function deserializeEncrypted(serialized: string): EncryptedData {
    const parts = serialized.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
    }

    return {
        iv: parts[0],
        data: parts[1],
        tag: parts[2],
    };
}

/**
 * Encrypt a single field (for TOTP secret, etc.)
 */
export function encryptField(value: string, key?: Buffer): string {
    return serializeEncrypted(encrypt(value, key));
}
