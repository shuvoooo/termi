/**
 * GET /api/push/vapid-public-key
 * Returns the VAPID public key for the client to use when subscribing.
 */

import { getCurrentUser } from '@/lib/auth';
import { getVapidPublicKey } from '@/lib/services/push.service';
import { successResponse, errorResponse, unauthorizedResponse } from '@/lib/api';

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return unauthorizedResponse();

    const key = getVapidPublicKey();
    if (!key) {
        return errorResponse('Push notifications are not configured on this server', 503);
    }

    return successResponse({ publicKey: key });
}
