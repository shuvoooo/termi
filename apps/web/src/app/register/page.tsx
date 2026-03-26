'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Terminal, Eye, EyeOff, Loader2, Check, X } from 'lucide-react';

export default function RegisterPage() {
    const router = useRouter();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: '',
        masterKey: '',
        useMasterKey: false,
    });
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Password requirements
    const passwordRequirements = [
        { label: 'At least 8 characters', met: formData.password.length >= 8 },
        { label: 'Uppercase letter', met: /[A-Z]/.test(formData.password) },
        { label: 'Lowercase letter', met: /[a-z]/.test(formData.password) },
        { label: 'Number', met: /\d/.test(formData.password) },
    ];

    const passwordsMatch =
        formData.password === formData.confirmPassword &&
        formData.confirmPassword.length > 0;

    const allRequirementsMet = passwordRequirements.every((req) => req.met);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!allRequirementsMet) {
            setError('Please meet all password requirements');
            return;
        }

        if (!passwordsMatch) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: formData.email,
                    password: formData.password,
                    masterKey: formData.useMasterKey ? formData.masterKey : undefined,
                }),
            });

            const data = await response.json();

            if (!data.success) {
                setError(data.error || 'Registration failed');
                setLoading(false);
                return;
            }

            // Registration successful, redirect to login
            router.push('/login?registered=true');
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
                        <span className="text-2xl font-bold gradient-text">Termi</span>
                    </div>

                    <h1 className="text-2xl font-bold text-center mb-2">Create Account</h1>
                    <p className="text-dark-400 text-center mb-8">
                        Start managing your servers securely
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
                                    autoComplete="new-password"
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

                            {/* Password requirements */}
                            {formData.password && (
                                <div className="mt-3 space-y-1">
                                    {passwordRequirements.map((req, i) => (
                                        <div
                                            key={i}
                                            className={`flex items-center gap-2 text-xs ${req.met ? 'text-green-400' : 'text-dark-500'
                                                }`}
                                        >
                                            {req.met ? (
                                                <Check className="w-3 h-3" />
                                            ) : (
                                                <X className="w-3 h-3" />
                                            )}
                                            {req.label}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="confirmPassword" className="label">
                                Confirm Password
                            </label>
                            <input
                                type="password"
                                id="confirmPassword"
                                value={formData.confirmPassword}
                                onChange={(e) =>
                                    setFormData({ ...formData, confirmPassword: e.target.value })
                                }
                                className={`input ${formData.confirmPassword &&
                                    (passwordsMatch ? '' : 'input-error')
                                    }`}
                                placeholder="••••••••"
                                required
                                autoComplete="new-password"
                            />
                            {formData.confirmPassword && !passwordsMatch && (
                                <p className="error-text">Passwords do not match</p>
                            )}
                        </div>

                        {/* Master Key Option */}
                        <div className="p-4 rounded-lg bg-dark-900/50 border border-dark-700">
                            <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.useMasterKey}
                                    onChange={(e) =>
                                        setFormData({ ...formData, useMasterKey: e.target.checked })
                                    }
                                    className="mt-1 w-4 h-4 rounded border-dark-600 bg-dark-800 text-primary-500 focus:ring-primary-500"
                                />
                                <div>
                                    <span className="font-medium">Use Master Key</span>
                                    <p className="text-xs text-dark-400 mt-1">
                                        Add an extra layer of encryption. You&apos;ll need this key
                                        to access your credentials.
                                    </p>
                                </div>
                            </label>

                            {formData.useMasterKey && (
                                <div className="mt-3">
                                    <input
                                        type="password"
                                        value={formData.masterKey}
                                        onChange={(e) =>
                                            setFormData({ ...formData, masterKey: e.target.value })
                                        }
                                        className="input"
                                        placeholder="Enter master key (min 8 characters)"
                                        minLength={8}
                                        required={formData.useMasterKey}
                                    />
                                    <p className="text-xs text-yellow-500 mt-2">
                                        ⚠️ If you lose this key, you will not be able to recover
                                        your credentials.
                                    </p>
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || !allRequirementsMet || !passwordsMatch}
                            className="btn btn-primary w-full"
                        >
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                'Create Account'
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-dark-400">
                        Already have an account?{' '}
                        <Link href="/login" className="text-primary-400 hover:text-primary-300">
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
