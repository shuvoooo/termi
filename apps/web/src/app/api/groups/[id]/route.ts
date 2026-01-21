/**
 * GET /api/groups/[id] - Get group details
 * PATCH /api/groups/[id] - Update group
 * DELETE /api/groups/[id] - Delete group
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import {
    getServerGroupById,
    updateServerGroup,
    deleteServerGroup,
} from '@/lib/services';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
    notFoundResponse,
} from '@/lib/api';

const updateGroupSchema = z.object({
    name: z.string().min(1).max(50).optional(),
    description: z.string().max(200).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    icon: z.string().max(50).optional(),
    sortOrder: z.number().int().min(0).optional(),
});

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        const group = await getServerGroupById(id, user.id);

        if (!group) {
            return notFoundResponse('Group not found');
        }

        return successResponse({ group });
    } catch (error) {
        console.error('Get group error:', error);
        return errorResponse('Failed to fetch group', 500);
    }
}

export async function PATCH(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;
    const validation = await validateBody(request, updateGroupSchema);

    if ('error' in validation) {
        return validation.error;
    }

    try {
        const group = await updateServerGroup(id, user.id, validation.data);

        if (!group) {
            return notFoundResponse('Group not found');
        }

        return successResponse({ group });
    } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
            return errorResponse(error.message, 400);
        }
        console.error('Update group error:', error);
        return errorResponse('Failed to update group', 500);
    }
}

export async function DELETE(request: Request, { params }: RouteParams) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const { id } = await params;

    try {
        const deleted = await deleteServerGroup(id, user.id);

        if (!deleted) {
            return notFoundResponse('Group not found');
        }

        return successResponse({ message: 'Group deleted' });
    } catch (error) {
        console.error('Delete group error:', error);
        return errorResponse('Failed to delete group', 500);
    }
}
