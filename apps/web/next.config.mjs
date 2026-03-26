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

    // Prevent Next.js/Turbopack from bundling packages that use native Node.js
    // addons (ssh2 → cpu-features, sshcrypto). They must be required at runtime
    // via the normal Node.js module resolution, not inlined into the bundle.
    serverExternalPackages: ['ssh2', 'cpu-features', 'sshcrypto'],
};

export default nextConfig;
