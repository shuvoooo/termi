/** @type {import('next').NextConfig} */
const nextConfig = {
    // reactStrictMode intentionally disabled: React 18 StrictMode double-mounts
    // effects in development, which causes WebSocket connections to be immediately
    // closed and re-opened. For persistent connections (WebSocket/RDP/SSH) this
    // produces the ready→closed pattern. Use the React DevTools Profiler instead.
    reactStrictMode: false,
    poweredByHeader: false,

    // Standalone output for Docker
    output: 'standalone',

    // Security headers
    async headers() {
        const gatewayOrigin = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:4000';
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=31536000; includeSubDomains; preload',
                    },
                    {
                        key: 'Content-Security-Policy',
                        value: [
                            "default-src 'self'",
                            `connect-src 'self' ${gatewayOrigin} wss: ws:`,
                            "script-src 'self' 'unsafe-eval'",   // 'unsafe-eval' needed by Next.js dev
                            "style-src 'self' 'unsafe-inline'",  // Tailwind inlines styles
                            "img-src 'self' data: blob:",
                            "font-src 'self'",
                            "frame-src 'none'",
                            "object-src 'none'",
                            "base-uri 'self'",
                            "form-action 'self'",
                            "upgrade-insecure-requests",
                        ].join('; '),
                    },
                    {
                        key: 'Cross-Origin-Opener-Policy',
                        value: 'same-origin',
                    },
                    {
                        key: 'Cross-Origin-Resource-Policy',
                        value: 'same-origin',
                    },
                ],
            },
        ];
    },

    // Environment variables exposed to client
    env: {
        NEXT_PUBLIC_APP_NAME: 'Termi',
        NEXT_PUBLIC_APP_VERSION: '1.0.0',
    },
};

export default nextConfig;
