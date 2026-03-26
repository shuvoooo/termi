/**
 * Termi Service Worker
 *
 * Handles:
 * - Web Push notification display
 * - Notification click → focus/open the app
 */

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// ============================================================================
// PUSH EVENT
// ============================================================================

self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload;
    try {
        payload = event.data.json();
    } catch {
        payload = { title: 'Termi Alert', body: event.data.text() };
    }

    const options = {
        body: payload.body || '',
        icon: payload.icon || '/icons/icon-192x192.png',
        badge: payload.badge || '/icons/icon-72x72.png',
        tag: payload.tag || 'termi-alert',
        data: { url: payload.url || '/dashboard' },
        requireInteraction: true,
        actions: [
            { action: 'open', title: 'Open Dashboard' },
            { action: 'dismiss', title: 'Dismiss' },
        ],
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'Termi Alert', options)
    );
});

// ============================================================================
// NOTIFICATION CLICK
// ============================================================================

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'dismiss') return;

    const targetUrl = event.notification.data?.url || '/dashboard';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Focus an existing window if one is open
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Otherwise open a new tab
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});
