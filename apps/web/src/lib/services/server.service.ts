/**
 * Server Management Service
 * 
 * Handles CRUD operations for server credentials with encryption.
 */

import { prisma } from '@/lib/db';
import { Protocol } from '@/app/generated/prisma/client';
import {
    encryptCredentials,
    decryptCredentials,
    EncryptionContext,
    ServerCredentials,
} from '@/lib/crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateServerInput {
    userId: string;
    name: string;
    description?: string;
    groupId?: string;
    host: string;
    port: number;
    protocol: Protocol;
    username: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    notes?: string;
    tags?: string[];
    displayWidth?: number;
    displayHeight?: number;
    colorDepth?: number;
}

export interface UpdateServerInput {
    name?: string;
    description?: string;
    groupId?: string | null;
    host?: string;
    port?: number;
    protocol?: Protocol;
    username?: string;
    password?: string;
    privateKey?: string;
    passphrase?: string;
    notes?: string;
    tags?: string[];
    displayWidth?: number;
    displayHeight?: number;
    colorDepth?: number;
    isFavorite?: boolean;
}

export interface ServerListItem {
    id: string;
    name: string;
    description?: string | null;
    protocol: Protocol;
    tags: string[];
    isFavorite: boolean;
    lastUsedAt: Date | null;
    hasPassword: boolean;
    host: string;
    username: string;
    port: number;
    group: {
        id: string;
        name: string;
        color: string | null;
    } | null;
}

// ============================================================================
// CREATE
// ============================================================================

export async function createServer(
    input: CreateServerInput,
    encryptionContext?: EncryptionContext
) {
    const { userId, name, description, groupId, host, port, protocol, username, password, privateKey, passphrase, notes, tags, ...settings } = input;

    // Verify the group belongs to this user before assigning
    if (groupId) {
        const group = await prisma.serverGroup.findFirst({ where: { id: groupId, userId } });
        if (!group) throw new Error('Group not found or access denied');
    }

    // Encrypt sensitive credentials
    const credentials: ServerCredentials = {
        host,
        username,
        password,
        privateKey,
        passphrase,
        notes,
    };

    const encrypted = encryptCredentials(credentials, encryptionContext);

    const server = await prisma.server.create({
        data: {
            userId,
            name,
            description,
            groupId,
            host: encrypted.host,
            port,
            protocol,
            username: encrypted.username,
            password: encrypted.password,
            privateKey: encrypted.privateKey,
            passphrase: encrypted.passphrase,
            notes: encrypted.notes,
            tags: tags || [],
            ...settings,
        },
        select: {
            id: true,
            name: true,
            protocol: true,
        },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SERVER_CREATED',
            resource: `server:${server.id}`,
            details: { name: server.name, protocol: server.protocol },
        },
    });

    return server;
}

// ============================================================================
// READ
// ============================================================================

export async function getServers(userId: string): Promise<ServerListItem[]> {
    const rows = await prisma.server.findMany({
        where: { userId },
        select: {
            id: true,
            name: true,
            description: true,
            protocol: true,
            tags: true,
            isFavorite: true,
            lastUsedAt: true,
            password: true,
            host: true,
            username: true,
            port: true,
            group: {
                select: {
                    id: true,
                    name: true,
                    color: true,
                },
            },
        },
        orderBy: [
            { isFavorite: 'desc' },
            { lastUsedAt: 'desc' },
            { name: 'asc' },
        ],
    });
    return rows.map(({ password, host, username, ...rest }) => {
        const creds = decryptCredentials({ host, username });
        return { ...rest, hasPassword: !!password, host: creds.host, username: creds.username };
    });
}

export async function getServerById(
    serverId: string,
    userId: string,
    encryptionContext?: EncryptionContext
) {
    const server = await prisma.server.findFirst({
        where: { id: serverId, userId },
        include: {
            group: {
                select: {
                    id: true,
                    name: true,
                    color: true,
                },
            },
        },
    });

    if (!server) {
        return null;
    }

    // Decrypt credentials
    const encrypted = {
        host: server.host,
        username: server.username,
        password: server.password || undefined,
        privateKey: server.privateKey || undefined,
        passphrase: server.passphrase || undefined,
        notes: server.notes || undefined,
    };

    const credentials = decryptCredentials(encrypted, encryptionContext);

    return {
        ...server,
        host: credentials.host,
        username: credentials.username,
        password: credentials.password,
        privateKey: credentials.privateKey,
        passphrase: credentials.passphrase,
        notes: credentials.notes,
    };
}

export async function getServerForConnection(
    serverId: string,
    userId: string,
    encryptionContext?: EncryptionContext
): Promise<ServerCredentials & { id: string; port: number; protocol: Protocol; displayWidth: number | null; displayHeight: number | null; colorDepth: number | null } | null> {
    const server = await prisma.server.findFirst({
        where: { id: serverId, userId },
    });

    if (!server) {
        return null;
    }

    // Update last used
    await prisma.server.update({
        where: { id: serverId },
        data: {
            lastUsedAt: new Date(),
            useCount: { increment: 1 },
        },
    });

    // Decrypt credentials
    const encrypted = {
        host: server.host,
        username: server.username,
        password: server.password || undefined,
        privateKey: server.privateKey || undefined,
        passphrase: server.passphrase || undefined,
        notes: undefined,
    };

    const credentials = decryptCredentials(encrypted, encryptionContext);

    return {
        id: server.id,
        port: server.port,
        protocol: server.protocol,
        displayWidth: server.displayWidth,
        displayHeight: server.displayHeight,
        colorDepth: server.colorDepth,
        ...credentials,
    };
}

