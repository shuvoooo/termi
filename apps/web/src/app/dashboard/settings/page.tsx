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
    Mail,
    Smartphone,
    Copy,
    CheckCircle,
    Info,
} from 'lucide-react';

interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    emailOtpEnabled: boolean;
    twoFactorMethod: 'NONE' | 'TOTP' | 'EMAIL';
    hasMasterKey: boolean;
    isVerified: boolean;
}

export default function SettingsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // TOTP state
    const [setup2FA, setSetup2FA] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [enabling2FA, setEnabling2FA] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    // Email OTP state
    const [enablingEmailOTP, setEnablingEmailOTP] = useState(false);

    // Disable 2FA
    const [showDisable, setShowDisable] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [disabling2FA, setDisabling2FA] = useState(false);

    // Password change
    const [showPassword, setShowPassword] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);

    // Messages
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        async function fetchUser() {
            try {
                const response = await fetch('/api/auth/me');
                const data = await response.json();
                if (data.success) setUser(data.data.user);
            } catch { /* ignore */ }
            finally { setLoading(false); }
        }
        fetchUser();
    }, []);

    const showSuccess = (msg: string) => { setSuccessMsg(msg); setErrorMsg(''); };
    const showError = (msg: string) => { setErrorMsg(msg); setSuccessMsg(''); };

    // ── TOTP ──────────────────────────────────────────────────────────────────

    const handleSetupTOTP = async () => {
        try {
            const res = await fetch('/api/auth/2fa');
            const data = await res.json();
            if (data.success) {
                setQrCode(data.data.qrCode);
                setSecret(data.data.secret);
                setSetup2FA(true);
            } else {
                showError(data.error || 'Failed to setup 2FA');
            }
        } catch { showError('Failed to setup 2FA'); }
    };

    const handleEnableTOTP = async () => {
        setEnabling2FA(true);
        setErrorMsg('');
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ secret, code: verifyCode }),
            });
            const data = await res.json();
            if (data.success) {
                setUser((u) => u ? { ...u, totpEnabled: true, twoFactorMethod: 'TOTP' } : null);
                setSetup2FA(false);
                setVerifyCode('');
                setRecoveryCodes(data.data.recoveryCodes || []);
                showSuccess('Authenticator app 2FA enabled! Save your recovery codes.');
            } else {
                showError(data.error || 'Failed to enable 2FA');
            }
        } catch { showError('Failed to enable 2FA'); }
        finally { setEnabling2FA(false); }
    };

    // ── Email OTP ──────────────────────────────────────────────────────────────

    const handleEnableEmailOTP = async () => {
        setEnablingEmailOTP(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setUser((u) => u ? { ...u, emailOtpEnabled: true, twoFactorMethod: 'EMAIL' } : null);
                showSuccess('Email OTP 2FA enabled. A code will be sent to your email on each login.');
            } else {
                showError(data.error || 'Failed to enable email OTP');
            }
        } catch { showError('Failed to enable email OTP'); }
        finally { setEnablingEmailOTP(false); }
    };

    // ── Disable 2FA ───────────────────────────────────────────────────────────

    const handleDisable2FA = async () => {
        setDisabling2FA(true);
        try {
            const res = await fetch('/api/auth/2fa', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: disablePassword }),
            });
            const data = await res.json();
            if (data.success) {
                setUser((u) => u ? { ...u, totpEnabled: false, emailOtpEnabled: false, twoFactorMethod: 'NONE' } : null);
                setShowDisable(false);
                setDisablePassword('');
                showSuccess('2FA disabled successfully');
            } else {
                showError(data.error || 'Failed to disable 2FA');
            }
        } catch { showError('Failed to disable 2FA'); }
        finally { setDisabling2FA(false); }
    };

    // ── Password ──────────────────────────────────────────────────────────────

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordForm.new !== passwordForm.confirm) {
            showError('Passwords do not match');
            return;
        }
        setChangingPassword(true);
        try {
            const res = await fetch('/api/auth/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: passwordForm.current, newPassword: passwordForm.new }),
            });
            const data = await res.json();
            if (data.success) {
                setPasswordForm({ current: '', new: '', confirm: '' });
                showSuccess('Password changed successfully');
            } else {
                showError(data.error || 'Failed to change password');
            }
        } catch { showError('Failed to change password'); }
        finally { setChangingPassword(false); }
    };

    // ── Copy recovery code ─────────────────────────────────────────────────────

    const copyCode = async (code: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>;
    }

    const has2FA = user?.twoFactorMethod !== 'NONE';

    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-8">Settings</h1>

            {/* Success/Error */}
            {successMsg && (
                <div className="mb-6 p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 flex items-center gap-2">
                    <Check className="w-5 h-5" /> {successMsg}
                    <button onClick={() => setSuccessMsg('')} className="ml-auto">×</button>
                </div>
            )}
            {errorMsg && (
                <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" /> {errorMsg}
                    <button onClick={() => setErrorMsg('')} className="ml-auto">×</button>
                </div>
            )}

            {/* Email verification banner */}
            {user && !user.isVerified && (
                <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 flex items-center gap-2">
                    <Info className="w-5 h-5 flex-shrink-0" />
                    Your email address is not verified. Check your inbox for a verification link.
                </div>
            )}

            {/* Account Info */}
            <div className="card p-6 mb-6">
                <h2 className="text-lg font-medium mb-4">Account</h2>
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                        <span className="text-dark-400">Email</span>
                        <span className="flex items-center gap-2">
                            {user?.email}
                            {user?.isVerified && <CheckCircle className="w-4 h-4 text-green-400" />}
                        </span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-dark-400">Two-Factor Auth</span>
                        <span className={has2FA ? 'text-green-400' : 'text-dark-500'}>
                            {user?.twoFactorMethod === 'TOTP' ? '✓ Authenticator App'
                                : user?.twoFactorMethod === 'EMAIL' ? '✓ Email OTP'
                                    : 'Disabled'}
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

            {/* Recovery codes (shown once after TOTP enable) */}
            {recoveryCodes.length > 0 && (
                <div className="card p-6 mb-6 border border-yellow-500/30">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                        <h2 className="text-lg font-medium text-yellow-400">Save your recovery codes</h2>
                    </div>
                    <p className="text-dark-400 text-sm mb-4">
                        These codes can be used to access your account if you lose your authenticator app.
                        <strong className="text-white"> Each code can only be used once.</strong> They will not be shown again.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {recoveryCodes.map((code) => (
                            <div key={code} className="flex items-center justify-between bg-dark-900 rounded px-3 py-2 font-mono text-sm">
                                <span>{code}</span>
                                <button onClick={() => copyCode(code)} className="text-dark-400 hover:text-white ml-2">
                                    {copiedCode === code ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                                </button>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => setRecoveryCodes([])}
                        className="btn btn-secondary text-sm"
                    >
                        I've saved my recovery codes
                    </button>
                </div>
            )}

            {/* Two-Factor Authentication */}
            <div className="card p-6 mb-6">
                <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                        <Shield className="w-5 h-5 text-primary-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-medium">Two-Factor Authentication</h2>
                        <p className="text-dark-400 text-sm mt-1">Add an extra layer of security to your account.</p>
                    </div>
                </div>

                {!has2FA && !setup2FA && (
                    <div className="space-y-3">
                        <p className="text-dark-400 text-sm">Choose a 2FA method:</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <button
                                onClick={handleSetupTOTP}
                                className="btn btn-secondary flex items-center gap-2 justify-center"
                            >
                                <Smartphone className="w-4 h-4" />
                                Authenticator App
                            </button>
                            <button
                                onClick={handleEnableEmailOTP}
                                disabled={enablingEmailOTP}
                                className="btn btn-secondary flex items-center gap-2 justify-center"
                            >
                                {enablingEmailOTP ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                                Email OTP
                            </button>
                        </div>
                    </div>
                )}

                {/* TOTP setup flow */}
                {setup2FA && (
                    <div className="mt-4 space-y-4">
                        <div className="p-4 bg-dark-900 rounded-lg text-center">
                            {qrCode && <img src={qrCode} alt="2FA QR Code" className="mx-auto mb-4" />}
                            <p className="text-sm text-dark-400 mb-2">Scan with Google Authenticator, Authy, or similar</p>
                            <code className="text-xs text-dark-300 bg-dark-800 px-2 py-1 rounded break-all">{secret}</code>
                        </div>
                        <div>
                            <label className="label">Enter the 6-digit code to confirm</label>
                            <input
                                type="text"
                                value={verifyCode}
                                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                className="input text-center text-xl tracking-widest font-mono"
                                placeholder="000000"
                                maxLength={6}
                                inputMode="numeric"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setSetup2FA(false)} className="btn btn-secondary">Cancel</button>
                            <button
                                onClick={handleEnableTOTP}
                                disabled={verifyCode.length !== 6 || enabling2FA}
                                className="btn btn-primary flex-1"
                            >
                                {enabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Enable'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Active 2FA — disable option */}
                {has2FA && !showDisable && (
                    <div className="mt-2">
                        <p className="text-sm text-dark-400 mb-3">
                            {user?.twoFactorMethod === 'TOTP'
                                ? '✓ Authenticator app is active. Use recovery codes if you lose access.'
                                : '✓ Email OTP is active. A code is sent to your email on each login.'}
                        </p>
                        <button onClick={() => setShowDisable(true)} className="btn btn-danger text-sm">
                            Disable 2FA
                        </button>
                    </div>
                )}

                {showDisable && (
                    <div className="mt-4 space-y-4">
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-sm text-red-400">⚠️ Disabling 2FA will reduce your account security.</p>
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
                            <button onClick={() => { setShowDisable(false); setDisablePassword(''); }} className="btn btn-secondary">Cancel</button>
                            <button onClick={handleDisable2FA} disabled={!disablePassword || disabling2FA} className="btn btn-danger flex-1">
                                {disabling2FA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable 2FA'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Change Password */}
            <div className="card p-6">
                <div className="flex items-start gap-4 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                        <Key className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-medium">Change Password</h2>
                        <p className="text-dark-400 text-sm mt-1">Update your account password</p>
                    </div>
                </div>

                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="label">Current Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={passwordForm.current}
                                onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                className="input pr-10"
                                autoComplete="current-password"
                                required
                            />
                            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-400">
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
                            autoComplete="new-password"
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
                            className={`input ${passwordForm.confirm && passwordForm.new !== passwordForm.confirm ? 'input-error' : ''}`}
                            autoComplete="new-password"
                            required
                        />
                    </div>
                    <button type="submit" disabled={changingPassword} className="btn btn-primary">
                        {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Change Password'}
                    </button>
                </form>
            </div>
        </div>
    );
}
