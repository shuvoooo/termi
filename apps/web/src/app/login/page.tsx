'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Terminal, Eye, EyeOff, Loader2, Mail, Smartphone, KeyRound, RefreshCw, CheckCircle } from 'lucide-react';

type TwoFactorMethod = 'TOTP' | 'EMAIL' | null;

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const formRef = useRef<HTMLFormElement>(null);

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [requires2FA, setRequires2FA] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<TwoFactorMethod>(null);
    const [code, setCode] = useState('');
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);

    // Show verified / error banners from email verification redirects
    useEffect(() => {
        if (searchParams.get('verified') === '1') {
            setInfo('Email verified successfully. You can now sign in.');
        }
        if (searchParams.get('error') === 'verification-failed') {
            setError(searchParams.get('message') || 'Email verification failed.');
        }
    }, [searchParams]);

    // Browser Credential Management API — auto-fill on load
    useEffect(() => {
        if (typeof window === 'undefined' || !('credentials' in navigator)) return;
        navigator.credentials
            .get({ password: true, mediation: 'optional' } as CredentialRequestOptions)
            .then((cred) => {
                if (cred && cred.type === 'password') {
                    const pc = cred as PasswordCredential;
                    setFormData({ email: pc.id, password: (pc as any).password || '' });
                }
            })
            .catch(() => {}); // Silently ignore — not all browsers support this
    }, []);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => clearInterval(t);
    }, [resendCooldown]);

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
                setTwoFactorMethod(data.data.twoFactorMethod || 'TOTP');
                setInfo(data.data.message || '');
                setLoading(false);
                return;
            }

            // Store credentials in browser keychain / OS password manager
            if (typeof window !== 'undefined' && 'PasswordCredential' in window) {
                try {
                    const cred = new PasswordCredential({
                        id: formData.email,
                        password: formData.password,
                        name: formData.email,
                    });
                    await navigator.credentials.store(cred);
                } catch { /* not supported or user declined */ }
            }

            router.push('/dashboard');
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/auth/verify-2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
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

    const handleResendEmail = async () => {
        setResendLoading(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'PUT' });
            const data = await res.json();
            if (data.success) {
                setInfo('A new verification code has been sent to your email.');
                setResendCooldown(60);
            } else {
                setError(data.error || 'Failed to resend code');
            }
        } catch {
            setError('Failed to resend code');
        } finally {
            setResendLoading(false);
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
                        <span className="text-2xl font-bold gradient-text">Termi</span>
                    </div>

                    {info && (
                        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            {info}
                        </div>
                    )}

                    {!requires2FA ? (
                        <>
                            <h1 className="text-2xl font-bold text-center mb-2">Welcome back</h1>
                            <p className="text-dark-400 text-center mb-8">Sign in to your account to continue</p>

                            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label htmlFor="email" className="label">Email Address</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="username"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="input"
                                        placeholder="you@example.com"
                                        required
                                        autoComplete="username email"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="password" className="label">Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            id="password"
                                            name="password"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}

                                <button type="submit" disabled={loading} className="btn btn-primary w-full">
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Sign In'}
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-center mb-4">
                                {twoFactorMethod === 'EMAIL'
                                    ? <Mail className="w-8 h-8 text-primary-400" />
                                    : <Smartphone className="w-8 h-8 text-primary-400" />
                                }
                            </div>
                            <h1 className="text-2xl font-bold text-center mb-2">Two-Factor Authentication</h1>
                            <p className="text-dark-400 text-center mb-6 text-sm">
                                {isRecoveryMode
                                    ? 'Enter one of your recovery codes (format: XXXX-XXXX)'
                                    : twoFactorMethod === 'EMAIL'
                                        ? 'Enter the 6-digit code sent to your email'
                                        : 'Enter the 6-digit code from your authenticator app'}
                            </p>

                            {info && !isRecoveryMode && (
                                <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm">
                                    {info}
                                </div>
                            )}

                            <form onSubmit={handleVerify} className="space-y-4">
                                <div>
                                    <label htmlFor="code" className="label">
                                        {isRecoveryMode ? 'Recovery Code' : 'Verification Code'}
                                    </label>
                                    <input
                                        type="text"
                                        id="code"
                                        value={code}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            if (isRecoveryMode) {
                                                // Allow XXXX-XXXX format
                                                setCode(v.toUpperCase().slice(0, 9));
                                            } else {
                                                setCode(v.replace(/\D/g, '').slice(0, 6));
                                            }
                                        }}
                                        className="input text-center text-2xl tracking-widest font-mono"
                                        placeholder={isRecoveryMode ? 'XXXX-XXXX' : '000000'}
                                        required
                                        autoComplete="one-time-code"
                                        inputMode={isRecoveryMode ? 'text' : 'numeric'}
                                        maxLength={isRecoveryMode ? 9 : 6}
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading || (isRecoveryMode ? code.length < 8 : code.length !== 6)}
                                    className="btn btn-primary w-full"
                                >
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify'}
                                </button>

                                {/* Resend for email OTP */}
                                {twoFactorMethod === 'EMAIL' && !isRecoveryMode && (
                                    <button
                                        type="button"
                                        onClick={handleResendEmail}
                                        disabled={resendLoading || resendCooldown > 0}
                                        className="btn btn-ghost w-full flex items-center justify-center gap-2"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${resendLoading ? 'animate-spin' : ''}`} />
                                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                                    </button>
                                )}

                                {/* Recovery code toggle (for TOTP only) */}
                                {twoFactorMethod === 'TOTP' && (
                                    <button
                                        type="button"
                                        onClick={() => { setIsRecoveryMode(!isRecoveryMode); setCode(''); setError(''); }}
                                        className="btn btn-ghost w-full flex items-center justify-center gap-2"
                                    >
                                        <KeyRound className="w-4 h-4" />
                                        {isRecoveryMode ? 'Use authenticator app instead' : 'Use a recovery code'}
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() => { setRequires2FA(false); setCode(''); setError(''); setInfo(''); setIsRecoveryMode(false); }}
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