// ============================================================================
// UPDATE
// ============================================================================

export async function updateServer(
    serverId: string,
    userId: string,
    input: UpdateServerInput,
    encryptionContext?: EncryptionContext
) {
    // Verify ownership
    const existing = await prisma.server.findFirst({
        where: { id: serverId, userId },
    });

    if (!existing) {
        return null;
    }

    // Verify the new group belongs to this user (if group is being changed)
    if (input.groupId) {
        const group = await prisma.serverGroup.findFirst({ where: { id: input.groupId, userId } });
        if (!group) throw new Error('Group not found or access denied');
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Non-encrypted fields
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.groupId !== undefined) updateData.groupId = input.groupId;
    if (input.port !== undefined) updateData.port = input.port;
    if (input.protocol !== undefined) updateData.protocol = input.protocol;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.displayWidth !== undefined) updateData.displayWidth = input.displayWidth;
    if (input.displayHeight !== undefined) updateData.displayHeight = input.displayHeight;
    if (input.colorDepth !== undefined) updateData.colorDepth = input.colorDepth;
    if (input.isFavorite !== undefined) updateData.isFavorite = input.isFavorite;

    // Encrypted fields - need to re-encrypt if changed
    const needsEncryption = input.host || input.username || input.password ||
        input.privateKey || input.passphrase || input.notes;

    if (needsEncryption) {
        // Get current decrypted values
        const currentEncrypted = {
            host: existing.host,
            username: existing.username,
            password: existing.password || undefined,
            privateKey: existing.privateKey || undefined,
            passphrase: existing.passphrase || undefined,
            notes: existing.notes || undefined,
        };

        const current = decryptCredentials(currentEncrypted, encryptionContext);

        // Merge with new values
        const newCredentials: ServerCredentials = {
            host: input.host ?? current.host,
            username: input.username ?? current.username,
            password: input.password ?? current.password,
            privateKey: input.privateKey ?? current.privateKey,
            passphrase: input.passphrase ?? current.passphrase,
            notes: input.notes ?? current.notes,
        };

        // Re-encrypt
        const encrypted = encryptCredentials(newCredentials, encryptionContext);

        updateData.host = encrypted.host;
        updateData.username = encrypted.username;
        updateData.password = encrypted.password;
        updateData.privateKey = encrypted.privateKey;
        updateData.passphrase = encrypted.passphrase;
        updateData.notes = encrypted.notes;
    }

    const updated = await prisma.server.update({
        where: { id: serverId },
        data: updateData,
        select: {
            id: true,
            name: true,
            protocol: true,
        },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SERVER_UPDATED',
            resource: `server:${serverId}`,
        },
    });

    return updated;
}

// ============================================================================
// DELETE
// ============================================================================

export async function deleteServer(serverId: string, userId: string) {
    // Verify ownership
    const existing = await prisma.server.findFirst({
        where: { id: serverId, userId },
        select: { id: true, name: true },
    });

    if (!existing) {
        return false;
    }

    await prisma.server.delete({
        where: { id: serverId },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'SERVER_DELETED',
            resource: `server:${serverId}`,
            details: { name: existing.name },
        },
    });

    return true;
}

// ============================================================================
// SEARCH
// ============================================================================

export async function searchServers(
    userId: string,
    query: string,
    protocol?: Protocol,
    groupId?: string,
    favoritesOnly?: boolean
): Promise<ServerListItem[]> {
    const rows = await prisma.server.findMany({
        where: {
            userId,
            AND: [
                query ? {
                    OR: [
                        { name: { contains: query, mode: 'insensitive' } },
                        { description: { contains: query, mode: 'insensitive' } },
                        { tags: { has: query } },
                    ],
                } : {},
                protocol ? { protocol } : {},
                groupId ? { groupId } : {},
                favoritesOnly ? { isFavorite: true } : {},
            ],
        },
        select: {
            id: true,
            name: true,
            description: true,
            protocol: true,
            tags: true,
            isFavorite: true,
            lastUsedAt: true,
            password: true,
            host: true,
            username: true,
            port: true,
            group: {
                select: {
                    id: true,
                    name: true,
                    color: true,
                },
            },
        },
        orderBy: [
            { isFavorite: 'desc' },
            { lastUsedAt: 'desc' },
            { name: 'asc' },
        ],
    });
    return rows.map(({ password, host, username, ...rest }) => {
        const creds = decryptCredentials({ host, username });
        return { ...rest, hasPassword: !!password, host: creds.host, username: creds.username };
    });
}

// ============================================================================
// TOGGLE FAVORITE
// ============================================================================

export async function toggleFavorite(serverId: string, userId: string) {
    const server = await prisma.server.findFirst({
        where: { id: serverId, userId },
        select: { isFavorite: true },
    });

    if (!server) {
        return null;
    }

    return prisma.server.update({
        where: { id: serverId },
        data: { isFavorite: !server.isFavorite },
        select: { id: true, isFavorite: true },
    });
}
