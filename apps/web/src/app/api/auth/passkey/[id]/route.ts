/**
 * DELETE /api/auth/passkey/:id  — remove a passkey
 */

import { getCurrentUser, deletePasskey } from '@/lib/auth';
import { successResponse, errorResponse, unauthorizedResponse, notFoundResponse } from '@/lib/api';

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const { id } = await params;

    try {
        const result = await deletePasskey(id, user.id);

        if (!result.success) {
            return notFoundResponse(result.error || 'Passkey not found');
        }

        return successResponse({ message: 'Passkey removed' });
    } catch (err) {
        console.error('Delete passkey error:', err);
        return errorResponse('Failed to remove passkey', 500);
    }
}
