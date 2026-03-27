import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Create Account',
    description: 'Create your Termi account and start managing your servers securely in minutes.',
    robots: {
        index: false,
        follow: false,
    },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
    return children;
}
