import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';

export const metadata: Metadata = {
    title: 'Termi - Secure Server Management',
    description: 'Manage your servers securely via SSH, SCP, RDP, and VNC from your browser',
    manifest: '/manifest.json',
    icons: {
        icon: '/favicon.ico',
        apple: '/icons/apple-touch-icon.png',
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
            </head>
            <body className="min-h-screen bg-dark-950 text-white antialiased">
                {children}
            </body>
        </html>
    );
}
