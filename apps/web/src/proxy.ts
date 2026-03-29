import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    const isDev = process.env.NODE_ENV !== 'production';
    const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:8080';

    // Convert the gateway HTTP/WS URL to both ws: and wss: forms so CSP covers
    // both dev (ws://) and prod (wss://) without opening a wildcard.
    let gatewayWsOrigin = gatewayUrl
        .replace(/^https:\/\//, 'wss://')
        .replace(/^http:\/\//, 'ws://');
    // Also allow the https/http origin for fetch-based health checks
    let gatewayHttpOrigin = gatewayUrl
        .replace(/^wss:\/\//, 'https://')
        .replace(/^ws:\/\//, 'http://');

    // 'unsafe-eval' is only needed in development for Next.js hot reload (webpack eval)
    const scriptSrc = [
        "'self'",
        `'nonce-${nonce}'`,
        ...(isDev ? ["'unsafe-eval'"] : []),
    ].join(' ');

    const csp = [
        "default-src 'self'",
        `connect-src 'self' ${gatewayHttpOrigin} ${gatewayWsOrigin}`,
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",  // Tailwind inlines styles
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "upgrade-insecure-requests",
    ].join('; ');

    // Forward the nonce to server components via a request header
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);
    requestHeaders.set('Content-Security-Policy', csp);

    const response = NextResponse.next({ request: { headers: requestHeaders } });

    // Apply CSP and all other security headers on the response
    response.headers.set('Content-Security-Policy', csp);
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

    return response;
}

export const config = {
    // Run on all routes except static files and Next.js internals
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|icons|manifest.json).*)',
    ],
};
