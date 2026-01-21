import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'Termo - Secure Server Management',
    description: 'Manage your servers securely via SSH, SCP, RDP, and VNC from your browser',
    manifest: '/manifest.json',
    icons: {
        icon: '/favicon.ico',
        apple: '/icons/apple-touch-icon.png',
    },
    openGraph: {
        title: 'Termo - Secure Server Management',
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

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className="dark">
            <body className="min-h-screen bg-dark-950 text-white antialiased">
                {children}
            </body>
        </html>
    );
}
