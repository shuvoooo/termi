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
import { X, KeyRound, Copy, Check, Eye, EyeOff, Fingerprint, Loader2, AlertCircle } from 'lucide-react';

export type RevealField = 'password' | 'privateKey' | 'passphrase';

interface Props {
    serverId: string;
    serverName: string;
    field: RevealField;
    onClose: () => void;
}

type Step = 'prompt' | 'authenticating' | 'revealed' | 'error';

const fieldLabel: Record<RevealField, string> = {
    password: 'Password',
    privateKey: 'Private Key',
    passphrase: 'Passphrase',
};

export default function PasskeyRevealModal({ serverId, serverName, field, onClose }: Props) {
    const [step, setStep] = useState<Step>('prompt');
    const [errorMsg, setErrorMsg] = useState('');
    const [revealedValue, setRevealedValue] = useState('');
    const [showValue, setShowValue] = useState(false);
    const [copied, setCopied] = useState(false);

    // Auto-trigger passkey auth on mount (smooth UX)
    useEffect(() => {
        handlePasskeyAuth();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function handlePasskeyAuth() {
        setStep('authenticating');
        setErrorMsg('');

        try {
            // 1. Get WebAuthn challenge from server
            const optRes = await fetch('/api/auth/passkey/authenticate-options', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const optData = await optRes.json().catch(() => ({}));
            if (!optRes.ok || !optData.success) {
                throw new Error(optData.error || 'Failed to get passkey options');
            }
            // API wraps response in { success: true, data: {...} }
            const options = optData.data;

            // 2. Browser WebAuthn assertion (biometric / security key prompt)
            let assertion;
            try {
                assertion = await startAuthentication({ optionsJSON: options });
            } catch (err: unknown) {
                if (err instanceof Error && err.name === 'NotAllowedError') {
                    throw new Error('Passkey authentication was cancelled');
                }
                throw new Error('Passkey authentication failed');
            }

            // 3. Send assertion + reveal request to server
            const revealRes = await fetch(`/api/servers/${serverId}/reveal`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ field, passkeyResponse: assertion }),
            });

            const revealData = await revealRes.json();
            if (!revealRes.ok || !revealData.success) {
                throw new Error(revealData.error || 'Failed to reveal credential');
            }

            setRevealedValue(revealData.data.value);
            setStep('revealed');
        } catch (err: unknown) {
            setErrorMsg(err instanceof Error ? err.message : 'Authentication failed');
            setStep('error');
        }
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(revealedValue);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Fallback for non-HTTPS or older browsers
            const ta = document.createElement('textarea');
            ta.value = revealedValue;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
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
                    className="absolute top-4 right-4 p-1 text-dark-400 hover:text-white transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-primary-500/10 flex items-center justify-center shrink-0">
                        <KeyRound className="w-5 h-5 text-primary-400" />
                    </div>
                    <div className="min-w-0">
                        <h2 className="font-semibold">Reveal {fieldLabel[field]}</h2>
                        <p className="text-sm text-dark-400 truncate">{serverName}</p>
                    </div>
                </div>

                {/* Step: authenticating */}
                {step === 'authenticating' && (
                    <div className="flex flex-col items-center gap-4 py-4">
                        <div className="w-16 h-16 rounded-full bg-primary-500/10 flex items-center justify-center">
                            <Fingerprint className="w-8 h-8 text-primary-400 animate-pulse" />
                        </div>
                        <div className="text-center">
                            <p className="font-medium mb-1">Verify with Passkey</p>
                            <p className="text-sm text-dark-400">
                                Use your fingerprint, face, or security key to authenticate
                            </p>
                        </div>
                        <Loader2 className="w-5 h-5 text-dark-400 animate-spin" />
                    </div>
                )}

                {/* Step: error */}
                {step === 'error' && (
                    <div className="space-y-4">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-300">{errorMsg}</p>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button onClick={onClose} className="btn btn-secondary">
                                Cancel
                            </button>
                            <button onClick={handlePasskeyAuth} className="btn btn-primary">
                                <Fingerprint className="w-4 h-4" />
                                Try Again
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: revealed */}
                {step === 'revealed' && (
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs text-dark-400 mb-1.5 block uppercase tracking-wider">
                                {fieldLabel[field]}
                            </label>
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-dark-900 border border-dark-700">
                                <code className="flex-1 text-sm font-mono break-all text-green-400 select-all min-w-0">
                                    {showValue ? revealedValue : '•'.repeat(Math.min(revealedValue.length, 24))}
                                </code>
                                <button
                                    onClick={() => setShowValue((v) => !v)}
                                    className="p-1.5 text-dark-400 hover:text-white transition-colors shrink-0"
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
                                    <>
                                        <Check className="w-4 h-4" />
                                        Copied!
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4" />
                                        Copy
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
