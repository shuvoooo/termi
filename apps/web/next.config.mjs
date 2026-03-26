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

    // Environment variables exposed to client
    env: {
        NEXT_PUBLIC_APP_NAME: 'Termi',
        NEXT_PUBLIC_APP_VERSION: '1.0.0',
    },
};

export default nextConfig;
