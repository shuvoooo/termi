/**
 * GET /api/groups - List all groups
 * POST /api/groups - Create a new group
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import {
    getServerGroups,
    createServerGroup,
} from '@/lib/services';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
} from '@/lib/api';

const createGroupSchema = z.object({
    name: z.string().min(1, 'Name is required').max(50),
    description: z.string().max(200).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
    icon: z.string().max(50).optional(),
});

export async function GET() {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    try {
        const groups = await getServerGroups(user.id);

        return successResponse({ groups });
    } catch (error) {
        console.error('Get groups error:', error);
        return errorResponse('Failed to fetch groups', 500);
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const validation = await validateBody(request, createGroupSchema);

    if ('error' in validation) {
        return validation.error;
    }

    try {
        const group = await createServerGroup({
            userId: user.id,
            ...validation.data,
        });

        return successResponse({ group }, 201);
    } catch (error) {
        if (error instanceof Error && error.message.includes('already exists')) {
            return errorResponse(error.message, 400);
        }
        console.error('Create group error:', error);
        return errorResponse('Failed to create group', 500);
    }
}
