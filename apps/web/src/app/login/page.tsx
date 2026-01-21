'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Terminal, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [requires2FA, setRequires2FA] = useState(false);
    const [totpCode, setTotpCode] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Login failed');
                setLoading(false);
                return;
            }

            if (data.data?.requires2FA) {
                setRequires2FA(true);
                setLoading(false);
                return;
            }

            // Login successful
            router.push('/dashboard');
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const handleVerify2FA = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/verify-2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: totpCode }),
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Verification failed');
                setLoading(false);
                return;
            }

            router.push('/dashboard');
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950">
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                <div className="card p-8">
                    {/* Logo */}
                    <div className="flex items-center justify-center gap-3 mb-8">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
                            <Terminal className="w-7 h-7 text-white" />
                        </div>
                        <span className="text-2xl font-bold gradient-text">Termo</span>
                    </div>

                    {!requires2FA ? (
                        <>
                            <h1 className="text-2xl font-bold text-center mb-2">Welcome back</h1>
                            <p className="text-dark-400 text-center mb-8">
                                Sign in to your account to continue
                            </p>

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label htmlFor="email" className="label">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        value={formData.email}
                                        onChange={(e) =>
                                            setFormData({ ...formData, email: e.target.value })
                                        }
                                        className="input"
                                        placeholder="you@example.com"
                                        required
                                        autoComplete="email"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="password" className="label">
                                        Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            value={formData.password}
                                            onChange={(e) =>
                                                setFormData({ ...formData, password: e.target.value })
                                            }
                                            className="input pr-12"
                                            placeholder="••••••••"
                                            required
                                            autoComplete="current-password"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                                        >
                                            {showPassword ? (
                                                <EyeOff className="w-5 h-5" />
                                            ) : (
                                                <Eye className="w-5 h-5" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="btn btn-primary w-full"
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        'Sign In'
                                    )}
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <h1 className="text-2xl font-bold text-center mb-2">
                                Two-Factor Authentication
                            </h1>
                            <p className="text-dark-400 text-center mb-8">
                                Enter the 6-digit code from your authenticator app
                            </p>

                            <form onSubmit={handleVerify2FA} className="space-y-5">
                                <div>
                                    <label htmlFor="code" className="label">
                                        Verification Code
                                    </label>
                                    <input
                                        type="text"
                                        id="code"
                                        value={totpCode}
                                        onChange={(e) =>
                                            setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                                        }
                                        className="input text-center text-2xl tracking-widest font-mono"
                                        placeholder="000000"
                                        required
                                        autoComplete="one-time-code"
                                        inputMode="numeric"
                                        maxLength={6}
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || totpCode.length !== 6}
                                    className="btn btn-primary w-full"
                                >
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        'Verify'
                                    )}
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setRequires2FA(false);
                                        setTotpCode('');
                                        setError('');
                                    }}
                                    className="btn btn-ghost w-full"
                                >
                                    Back to Login
                                </button>
                            </form>
                        </>
                    )}

                    <div className="mt-6 text-center text-sm text-dark-400">
                        Don&apos;t have an account?{' '}
                        <Link href="/register" className="text-primary-400 hover:text-primary-300">
                            Sign up
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
