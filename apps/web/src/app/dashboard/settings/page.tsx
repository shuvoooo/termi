'use client';

import { useEffect, useState } from 'react';
import {
    Shield,
    Key,
    Loader2,
    Check,
    AlertTriangle,
    Eye,
    EyeOff,
} from 'lucide-react';

interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    hasMasterKey: boolean;
}

export default function SettingsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // 2FA State
    const [setup2FA, setSetup2FA] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [enabling2FA, setEnabling2FA] = useState(false);
    const [disabling2FA, setDisabling2FA] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [showDisable, setShowDisable] = useState(false);

    // Password change
    const [showPassword, setShowPassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({
        current: '',
        new: '',
        confirm: '',
    });
    const [changingPassword, setChangingPassword] = useState(false);

    // Messages
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        async function fetchUser() {
            try {
                const response = await fetch('/api/auth/me');
                const data = await response.json();
                if (data.success) {
                    setUser(data.data.user);
                }
            } catch (error) {
                console.error('Failed to fetch user:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchUser();
    }, []);

    const handleSetup2FA = async () => {
        try {
            const response = await fetch('/api/auth/2fa');
            const data = await response.json();

            if (data.success) {
                setQrCode(data.data.qrCode);
                setSecret(data.data.secret);
                setSetup2FA(true);
            }
        } catch (error) {
            setErrorMsg('Failed to setup 2FA');
        }
    };

    const handleEnable2FA = async () => {
        setEnabling2FA(true);
        setErrorMsg('');

        try {
            const response = await fetch('/api/auth/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret, code: verifyCode }),
            });

            const data = await response.json();

            if (data.success) {
                setUser((u) => u ? { ...u, totpEnabled: true } : null);
                setSetup2FA(false);
                setVerifyCode('');
                setSuccessMsg('2FA enabled successfully');
            } else {
                setErrorMsg(data.error || 'Failed to enable 2FA');
            }
        } catch {
            setErrorMsg('Failed to enable 2FA');
        } finally {
            setEnabling2FA(false);
        }
    };

    const handleDisable2FA = async () => {
        setDisabling2FA(true);
        setErrorMsg('');

        try {
            const response = await fetch('/api/auth/2fa', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: disablePassword }),
            });

            const data = await response.json();

            if (data.success) {
                setUser((u) => u ? { ...u, totpEnabled: false } : null);
                setShowDisable(false);
                setDisablePassword('');
                setSuccessMsg('2FA disabled successfully');
            } else {
                setErrorMsg(data.error || 'Failed to disable 2FA');
            }
        } catch {
            setErrorMsg('Failed to disable 2FA');
        } finally {
            setDisabling2FA(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (passwordForm.new !== passwordForm.confirm) {
            setErrorMsg('Passwords do not match');
            return;
        }

        setChangingPassword(true);
        setErrorMsg('');

        try {
            const response = await fetch('/api/auth/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: passwordForm.current,
                    newPassword: passwordForm.new,
                }),
            });

            const data = await response.json();

            if (data.success) {
                setPasswordForm({ current: '', new: '', confirm: '' });
                setSuccessMsg('Password changed successfully');
            } else {
                setErrorMsg(data.error || 'Failed to change password');
            }
        } catch {
            setErrorMsg('Failed to change password');
        } finally {
            setChangingPassword(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-8">Settings</h1>

            {/* Success/Error Messages */}
            {successMsg && (
                <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 flex items-center gap-2">
                    <Check className="w-5 h-5" />
                    {successMsg}
                    <button
                        onClick={() => setSuccessMsg('')}
                        className="ml-auto text-green-500 hover:text-green-400"
                    >
                        ×
                    </button>
                </div>
            )}

            {errorMsg && (
                <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    {errorMsg}
                    <button
                        onClick={() => setErrorMsg('')}
                        className="ml-auto text-red-500 hover:text-red-400"
                    >
                        ×
                    </button>
                </div>
            )}

            {/* Account Info */}
            <div className="card p-6 mb-6">
                <h2 className="text-lg font-medium mb-4">Account</h2>
                <div className="space-y-3">
                    <div className="flex justify-between">
                        <span className="text-dark-400">Email</span>
                        <span>{user?.email}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-dark-400">Two-Factor Auth</span>
                        <span className={user?.totpEnabled ? 'text-green-400' : 'text-dark-500'}>
                            {user?.totpEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-dark-400">Master Key</span>
                        <span className={user?.hasMasterKey ? 'text-green-400' : 'text-dark-500'}>
                            {user?.hasMasterKey ? 'Configured' : 'Not set'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Two-Factor Authentication */}
            <div className="card p-6 mb-6">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-5 h-5 text-primary-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-medium">Two-Factor Authentication</h2>
                        <p className="text-dark-400 text-sm mt-1">
                            Add an extra layer of security with TOTP-based 2FA
                        </p>
                    </div>
                </div>

                {!user?.totpEnabled && !setup2FA && (
                    <button
                        onClick={handleSetup2FA}
                        className="btn btn-primary mt-4"
                    >
                        Enable 2FA
                    </button>
                )}

                {setup2FA && (
                    <div className="mt-6 space-y-4">
                        <div className="p-4 bg-dark-900 rounded-lg text-center">
                            {qrCode && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={qrCode}
                                    alt="2FA QR Code"
                                    className="mx-auto mb-4"
                                />
                            )}
                            <p className="text-sm text-dark-400 mb-2">
                                Scan with Google Authenticator or similar app
                            </p>
                            <code className="text-xs text-dark-300 bg-dark-800 px-2 py-1 rounded">
                                {secret}
                            </code>
                        </div>

                        <div>
                            <label className="label">Verification Code</label>
                            <input
                                type="text"
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="input text-center text-xl tracking-widest font-mono"
                                placeholder="000000"
                                maxLength={6}
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setSetup2FA(false)}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleEnable2FA}
                                disabled={verifyCode.length !== 6 || enabling2FA}
                                className="btn btn-primary flex-1"
                            >
                                {enabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Enable'}
                            </button>
                        </div>
                    </div>
                )}

                {user?.totpEnabled && !showDisable && (
                    <button
                        onClick={() => setShowDisable(true)}
                        className="btn btn-danger mt-4"
                    >
                        Disable 2FA
                    </button>
                )}

                {showDisable && (
                    <div className="mt-6 space-y-4">
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-sm text-red-400">
                                ⚠️ Disabling 2FA will reduce your account security.
                            </p>
                        </div>

                        <div>
                            <label className="label">Confirm Password</label>
                            <input
                                type="password"
                                value={disablePassword}
                                onChange={(e) => setDisablePassword(e.target.value)}
                                className="input"
                                placeholder="Enter your password"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setShowDisable(false);
                                    setDisablePassword('');
                                }}
                                className="btn btn-secondary"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDisable2FA}
                                disabled={!disablePassword || disabling2FA}
                                className="btn btn-danger flex-1"
                            >
                                {disabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable 2FA'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Change Password */}
            <div className="card p-6">
                <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                        <Key className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-lg font-medium">Change Password</h2>
                        <p className="text-dark-400 text-sm mt-1">
                            Update your account password
                        </p>
                    </div>
                </div>

                <form onSubmit={handleChangePassword} className="mt-6 space-y-4">
                    <div>
                        <label className="label">Current Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={passwordForm.current}
                                onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                className="input pr-10"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="label">New Password</label>
                        <input
                            type="password"
                            value={passwordForm.new}
                            onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                            className="input"
                            required
                            minLength={8}
                        />
                    </div>

                    <div>
                        <label className="label">Confirm New Password</label>
                        <input
                            type="password"
                            value={passwordForm.confirm}
                            onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                            className={`input ${passwordForm.confirm && passwordForm.new !== passwordForm.confirm
                                    ? 'input-error'
                                    : ''
                                }`}
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={changingPassword}
                        className="btn btn-primary"
                    >
                        {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Change Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
