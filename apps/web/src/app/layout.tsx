import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
    title: 'Termi - Secure Server Management',
    description: 'Manage your servers securely via SSH, SCP, RDP, and VNC from your browser',
    manifest: '/manifest.json',
    icons: {
        icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
            { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        ],
        apple: [
            { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
    },
    appleWebApp: {
        capable: true,
        title: 'Termi',
        statusBarStyle: 'black-translucent',
    },
    openGraph: {
        title: 'Termi - Secure Server Management',
        description: 'Manage your servers securely via SSH, SCP, RDP, and VNC from your browser',
        type: 'website',
    },
    robots: {
        index: true,
        follow: true,
    },
};

export const viewport: Viewport = {
    themeColor: '#0f172a',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const nonce = (await headers()).get('x-nonce') ?? '';

    return (
        <html lang="en" className="dark">
            <head>
                {/* Propagate the per-request nonce so Next.js can apply it to
                    any inline scripts it injects during hydration */}
                <meta name="csp-nonce" content={nonce} />
                {/* Microsoft tile */}
                <meta name="msapplication-TileColor" content="#0f172a" />
                <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
            </head>
            <body className="min-h-screen bg-dark-950 text-white antialiased">
                {children}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(err) {
      console.warn('SW registration failed:', err);
    });
  });
}
                        `.trim(),
                    }}
                />
            </body>
        </html>
    );
}
