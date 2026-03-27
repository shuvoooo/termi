import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Login',
    description: 'Sign in to your Termi account to manage your servers securely via SSH, SCP, RDP, and VNC.',
    robots: {
        index: false,
        follow: false,
    },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
