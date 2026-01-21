/**
 * Credential Encryption Service
 * 
 * Handles encryption and decryption of server credentials with support for:
 * - System-level encryption (using ENCRYPTION_KEY)
 * - User master key encryption (optional additional layer)
 * 
 * Encryption Hierarchy:
 * 1. If user has master key: credentials encrypted with derived master key
 * 2. Always: data encrypted with system key for storage
 */

import {
    encrypt,
    decrypt,
    deriveMasterKey,
    EncryptedData,
    serializeEncrypted,
    deserializeEncrypted,
} from './crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface ServerCredentials {
    host: string;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    notes?: string;
}

export interface EncryptedCredentials {
    host: string;      // Encrypted + serialized
    username: string;  // Encrypted + serialized
    password?: string; // Encrypted + serialized, if present
    privateKey?: string;
    passphrase?: string;
    notes?: string;
}

export interface EncryptionContext {
    masterKey?: Buffer;  // Derived master key, if user has one
}

// ============================================================================
// CREDENTIAL ENCRYPTION
// ============================================================================

/**
 * Encrypt server credentials for storage
 * 
 * @param credentials - Plaintext credentials
 * @param context - Optional encryption context with master key
 * @returns Encrypted credentials ready for database storage
 */
export function encryptCredentials(
    credentials: ServerCredentials,
    context?: EncryptionContext
): EncryptedCredentials {
    const key = context?.masterKey;

    const encrypted: EncryptedCredentials = {
        host: serializeEncrypted(encrypt(credentials.host, key)),
        username: serializeEncrypted(encrypt(credentials.username, key)),
    };

    if (credentials.password) {
        encrypted.password = serializeEncrypted(encrypt(credentials.password, key));
    }

    if (credentials.privateKey) {
        encrypted.privateKey = serializeEncrypted(encrypt(credentials.privateKey, key));
    }

    if (credentials.passphrase) {
        encrypted.passphrase = serializeEncrypted(encrypt(credentials.passphrase, key));
    }

    if (credentials.notes) {
        encrypted.notes = serializeEncrypted(encrypt(credentials.notes, key));
    }

    return encrypted;
}

/**
 * Decrypt server credentials from storage
 * 
 * @param encrypted - Encrypted credentials from database
 * @param context - Optional decryption context with master key
 * @returns Decrypted plaintext credentials
 */
export function decryptCredentials(
    encrypted: EncryptedCredentials,
    context?: EncryptionContext
): ServerCredentials {
    const key = context?.masterKey;

    const credentials: ServerCredentials = {
        host: decrypt(deserializeEncrypted(encrypted.host), key),
        username: decrypt(deserializeEncrypted(encrypted.username), key),
    };

    if (encrypted.password) {
        credentials.password = decrypt(deserializeEncrypted(encrypted.password), key);
    }

    if (encrypted.privateKey) {
        credentials.privateKey = decrypt(deserializeEncrypted(encrypted.privateKey), key);
    }

    if (encrypted.passphrase) {
        credentials.passphrase = decrypt(deserializeEncrypted(encrypted.passphrase), key);
    }

    if (encrypted.notes) {
        credentials.notes = decrypt(deserializeEncrypted(encrypted.notes), key);
    }

    return credentials;
}

/**
 * Re-encrypt credentials with a new key
 * Used when user sets/changes master key
 */
export function reEncryptCredentials(
    encrypted: EncryptedCredentials,
    oldContext: EncryptionContext | undefined,
    newContext: EncryptionContext | undefined
): EncryptedCredentials {
    // Decrypt with old key
    const credentials = decryptCredentials(encrypted, oldContext);

    // Re-encrypt with new key
    return encryptCredentials(credentials, newContext);
}

// ============================================================================
// MASTER KEY MANAGEMENT
// ============================================================================

/**
 * Create master key context for a user
 */
export function createMasterKeyContext(
    masterPassword: string,
    salt: Buffer
): EncryptionContext {
    return {
        masterKey: deriveMasterKey(masterPassword, salt),
    };
}

/**
 * Encrypt a single field (for TOTP secret, etc.)
 */
export function encryptCredentialField(value: string, context?: EncryptionContext): string {
    return serializeEncrypted(encrypt(value, context?.masterKey));
}

/**
 * Decrypt a single field
 */
export function decryptCredentialField(encrypted: string, context?: EncryptionContext): string {
    return decrypt(deserializeEncrypted(encrypted), context?.masterKey);
}
