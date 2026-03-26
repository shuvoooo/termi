/**
 * Termi Service Worker
 *
 * Handles:
 * - Offline caching (cache-first for static assets, network-first for pages)
 * - Web Push notification display
 * - Notification click → focus/open the app
 */

const CACHE_NAME = 'termi-v1';
const OFFLINE_URL = '/offline.html';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
    OFFLINE_URL,
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/favicon.ico',
    '/manifest.json',
];

// ============================================================================
// INSTALL — pre-cache shell assets
// ============================================================================

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
    );
    self.skipWaiting();
});

// ============================================================================
// ACTIVATE — clean up old caches
// ============================================================================

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
            )
        ).then(() => self.clients.claim())
    );
});

// ============================================================================
// FETCH — caching strategies
// ============================================================================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin requests
    if (url.origin !== self.location.origin) return;

    // Skip API, auth, and WebSocket upgrade requests — always network
    if (
        url.pathname.startsWith('/api/') ||
        request.headers.get('upgrade') === 'websocket'
    ) {
        return;
    }

    // Static assets (/_next/static/, /icons/, /fonts/) — cache-first
    if (
        url.pathname.startsWith('/_next/static/') ||
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/fonts/') ||
        url.pathname === '/manifest.json' ||
        url.pathname === '/favicon.ico' ||
        url.pathname === '/favicon.png'
    ) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // Navigation requests — network-first with offline fallback
    if (request.mode === 'navigate') {
        event.respondWith(networkFirstWithOfflineFallback(request));
        return;
    }
});

async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        return new Response('Network error', { status: 503 });
    }
}

async function networkFirstWithOfflineFallback(request) {
    try {
        const response = await fetch(request);
        // Cache successful navigations so they work next time
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        // Try cache
        const cached = await caches.match(request);
        if (cached) return cached;
        // Fall back to offline page
        const offline = await caches.match(OFFLINE_URL);
        return offline || new Response('Offline', { status: 503 });
    }
}

// ============================================================================
// PUSH NOTIFICATIONS
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
        badge: payload.badge || '/icons/icon-96x96.png',
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
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow(targetUrl);
            }
        })
    );
});
