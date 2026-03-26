/**
 * POST /api/groups/reorder - Reorder groups by providing an ordered array of IDs
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { reorderGroups } from '@/lib/services';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
} from '@/lib/api';

const reorderSchema = z.object({
    groupIds: z.array(z.string()).min(1),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();

    if (!user) {
        return unauthorizedResponse();
    }

    const validation = await validateBody(request, reorderSchema);

    if ('error' in validation) {
        return validation.error;
    }

    try {
        await reorderGroups(user.id, validation.data.groupIds);
        return successResponse({ message: 'Groups reordered' });
    } catch (error) {
        console.error('Reorder groups error:', error);
        return errorResponse('Failed to reorder groups', 500);
    }
}

