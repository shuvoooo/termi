/**
 * Server Group Management Service
 */

import { prisma } from '@/lib/db';

// ============================================================================
// TYPES
// ============================================================================

export interface CreateGroupInput {
    userId: string;
    name: string;
    description?: string;
    color?: string;
    icon?: string;
}

export interface UpdateGroupInput {
    name?: string;
    description?: string;
    color?: string;
    icon?: string;
    sortOrder?: number;
}

// ============================================================================
// CREATE
// ============================================================================

export async function createServerGroup(input: CreateGroupInput) {
    const { userId, name, description, color, icon } = input;

    // Check for duplicate name
    const existing = await prisma.serverGroup.findFirst({
        where: { userId, name },
    });

    if (existing) {
        throw new Error('A group with this name already exists');
    }

    // Get max sort order
    const maxOrder = await prisma.serverGroup.aggregate({
        where: { userId },
        _max: { sortOrder: true },
    });

    const group = await prisma.serverGroup.create({
        data: {
            userId,
            name,
            description,
            color,
            icon,
            sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
        },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'GROUP_CREATED',
            resource: `group:${group.id}`,
            details: { name },
        },
    });

    return group;
}

// ============================================================================
// READ
// ============================================================================

export async function getServerGroups(userId: string) {
    return prisma.serverGroup.findMany({
        where: { userId },
        include: {
            _count: {
                select: { servers: true },
            },
        },
        orderBy: { sortOrder: 'asc' },
    });
}

export async function getServerGroupById(groupId: string, userId: string) {
    return prisma.serverGroup.findFirst({
        where: { id: groupId, userId },
        include: {
            servers: {
                select: {
                    id: true,
                    name: true,
                    protocol: true,
                    isFavorite: true,
                },
                orderBy: { name: 'asc' },
            },
        },
    });
}

// ============================================================================
// UPDATE
// ============================================================================

export async function updateServerGroup(
    groupId: string,
    userId: string,
    input: UpdateGroupInput
) {
    // Verify ownership
    const existing = await prisma.serverGroup.findFirst({
        where: { id: groupId, userId },
    });

    if (!existing) {
        return null;
    }

    // Check for duplicate name if changing
    if (input.name && input.name !== existing.name) {
        const duplicate = await prisma.serverGroup.findFirst({
            where: { userId, name: input.name },
        });

        if (duplicate) {
            throw new Error('A group with this name already exists');
        }
    }

    const updated = await prisma.serverGroup.update({
        where: { id: groupId },
        data: input,
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'GROUP_UPDATED',
            resource: `group:${groupId}`,
        },
    });

    return updated;
}

// ============================================================================
// DELETE
// ============================================================================

export async function deleteServerGroup(groupId: string, userId: string) {
    // Verify ownership
    const existing = await prisma.serverGroup.findFirst({
        where: { id: groupId, userId },
        select: { id: true, name: true },
    });

    if (!existing) {
        return false;
    }

    // Note: Deleting group will set server groupId to null (onDelete: SetNull)
    await prisma.serverGroup.delete({
        where: { id: groupId },
    });

    // Audit log
    await prisma.auditLog.create({
        data: {
            userId,
            action: 'GROUP_DELETED',
            resource: `group:${groupId}`,
            details: { name: existing.name },
        },
    });

    return true;
}

// ============================================================================
// REORDER
// ============================================================================

export async function reorderGroups(userId: string, groupIds: string[]) {
    // Update sort order for each group
    await Promise.all(
        groupIds.map((id, index) =>
            prisma.serverGroup.updateMany({
                where: { id, userId },
                data: { sortOrder: index },
            })
        )
    );

    return true;
}
