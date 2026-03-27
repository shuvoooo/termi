import type { Metadata } from 'next';
import Link from 'next/link';
import {
    Terminal,
    Shield,
    Smartphone,
    Server,
    Lock,
    Zap,
    ArrowRight,
    Github,
    Linkedin,
    Mail,
} from 'lucide-react';

export const metadata: Metadata = {
    title: 'Termi - Secure Server Management',
    description:
        'Termi is an open-source, self-hosted server management platform. Access your Linux and Windows servers via SSH, SCP, RDP, and VNC directly from your browser with enterprise-grade security.',
    alternates: {
        canonical: '/',
    },
    openGraph: {
        title: 'Termi - Secure Server Management',
        description:
            'Open-source self-hosted platform to manage servers via SSH, SCP, RDP, and VNC from your browser. Built with AES-256-GCM encryption and TOTP 2FA.',
        url: '/',
        type: 'website',
    },
};

export default function HomePage() {
    return (
        <div className="min-h-screen bg-linear-to-br from-dark-950 via-dark-900 to-dark-950">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 z-50 glass">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                                <Terminal className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold gradient-text">Termi</span>
                        </div>

                        <nav className="hidden md:flex items-center gap-6">
                            <Link href="#features" className="text-dark-300 hover:text-white transition-colors">
                                Features
                            </Link>
                            <Link href="#security" className="text-dark-300 hover:text-white transition-colors">
                                Security
                            </Link>
                            <Link href="https://github.com/shuvoooo/termi" className="text-dark-300 hover:text-white transition-colors">
                                GitHub
                            </Link>
                        </nav>

                        <div className="flex items-center gap-3">
                            <Link href="/login" className="btn btn-ghost btn-sm">
                                Login
                            </Link>
                            <Link href="/register" className="btn btn-primary btn-sm">
                                Get Started
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
                <div className="absolute inset-0 overflow-hidden">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
                </div>

                <div className="relative max-w-5xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/20 mb-8">
                        <Shield className="w-4 h-4 text-primary-400" />
                        <span className="text-sm text-primary-300">Open Source & Self-Hosted</span>
                    </div>

                    <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
                        Manage Your Servers
                        <span className="block mt-2 gradient-text">Securely from Anywhere</span>
                    </h1>

                    <p className="text-lg sm:text-xl text-dark-300 max-w-2xl mx-auto mb-10">
                        SSH, SCP, RDP, and VNC access directly from your browser.
                        Zero-trust security with end-to-end encryption and TOTP 2FA.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/register" className="btn btn-primary btn-lg glow-hover group">
                            Start Free
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <Link href="#features" className="btn btn-secondary btn-lg">
                            Learn More
                        </Link>
                    </div>

                    {/* Protocol badges */}
                    <div className="flex items-center justify-center gap-3 mt-12">
                        <span className="badge protocol-ssh px-3 py-1">SSH</span>
                        <span className="badge protocol-scp px-3 py-1">SCP</span>
                        <span className="badge protocol-rdp px-3 py-1">RDP</span>
                        <span className="badge protocol-vnc px-3 py-1">VNC</span>
                    </div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                            Everything You Need
                        </h2>
                        <p className="text-lg text-dark-300 max-w-2xl mx-auto">
                            A complete solution for managing Linux and Windows servers from any device.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Feature cards */}
                        <div className="card card-hover p-6">
                            <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center mb-4">
                                <Terminal className="w-6 h-6 text-green-400" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">SSH Terminal</h3>
                            <p className="text-dark-400">
                                Full-featured terminal with xterm.js. Support for colors, unicode, and all keyboard shortcuts.
                            </p>
                        </div>

                        <div className="card card-hover p-6">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4">
                                <Server className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">File Manager</h3>
                            <p className="text-dark-400">
                                Browse, upload, download, and manage files via SCP with a modern web interface.
                            </p>
                        </div>

                        <div className="card card-hover p-6">
                            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
                                <Smartphone className="w-6 h-6 text-purple-400" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Remote Desktop</h3>
                            <p className="text-dark-400">
                                Access Windows RDP and Linux VNC directly from your browser or mobile device.
                            </p>
                        </div>

                        <div className="card card-hover p-6">
                            <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center mb-4">
                                <Lock className="w-6 h-6 text-primary-400" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Secure Vault</h3>
                            <p className="text-dark-400">
                                AES-256-GCM encryption for all credentials. Optional master key for extra protection.
                            </p>
                        </div>

                        <div className="card card-hover p-6">
                            <div className="w-12 h-12 rounded-xl bg-yellow-500/20 flex items-center justify-center mb-4">
                                <Shield className="w-6 h-6 text-yellow-400" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Two-Factor Auth</h3>
                            <p className="text-dark-400">
                                TOTP-based 2FA with support for Google Authenticator, Authy, and other apps.
                            </p>
                        </div>

                        <div className="card card-hover p-6">
                            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mb-4">
                                <Zap className="w-6 h-6 text-red-400" />
                            </div>
                            <h3 className="text-lg font-semibold mb-2">Mobile Optimized</h3>
                            <p className="text-dark-400">
                                PWA with virtual keyboard, touch gestures, and mobile-first responsive design.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Security Section */}
            <section id="security" className="py-20 px-4 sm:px-6 lg:px-8 bg-dark-900/50">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                        Security First Design
                    </h2>
                    <p className="text-lg text-dark-300 mb-12">
                        Your credentials are encrypted with AES-256-GCM and never stored in plaintext.
                        We follow zero-trust principles and industry best practices.
                    </p>

                    <div className="grid sm:grid-cols-3 gap-8 text-left">
                        <div>
                            <div className="text-3xl font-bold text-primary-400 mb-2">AES-256</div>
                            <div className="text-dark-400">GCM encryption for all stored credentials</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-primary-400 mb-2">Argon2id</div>
                            <div className="text-dark-400">Password hashing with secure parameters</div>
                        </div>
                        <div>
                            <div className="text-3xl font-bold text-primary-400 mb-2">TOTP 2FA</div>
                            <div className="text-dark-400">Time-based one-time passwords</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 px-4 sm:px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl sm:text-4xl font-bold mb-6">
                        Ready to Get Started?
                    </h2>
                    <p className="text-lg text-dark-300 mb-8">
                        Deploy your own Termi instance in minutes with Docker.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link href="/register" className="btn btn-primary btn-lg">
                            Create Account
                        </Link>
                        <Link href="https://github.com/shuvoooo/termi" className="btn btn-secondary btn-lg">
                            View on GitHub
                        </Link>
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="py-10 px-4 sm:px-6 lg:px-8 border-t border-dark-800">
                <div className="max-w-6xl mx-auto space-y-6">
                    {/* Top row */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-5 h-5 text-primary-500" />
                            <span className="font-semibold">Termi</span>
                            <span className="text-dark-500">•</span>
                            <span className="text-dark-500 text-sm">MIT License</span>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-dark-400">
                            <Link href="/privacy" className="hover:text-white transition-colors">
                                Privacy
                            </Link>
                            <Link href="/security" className="hover:text-white transition-colors">
                                Security
                            </Link>
                            <Link
                                href="https://github.com/shuvoooo/termi"
                                className="hover:text-white transition-colors"
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                GitHub
                            </Link>
                        </div>
                    </div>

                    {/* Developer attribution */}
                    <div className="border-t border-dark-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-dark-400">
                        <p>
                            Built with ❤️ by{' '}
                            <Link
                                href="https://github.com/shuvoooo"
                                className="text-primary-400 hover:text-primary-300 transition-colors font-medium"
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                Shuvo
                            </Link>
                        </p>

                        <div className="flex items-center gap-4">
                            <Link
                                href="https://github.com/shuvoooo"
                                aria-label="GitHub profile of Shuvo"
                                className="hover:text-white transition-colors"
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                <Github className="w-5 h-5" />
                            </Link>
                            <Link
                                href="https://www.linkedin.com/in/shuvoooo/"
                                aria-label="LinkedIn profile of Shuvo"
                                className="hover:text-white transition-colors"
                                rel="noopener noreferrer"
                                target="_blank"
                            >
                                <Linkedin className="w-5 h-5" />
                            </Link>
                            <Link
                                href="mailto:shuvo.punam@gmail.com"
                                aria-label="Email Shuvo"
                                className="hover:text-white transition-colors"
                            >
                                <Mail className="w-5 h-5" />
                            </Link>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}
