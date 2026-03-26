'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
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
    Fingerprint,
    Plus,
    Trash2,
    X,
    Lock,
    AlertCircle,
    MonitorSmartphone,
    Clock,
    BellRing,
    Bell,
    BellOff,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface User {
    id: string;
    email: string;
    totpEnabled: boolean;
    emailOtpEnabled: boolean;
    twoFactorMethod: 'NONE' | 'TOTP' | 'EMAIL';
    hasMasterKey: boolean;
    passkeyEnabled: boolean;
    isVerified: boolean;
}

interface Passkey {
    id: string;
    name: string;
    deviceType: string;
    backedUp: boolean;
    transports: string[];
    createdAt: string;
    lastUsedAt: string | null;
}

// ─── Toast Notification ───────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    type: ToastType;
    message: string;
}

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
    const icons: Record<ToastType, React.ReactNode> = {
        success: <Check className="w-4 h-4 text-green-400 shrink-0" />,
        error: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />,
        warning: <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />,
        info: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
    };
    const colors: Record<ToastType, string> = {
        success: 'bg-green-500/10 border-green-500/30 text-green-300',
        error: 'bg-red-500/10 border-red-500/30 text-red-300',
        warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300',
        info: 'bg-sky-500/10 border-sky-500/30 text-sky-300',
    };

    if (!toasts.length) return null;

    return (
        <div className="space-y-2 mb-6">
            {toasts.map((t) => (
                <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm ${colors[t.type]}`}>
                    {icons[t.type]}
                    <span className="flex-1">{t.message}</span>
                    <button onClick={() => onDismiss(t.id)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({ icon, iconBg, title, description, children }: {
    icon: React.ReactNode;
    iconBg: string;
    title: string;
    description: string;
    children: React.ReactNode;
}) {
    return (
        <div className="card p-6">
            <div className="flex items-start gap-4 mb-5">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
                    {icon}
                </div>
                <div>
                    <h2 className="text-base font-semibold">{title}</h2>
                    <p className="text-sm text-slate-400 mt-0.5">{description}</p>
                </div>
            </div>
            {children}
        </div>
    );
}

// ─── Passkey Row ──────────────────────────────────────────────────────────────

function PasskeyRow({ passkey, onDelete }: { passkey: Passkey; onDelete: (id: string) => void }) {
    const [confirming, setConfirming] = useState(false);
    const [deleting, setDeleting] = useState(false);

    async function handleDelete() {
        setDeleting(true);
        await onDelete(passkey.id);
        setDeleting(false);
        setConfirming(false);
    }

    const isMultiDevice = passkey.deviceType === 'multiDevice' || passkey.backedUp;
    const lastUsed = passkey.lastUsedAt
        ? new Date(passkey.lastUsedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : 'Never';
    const created = new Date(passkey.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    return (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
            <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center shrink-0">
                <Fingerprint className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{passkey.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Added {created}
                    </span>
                    {isMultiDevice && (
                        <span className="badge badge-primary text-xs">Synced</span>
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Last used: {lastUsed}</p>
            </div>
            {confirming ? (
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-400">Remove?</span>
                    <button
                        onClick={() => setConfirming(false)}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="btn btn-danger btn-sm text-xs py-1 px-2"
                    >
                        {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Remove'}
                    </button>
                </div>
            ) : (
                <button
                    onClick={() => setConfirming(true)}
                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                    title="Remove passkey"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [toasts, setToasts] = useState<Toast[]>([]);
    const toastIdRef = useRef(0);

    const addToast = useCallback((type: ToastType, message: string, duration = 5000) => {
        const id = ++toastIdRef.current;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
        return id;
    }, []);

    const dismissToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    // ── TOTP state ──────────────────────────────────────────────────────────
    const [setup2FA, setSetup2FA] = useState(false);
    const [qrCode, setQrCode] = useState('');
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [enabling2FA, setEnabling2FA] = useState(false);
    const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    // ── Email OTP state ─────────────────────────────────────────────────────
    const [enablingEmailOTP, setEnablingEmailOTP] = useState(false);

    // ── Disable 2FA state ────────────────────────────────────────────────────
    const [showDisable, setShowDisable] = useState(false);
    const [disablePassword, setDisablePassword] = useState('');
    const [disabling2FA, setDisabling2FA] = useState(false);

    // ── Password state ───────────────────────────────────────────────────────
    const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false });
    const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
    const [changingPassword, setChangingPassword] = useState(false);

    // ── Passkey state ────────────────────────────────────────────────────────
    const [passkeys, setPasskeys] = useState<Passkey[]>([]);
    const [loadingPasskeys, setLoadingPasskeys] = useState(false);
    const [addingPasskey, setAddingPasskey] = useState(false);
    const [newPasskeyName, setNewPasskeyName] = useState('');
    const [showAddPasskey, setShowAddPasskey] = useState(false);
    const [passkeyError, setPasskeyError] = useState('');

    // ── Push notification state ──────────────────────────────────────────────
    const [pushPermission, setPushPermission] = useState<NotificationPermission>('default');
    const [pushSubscribed, setPushSubscribed] = useState(false);
    const [enablingPush, setEnablingPush] = useState(false);

    // ── Load user + passkeys + push state ───────────────────────────────────

    useEffect(() => {
        async function init() {
            try {
                const res = await fetch('/api/auth/me');
                const data = await res.json();
                if (data.success) {
                    setUser(data.data.user);
                }
            } catch { /* ignore */ }
            finally { setLoading(false); }
        }
        void init();
        void loadPasskeys();

        // Check current push permission + subscription state
        if (typeof window !== 'undefined' && 'Notification' in window) {
            setPushPermission(Notification.permission);
        }
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(reg => {
                reg.pushManager.getSubscription().then(sub => {
                    setPushSubscribed(!!sub);
                });
            }).catch(() => {});
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadPasskeys = useCallback(async () => {
        setLoadingPasskeys(true);
        try {
            const res = await fetch('/api/auth/passkey');
            const data = await res.json();
            if (data.success) setPasskeys(data.data.passkeys);
        } catch { /* ignore */ }
        finally { setLoadingPasskeys(false); }
    }, []);

    // ── Push Notifications ───────────────────────────────────────────────────

    const handleEnablePush = async () => {
        setEnablingPush(true);
        try {
            if (!('Notification' in window) || !('serviceWorker' in navigator)) {
                addToast('error', 'Push notifications are not supported by your browser');
                return;
            }

            // Request permission
            const permission = await Notification.requestPermission();
            setPushPermission(permission);
            if (permission !== 'granted') {
                addToast('warning', 'Notification permission denied');
                return;
            }

            // Get VAPID public key
            const keyRes = await fetch('/api/push/vapid-public-key');
            const keyData = await keyRes.json();
            if (!keyData.success) {
                addToast('error', 'Push notifications not configured on this server');
                return;
            }

            // Convert VAPID key
            const vapidKey = keyData.data.publicKey;
            const applicationServerKey = urlBase64ToUint8Array(vapidKey).buffer as ArrayBuffer;

            // Subscribe
            const reg = await navigator.serviceWorker.ready;
            const subscription = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey,
            });

            const subJson = subscription.toJSON() as {
                endpoint: string;
                keys: { p256dh: string; auth: string };
            };

            // Save to server
            const res = await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endpoint: subJson.endpoint,
                    keys: subJson.keys,
                    deviceLabel: navigator.userAgent.slice(0, 100),
                }),
            });
            const data = await res.json();
            if (data.success) {
                setPushSubscribed(true);
                addToast('success', 'Push notifications enabled for this device');
            } else {
                addToast('error', data.error || 'Failed to save subscription');
            }
        } catch (err) {
            addToast('error', `Failed to enable push: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setEnablingPush(false);
        }
    };

    const handleDisablePush = async () => {
        setEnablingPush(true);
        try {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await fetch('/api/push/subscribe', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: sub.endpoint }),
                });
                await sub.unsubscribe();
            }
            setPushSubscribed(false);
            addToast('success', 'Push notifications disabled for this device');
        } catch {
            addToast('error', 'Failed to disable push notifications');
        } finally {
            setEnablingPush(false);
        }
    };

    function urlBase64ToUint8Array(base64String: string): Uint8Array {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
    }

    // ── TOTP ─────────────────────────────────────────────────────────────────

    const handleSetupTOTP = async () => {
        try {
            const res = await fetch('/api/auth/2fa');
            const data = await res.json();
            if (data.success) {
                setQrCode(data.data.qrCode);
                setSecret(data.data.secret);
                setSetup2FA(true);
            } else {
                addToast('error', data.error || 'Failed to setup 2FA');
            }
        } catch { addToast('error', 'Failed to setup 2FA'); }
    };

    const handleEnableTOTP = async () => {
        setEnabling2FA(true);
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
                addToast('success', 'Authenticator app 2FA enabled! Save your recovery codes.');
            } else {
                addToast('error', data.error || 'Invalid code — please try again');
            }
        } catch { addToast('error', 'Failed to enable 2FA'); }
        finally { setEnabling2FA(false); }
    };

    // ── Email OTP ─────────────────────────────────────────────────────────────

    const handleEnableEmailOTP = async () => {
        setEnablingEmailOTP(true);
        try {
            const res = await fetch('/api/auth/2fa/email', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setUser((u) => u ? { ...u, emailOtpEnabled: true, twoFactorMethod: 'EMAIL' } : null);
                addToast('success', 'Email OTP enabled — a code will be sent on each login.');
            } else {
                addToast('error', data.error || 'Failed to enable email OTP');
            }
        } catch { addToast('error', 'Failed to enable email OTP'); }
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
                addToast('success', '2FA disabled successfully');
            } else {
                addToast('error', data.error || 'Failed to disable 2FA');
            }
        } catch { addToast('error', 'Failed to disable 2FA'); }
        finally { setDisabling2FA(false); }
    };

    // ── Password ──────────────────────────────────────────────────────────────

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordForm.new !== passwordForm.confirm) {
            addToast('error', 'New passwords do not match');
            return;
        }
        if (passwordForm.new.length < 8) {
            addToast('error', 'New password must be at least 8 characters');
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
                addToast('success', 'Password changed successfully');
            } else {
                addToast('error', data.error || 'Failed to change password');
            }
        } catch { addToast('error', 'Failed to change password'); }
        finally { setChangingPassword(false); }
    };

    // ── Passkeys ──────────────────────────────────────────────────────────────

    const handleAddPasskey = async () => {
        setAddingPasskey(true);
        setPasskeyError('');
        try {
            // 1. Get registration options
            const optRes = await fetch('/api/auth/passkey/register-options');
            const optData = await optRes.json();
            if (!optRes.ok || !optData.success) {
                throw new Error(optData.error || 'Failed to get registration options');
            }

            // 2. Browser passkey creation prompt
            let registration;
            try {
                registration = await startRegistration({ optionsJSON: optData.data });
            } catch (err: unknown) {
                if (err instanceof Error) {
                    if (err.name === 'NotAllowedError') throw new Error('Passkey registration was cancelled or denied');
                    if (err.name === 'InvalidStateError') throw new Error('A passkey for this device is already registered');
                    if (err.name === 'NotSupportedError') throw new Error('Passkeys are not supported on this device or browser');
                    if (err.name === 'SecurityError') throw new Error('Security error — ensure you are on HTTPS');
                }
                throw new Error('Passkey creation failed');
            }

            // 3. Verify and store
            const regRes = await fetch('/api/auth/passkey/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newPasskeyName.trim() || 'My Passkey',
                    response: registration,
                }),
            });
            const regData = await regRes.json();
            if (!regRes.ok || !regData.success) {
                throw new Error(regData.error || 'Failed to register passkey');
            }

            setUser((u) => u ? { ...u, passkeyEnabled: true } : null);
            setShowAddPasskey(false);
            setNewPasskeyName('');
            addToast('success', 'Passkey added successfully');
            loadPasskeys();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to add passkey';
            setPasskeyError(msg);
        } finally {
            setAddingPasskey(false);
        }
    };

    const handleDeletePasskey = async (id: string) => {
        try {
            const res = await fetch(`/api/auth/passkey/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setPasskeys((prev) => {
                    const next = prev.filter((p) => p.id !== id);
                    if (next.length === 0) setUser((u) => u ? { ...u, passkeyEnabled: false } : null);
                    return next;
                });
                addToast('success', 'Passkey removed');
            } else {
                addToast('error', data.error || 'Failed to remove passkey');
            }
        } catch { addToast('error', 'Failed to remove passkey'); }
    };

    // ── Copy code ─────────────────────────────────────────────────────────────

    const copyCode = async (code: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    // ─────────────────────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-7 h-7 animate-spin text-sky-500" />
            </div>
        );
    }

    const has2FA = user?.twoFactorMethod !== 'NONE';
    const passwordsMatch = !passwordForm.confirm || passwordForm.new === passwordForm.confirm;

    return (
        <div className="max-w-2xl mx-auto pb-12">
            <div className="mb-8">
                <h1 className="text-2xl font-bold">Settings</h1>
                <p className="text-slate-400 text-sm mt-1">Manage your account security and preferences</p>
            </div>

            <ToastList toasts={toasts} onDismiss={dismissToast} />

            {/* Email verification banner */}
            {user && !user.isVerified && (
                <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Your email is not verified. Check your inbox for a verification link.</span>
                </div>
            )}

            {/* ── Account Info ──────────────────────────────────────────────── */}
            <div className="card p-6 mb-4">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Account</h2>
                <div className="space-y-3">
                    <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
                        <span className="text-sm text-slate-400">Email</span>
                        <span className="text-sm flex items-center gap-2">
                            {user?.email}
                            {user?.isVerified && <CheckCircle className="w-4 h-4 text-green-400" />}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
                        <span className="text-sm text-slate-400">Two-Factor Auth</span>
                        <span className={`text-sm font-medium ${has2FA ? 'text-green-400' : 'text-slate-500'}`}>
                            {user?.twoFactorMethod === 'TOTP' ? 'Authenticator App'
                                : user?.twoFactorMethod === 'EMAIL' ? 'Email OTP'
                                    : 'Disabled'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-slate-700/50">
                        <span className="text-sm text-slate-400">Passkeys</span>
                        <span className={`text-sm font-medium ${user?.passkeyEnabled ? 'text-green-400' : 'text-slate-500'}`}>
                            {user?.passkeyEnabled ? `${passkeys.length} registered` : 'None'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                        <span className="text-sm text-slate-400">Master Key</span>
                        <span className={`text-sm font-medium ${user?.hasMasterKey ? 'text-green-400' : 'text-slate-500'}`}>
                            {user?.hasMasterKey ? 'Configured' : 'Not set'}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Recovery Codes (shown once after TOTP enable) ─────────────── */}
            {recoveryCodes.length > 0 && (
                <div className="card p-6 mb-4 border border-yellow-500/30">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                        <h2 className="font-semibold text-yellow-400">Save your recovery codes</h2>
                    </div>
                    <p className="text-slate-400 text-sm mb-4">
                        Store these codes securely. Each can only be used once and will not be shown again.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {recoveryCodes.map((code) => (
                            <div key={code} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2 font-mono text-sm border border-slate-700">
                                <span className="tracking-wider">{code}</span>
                                <button onClick={() => copyCode(code)} className="text-slate-400 hover:text-white ml-2 transition-colors">
                                    {copiedCode === code ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        ))}
                    </div>
                    <button onClick={() => setRecoveryCodes([])} className="btn btn-secondary btn-sm">
                        I&apos;ve saved my recovery codes
                    </button>
                </div>
            )}

            {/* ── Passkeys ──────────────────────────────────────────────────── */}
            <div className="mb-4">
                <SectionCard
                    icon={<Fingerprint className="w-5 h-5 text-sky-400" />}
                    iconBg="bg-sky-500/15"
                    title="Passkeys"
                    description="Sign in with biometrics or a security key — no password required."
                >
                    {/* Passkey list */}
                    {loadingPasskeys ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading passkeys…
                        </div>
                    ) : passkeys.length > 0 ? (
                        <div className="space-y-2 mb-4">
                            {passkeys.map((pk) => (
                                <PasskeyRow key={pk.id} passkey={pk} onDelete={handleDeletePasskey} />
                            ))}
                        </div>
                    ) : (
                        <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/50 text-sm text-slate-400">
                            <MonitorSmartphone className="w-4 h-4 shrink-0" />
                            No passkeys registered. Add one to enable passwordless sign-in.
                        </div>
                    )}

                    {/* Add passkey form */}
                    {showAddPasskey ? (
                        <div className="space-y-3 p-4 rounded-lg bg-slate-900/50 border border-slate-700/50">
                            <p className="text-sm font-medium">Name this passkey</p>
                            <p className="text-xs text-slate-400">Give it a name to identify the device (e.g., &quot;MacBook Touch ID&quot;, &quot;iPhone Face ID&quot;).</p>
                            <input
                                type="text"
                                value={newPasskeyName}
                                onChange={(e) => setNewPasskeyName(e.target.value)}
                                placeholder="My Passkey"
                                className="input text-sm"
                                maxLength={64}
                                disabled={addingPasskey}
                            />
                            {passkeyError && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    {passkeyError}
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => { setShowAddPasskey(false); setNewPasskeyName(''); setPasskeyError(''); }}
                                    className="btn btn-secondary btn-sm"
                                    disabled={addingPasskey}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddPasskey}
                                    disabled={addingPasskey}
                                    className="btn btn-primary btn-sm flex-1"
                                >
                                    {addingPasskey ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
                                    ) : (
                                        <><Fingerprint className="w-4 h-4" /> Create Passkey</>
                                    )}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button
                            onClick={() => { setShowAddPasskey(true); setPasskeyError(''); }}
                            className="btn btn-secondary btn-sm"
                        >
                            <Plus className="w-4 h-4" />
                            Add Passkey
                        </button>
                    )}

                    {/* Browser support note */}
                    <p className="text-xs text-slate-500 mt-3">
                        Passkeys require a device with biometrics or a hardware security key, and a supported browser (Chrome 108+, Safari 16+, Firefox 119+).
                    </p>
                </SectionCard>
            </div>

            {/* ── Two-Factor Authentication ─────────────────────────────────── */}
            <div className="mb-4">
                <SectionCard
                    icon={<Shield className="w-5 h-5 text-violet-400" />}
                    iconBg="bg-violet-500/15"
                    title="Two-Factor Authentication"
                    description="Require a second verification step when signing in."
                >
                    {!has2FA && !setup2FA && (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-400">Choose a 2FA method to add an extra layer of security:</p>
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
                        <div className="space-y-4">
                            <div className="p-4 bg-slate-900 rounded-lg text-center border border-slate-700">
                                {qrCode && <img src={qrCode} alt="2FA QR Code" className="mx-auto mb-4 rounded" />}
                                <p className="text-sm text-slate-400 mb-2">Scan with Google Authenticator, Authy, or similar</p>
                                <p className="text-xs text-slate-500 mb-2">Or enter manually:</p>
                                <code className="text-xs text-slate-300 bg-slate-800 px-3 py-1.5 rounded-lg break-all border border-slate-700">{secret}</code>
                            </div>
                            <div>
                                <label className="label">Enter the 6-digit code to confirm</label>
                                <input
                                    type="text"
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    className="input text-center text-2xl tracking-[0.5em] font-mono"
                                    placeholder="000000"
                                    maxLength={6}
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
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

                    {/* Active 2FA */}
                    {has2FA && !showDisable && (
                        <div>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-300 mb-4">
                                <CheckCircle className="w-4 h-4 shrink-0" />
                                {user?.twoFactorMethod === 'TOTP'
                                    ? 'Authenticator app is active. Keep your recovery codes safe.'
                                    : 'Email OTP is active. A code is sent to your email on each login.'}
                            </div>
                            <button onClick={() => setShowDisable(true)} className="btn btn-danger btn-sm">
                                Disable 2FA
                            </button>
                        </div>
                    )}

                    {/* Disable 2FA confirm */}
                    {showDisable && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                Disabling 2FA will reduce your account security. Confirm your password to continue.
                            </div>
                            <div>
                                <label className="label">Confirm Password</label>
                                <input
                                    type="password"
                                    value={disablePassword}
                                    onChange={(e) => setDisablePassword(e.target.value)}
                                    className="input"
                                    placeholder="Enter your current password"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setShowDisable(false); setDisablePassword(''); }} className="btn btn-secondary">
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
                </SectionCard>
            </div>

            {/* ── Change Password ───────────────────────────────────────────── */}
            <div className="mb-4">
                <SectionCard
                    icon={<Lock className="w-5 h-5 text-amber-400" />}
                    iconBg="bg-amber-500/15"
                    title="Change Password"
                    description="Update your account password. Use a strong, unique password."
                >
                    <form onSubmit={handleChangePassword} className="space-y-4">
                        <div>
                            <label className="label">Current Password</label>
                            <div className="relative">
                                <input
                                    type={showPasswords.current ? 'text' : 'password'}
                                    value={passwordForm.current}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                    className="input pr-10"
                                    autoComplete="current-password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords((s) => ({ ...s, current: !s.current }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                >
                                    {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="label">New Password</label>
                            <div className="relative">
                                <input
                                    type={showPasswords.new ? 'text' : 'password'}
                                    value={passwordForm.new}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                                    className="input pr-10"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords((s) => ({ ...s, new: !s.new }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                >
                                    {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="label">Confirm New Password</label>
                            <div className="relative">
                                <input
                                    type={showPasswords.confirm ? 'text' : 'password'}
                                    value={passwordForm.confirm}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                    className={`input pr-10 ${passwordForm.confirm && !passwordsMatch ? 'input-error' : ''}`}
                                    autoComplete="new-password"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPasswords((s) => ({ ...s, confirm: !s.confirm }))}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                                >
                                    {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {passwordForm.confirm && !passwordsMatch && (
                                <p className="error-text">Passwords do not match</p>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={changingPassword || !passwordsMatch}
                            className="btn btn-primary"
                        >
                            {changingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                            {changingPassword ? 'Changing…' : 'Change Password'}
                        </button>
                    </form>
                </SectionCard>

                {/* ── Push Notifications ── */}
                <SectionCard
                    icon={<BellRing className="w-5 h-5 text-amber-400" />}
                    iconBg="bg-amber-500/15"
                    title="Push Notifications"
                    description="Receive browser push notifications for server alerts on this device"
                >
                    <div className="space-y-4">
                        {/* Status indicator */}
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/50">
                            {pushSubscribed ? (
                                <>
                                    <Bell className="w-5 h-5 text-emerald-400 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-emerald-400">Notifications active</p>
                                        <p className="text-xs text-slate-500 mt-0.5">This device will receive server alert notifications</p>
                                    </div>
                                </>
                            ) : pushPermission === 'denied' ? (
                                <>
                                    <BellOff className="w-5 h-5 text-red-400 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-red-400">Notifications blocked</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Your browser has blocked notifications. Enable them in your browser settings then reload.
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <BellOff className="w-5 h-5 text-slate-500 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">Notifications off</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Enable to get server down/up alerts on this device</p>
                                    </div>
                                </>
                            )}
                        </div>

                        {pushSubscribed ? (
                            <button
                                onClick={handleDisablePush}
                                disabled={enablingPush}
                                className="btn btn-secondary"
                            >
                                {enablingPush ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
                                Disable for this device
                            </button>
                        ) : (
                            <button
                                onClick={handleEnablePush}
                                disabled={enablingPush || pushPermission === 'denied'}
                                className="btn btn-primary"
                            >
                                {enablingPush ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                                {enablingPush ? 'Enabling…' : 'Enable for this device'}
                            </button>
                        )}

                        <p className="text-xs text-slate-600">
                            Notifications are per-device. Enable on each device where you want alerts.
                            Configure alert rules per server in the server details page.
                        </p>
                    </div>
                </SectionCard>
            </div>
        </div>
    );
}
