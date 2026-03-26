'use client';

/**
 * PasskeyRevealModal
 *
 * Prompts the user to authenticate with their passkey, then reveals and
 * copies a server credential (password / privateKey / passphrase).
 *
 * Usage:
 *   <PasskeyRevealModal
 *     serverId="abc"
 *     serverName="My Server"
 *     field="password"
 *     onClose={() => setOpen(false)}
 *   />
 */

import { useState, useEffect } from 'react';
import { startAuthentication } from '@simplewebauthn/browser';
import { X, KeyRound, Copy, Check, Eye, EyeOff, Fingerprint, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

export type RevealField = 'password' | 'privateKey' | 'passphrase';

interface Props {
    serverId: string;
    serverName: string;
    field: RevealField;
    onClose: () => void;
}

type Step = 'authenticating' | 'revealed' | 'error';

const fieldLabel: Record<RevealField, string> = {
    password: 'Password',
    privateKey: 'Private Key',
    passphrase: 'Passphrase',
};

/** Map WebAuthn DOMException names to user-friendly messages */
function getWebAuthnErrorMessage(err: unknown): string {
    if (!(err instanceof Error)) return 'Passkey authentication failed';

    switch (err.name) {
        case 'NotAllowedError':
            return 'Passkey authentication was cancelled or timed out. Please try again.';
        case 'SecurityError':
            return 'Security error — ensure the app is running on HTTPS or localhost.';
        case 'InvalidStateError':
            return 'No passkey found for this account on this device. Register a passkey in Settings.';
        case 'AbortError':
            return 'Authentication was aborted. Please try again.';
        case 'NotSupportedError':
            return 'Passkeys are not supported on this browser. Try Chrome 108+, Safari 16+, or Firefox 119+.';
        case 'UnknownError':
            return 'An unknown error occurred. Ensure your device has Touch ID / Face ID enabled.';
        default:
            return err.message || 'Passkey authentication failed';
    }
}

export default function PasskeyRevealModal({ serverId, serverName, field, onClose }: Props) {
    const [step, setStep] = useState<Step>('authenticating');
    const [errorMsg, setErrorMsg] = useState('');
    const [revealedValue, setRevealedValue] = useState('');
    const [showValue, setShowValue] = useState(false);
    const [copied, setCopied] = useState(false);

    // Auto-trigger passkey auth on mount
    useEffect(() => {
        void handlePasskeyAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handlePasskeyAuth() {
        setStep('authenticating');
        setErrorMsg('');

        // 1. Get WebAuthn challenge from server
        let webAuthnOptions: unknown;
        try {
            const optRes = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const optData = await optRes.json().catch(() => ({}));
            if (!optRes.ok || !optData.success) {
                setErrorMsg(optData.error || 'Failed to get passkey options from server');
                setStep('error');
                return;
            }
            // API wraps WebAuthn options inside { success: true, data: {...} }
            webAuthnOptions = optData.data;
        } catch {
            setErrorMsg('Network error — could not reach the server');
            setStep('error');
            return;
        }

        // 2. Browser WebAuthn assertion — triggers Touch ID / Face ID / security key prompt
        let assertion: Awaited<ReturnType<typeof startAuthentication>>;
        try {
            assertion = await startAuthentication({ optionsJSON: webAuthnOptions as Parameters<typeof startAuthentication>[0]['optionsJSON'] });
        } catch (err: unknown) {
            setErrorMsg(getWebAuthnErrorMessage(err));
            setStep('error');
            return;
        }

        // 3. Send assertion to /reveal — server verifies signature & decrypts credential
        try {
            const revealRes = await fetch(`/api/servers/${serverId}/reveal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, passkeyResponse: assertion }),
            });
            const revealData = await revealRes.json().catch(() => ({}));
            if (!revealRes.ok || !revealData.success) {
                setErrorMsg(revealData.error || 'Failed to reveal credential');
                setStep('error');
                return;
            }
            setRevealedValue(revealData.data.value);
            setStep('revealed');
        } catch {
            setErrorMsg('Network error — could not reach the server');
            setStep('error');
        }
    }

    async function copyToClipboard() {
        let ok = false;
        try {
            await navigator.clipboard.writeText(revealedValue);
            ok = true;
        } catch {
            // Clipboard API unavailable (non-HTTPS or locked permissions)
            // Value is shown in the field — user can select and copy manually
        }
        if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="card w-full max-w-md mx-4 p-6 relative">
                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center shrink-0">
                        <KeyRound className="w-5 h-5 text-sky-400" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="font-semibold">Reveal {fieldLabel[field]}</h2>
                        <p className="text-sm text-slate-400 truncate">{serverName}</p>
                    </div>
                </div>

                {/* Step: authenticating */}
                {step === 'authenticating' && (
                    <div className="flex flex-col items-center gap-4 py-6">
                        <div className="relative">
                            <div className="w-16 h-16 rounded-full bg-sky-500/10 flex items-center justify-center">
                                <Fingerprint className="w-8 h-8 text-sky-400 animate-pulse" />
                            </div>
                            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center">
                                <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                            </div>
                        </div>
                        <div className="text-center space-y-1">
                            <p className="font-medium">Verify with Passkey</p>
                            <p className="text-sm text-slate-400">
                                Use Touch ID, Face ID, or your security key to authenticate
                            </p>
                        </div>
                        <p className="text-xs text-slate-500 text-center">
                            Your device should show a biometric prompt shortly
                        </p>
                    </div>
                )}

                {/* Step: error */}
                {step === 'error' && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm font-medium text-red-300">Authentication Failed</p>
                                <p className="text-sm text-red-300/80">{errorMsg}</p>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button onClick={onClose} className="btn btn-secondary">
                                Cancel
                            </button>
                            <button onClick={handlePasskeyAuth} className="btn btn-primary">
                                <RefreshCw className="w-4 h-4" />
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: revealed */}
                {step === 'revealed' && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-slate-400 mb-1.5 block uppercase tracking-wider">
                                {fieldLabel[field]}
                            </label>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-900 border border-slate-700">
                                <code className="flex-1 text-sm font-mono break-all text-green-400 select-all min-w-0">
                                    {showValue ? revealedValue : '•'.repeat(Math.min(revealedValue.length, 24))}
                                </code>
                                <button
                                    onClick={() => setShowValue((v) => !v)}
                                    className="p-1.5 text-slate-400 hover:text-white transition-colors shrink-0"
                                    title={showValue ? 'Hide' : 'Show'}
                                >
                                    {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button onClick={onClose} className="btn btn-secondary">
                                Close
                            </button>
                            <button
                                onClick={copyToClipboard}
                                className={`btn ${copied ? 'bg-green-600 hover:bg-green-500 text-white' : 'btn-primary'}`}
                            >
                                {copied ? (
                                    <><Check className="w-4 h-4" /> Copied!</>
                                ) : (
                                    <><Copy className="w-4 h-4" /> Copy</>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
