/**
 * Web Push Notification Service
 *
 * Manages VAPID-based push subscriptions and sending push notifications
 * to subscribed devices.
 */

import webpush from 'web-push';
import { prisma } from '@/lib/db';

// ============================================================================
// VAPID SETUP
// ============================================================================

let vapidInitialized = false;

function ensureVapidKeys() {
    if (vapidInitialized) return;

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@termi.app';

    if (!publicKey || !privateKey) {
        // In dev, generate ephemeral keys so we don't crash — push won't work
        // without real keys set in env, but the app will still start.
        console.warn(
            '[Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set. ' +
            'Push notifications are disabled. Run `npx web-push generate-vapid-keys` and set them in .env.'
        );
        return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidInitialized = true;
}

export function getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

export interface PushSubscriptionData {
    endpoint: string;
    keys: {
        p256dh: string;
        auth: string;
    };
}

export async function saveSubscription(
    userId: string,
    subscription: PushSubscriptionData,
    deviceLabel?: string
): Promise<void> {
    await prisma.pushSubscription.upsert({
        where: { endpoint: subscription.endpoint },
        update: {
            p256dhKey: subscription.keys.p256dh,
            authKey: subscription.keys.auth,
            deviceLabel: deviceLabel ?? null,
            updatedAt: new Date(),
        },
        create: {
            userId,
            endpoint: subscription.endpoint,
            p256dhKey: subscription.keys.p256dh,
            authKey: subscription.keys.auth,
            deviceLabel: deviceLabel ?? null,
        },
    });
}

export async function removeSubscription(endpoint: string, userId: string): Promise<void> {
    await prisma.pushSubscription.deleteMany({
        where: { endpoint, userId },
    });
}

export async function getUserSubscriptions(userId: string) {
    return prisma.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
    });
}

// ============================================================================
// SENDING NOTIFICATIONS
// ============================================================================

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    url?: string;
}

/**
 * Send a push notification to all of a user's subscribed devices.
 * Automatically removes expired/invalid subscriptions.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
    ensureVapidKeys();
    if (!vapidInitialized) return;

    const subscriptions = await getUserSubscriptions(userId);
    if (subscriptions.length === 0) return;

    const data = JSON.stringify({
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/icons/icon-192x192.png',
        badge: payload.badge || '/icons/icon-72x72.png',
        tag: payload.tag,
        url: payload.url || '/dashboard',
    });

    const results = await Promise.allSettled(
        subscriptions.map(sub =>
            webpush.sendNotification(
                {
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
                },
                data
            )
        )
    );

    // Clean up invalid/expired subscriptions (410 Gone, 404 Not Found)
    const toRemove: string[] = [];
    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            const err = result.reason as { statusCode?: number };
            if (err?.statusCode === 410 || err?.statusCode === 404) {
                toRemove.push(subscriptions[i].endpoint);
            }
        }
    });

    if (toRemove.length > 0) {
        await prisma.pushSubscription.deleteMany({
            where: { endpoint: { in: toRemove } },
        });
    }
}
