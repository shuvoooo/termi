/**
 * POST /api/push/subscribe  — save a push subscription
 * DELETE /api/push/subscribe — remove a push subscription
 */

import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { saveSubscription, removeSubscription } from '@/lib/services/push.service';
import {
    validateBody,
    successResponse,
    errorResponse,
    unauthorizedResponse,
} from '@/lib/api';

const subscribeSchema = z.object({
    endpoint: z.string().url(),
    keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
    }),
    deviceLabel: z.string().max(100).optional(),
});

const unsubscribeSchema = z.object({
    endpoint: z.string().url(),
});

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const result = await validateBody(request, subscribeSchema);
    if ('error' in result) return result.error;

    const { endpoint, keys, deviceLabel } = result.data;

    try {
        await saveSubscription(user.id, { endpoint, keys }, deviceLabel);
        return successResponse({ subscribed: true });
    } catch (err) {
        console.error('[Push] Failed to save subscription:', err);
        return errorResponse('Failed to save push subscription', 500);
    }
}

export async function DELETE(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const result = await validateBody(request, unsubscribeSchema);
    if ('error' in result) return result.error;

    try {
        await removeSubscription(result.data.endpoint, user.id);
        return successResponse({ unsubscribed: true });
    } catch (err) {
        console.error('[Push] Failed to remove subscription:', err);
        return errorResponse('Failed to remove push subscription', 500);
    }
}
