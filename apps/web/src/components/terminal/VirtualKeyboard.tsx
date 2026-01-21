'use client';

import { useState, useCallback } from 'react';

interface VirtualKeyboardProps {
    onKey: (key: string) => void;
    onModifier?: (modifier: 'ctrl' | 'alt' | 'shift', active: boolean) => void;
}

const specialKeys = [
    { label: 'Esc', key: '\x1b' },
    { label: 'Tab', key: '\t' },
    { label: '↑', key: '\x1b[A' },
    { label: '↓', key: '\x1b[B' },
    { label: '←', key: '\x1b[D' },
    { label: '→', key: '\x1b[C' },
    { label: 'Home', key: '\x1b[H' },
    { label: 'End', key: '\x1b[F' },
    { label: 'PgUp', key: '\x1b[5~' },
    { label: 'PgDn', key: '\x1b[6~' },
    { label: 'Del', key: '\x1b[3~' },
    { label: 'Ins', key: '\x1b[2~' },
];

const functionKeys = [
    { label: 'F1', key: '\x1bOP' },
    { label: 'F2', key: '\x1bOQ' },
    { label: 'F3', key: '\x1bOR' },
    { label: 'F4', key: '\x1bOS' },
    { label: 'F5', key: '\x1b[15~' },
    { label: 'F6', key: '\x1b[17~' },
    { label: 'F7', key: '\x1b[18~' },
    { label: 'F8', key: '\x1b[19~' },
    { label: 'F9', key: '\x1b[20~' },
    { label: 'F10', key: '\x1b[21~' },
    { label: 'F11', key: '\x1b[23~' },
    { label: 'F12', key: '\x1b[24~' },
];

export default function VirtualKeyboard({ onKey, onModifier }: VirtualKeyboardProps) {
    const [ctrl, setCtrl] = useState(false);
    const [alt, setAlt] = useState(false);
    const [shift, setShift] = useState(false);
    const [showFn, setShowFn] = useState(false);

    const handleKey = useCallback((key: string) => {
        let finalKey = key;

        // Apply modifiers
        if (ctrl) {
            // Convert to control character
            if (key.length === 1) {
                const code = key.toUpperCase().charCodeAt(0);
                if (code >= 65 && code <= 90) {
                    finalKey = String.fromCharCode(code - 64);
                }
            }
        }

        if (alt) {
            finalKey = '\x1b' + key;
        }

        if (shift && key.length === 1) {
            finalKey = key.toUpperCase();
        }

        onKey(finalKey);

        // Reset non-sticky modifiers
        if (ctrl) {
            setCtrl(false);
            onModifier?.('ctrl', false);
        }
        if (alt) {
            setAlt(false);
            onModifier?.('alt', false);
        }
        if (shift) {
            setShift(false);
            onModifier?.('shift', false);
        }
    }, [ctrl, alt, shift, onKey, onModifier]);

    const toggleModifier = (mod: 'ctrl' | 'alt' | 'shift') => {
        switch (mod) {
            case 'ctrl':
                setCtrl(!ctrl);
                onModifier?.('ctrl', !ctrl);
                break;
            case 'alt':
                setAlt(!alt);
                onModifier?.('alt', !alt);
                break;
            case 'shift':
                setShift(!shift);
                onModifier?.('shift', !shift);
                break;
        }
    };

    return (
        <div className="virtual-keyboard">
            <div className="flex flex-col gap-2">
                {/* Function keys row */}
                {showFn && (
                    <div className="flex gap-1 overflow-x-auto no-scrollbar">
                        {functionKeys.map((k) => (
                            <button
                                key={k.label}
                                className="virtual-key"
                                onTouchStart={(e) => {
                                    e.preventDefault();
                                    handleKey(k.key);
                                }}
                                onClick={() => handleKey(k.key)}
                            >
                                {k.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Special keys row */}
                <div className="flex gap-1 overflow-x-auto no-scrollbar">
                    {specialKeys.map((k) => (
                        <button
                            key={k.label}
                            className="virtual-key"
                            onTouchStart={(e) => {
                                e.preventDefault();
                                handleKey(k.key);
                            }}
                            onClick={() => handleKey(k.key)}
                        >
                            {k.label}
                        </button>
                    ))}
                </div>

                {/* Modifiers row */}
                <div className="flex gap-1">
                    <button
                        className={`virtual-key virtual-key-modifier ${ctrl ? 'virtual-key-active' : ''}`}
                        onTouchStart={(e) => {
                            e.preventDefault();
                            toggleModifier('ctrl');
                        }}
                        onClick={() => toggleModifier('ctrl')}
                    >
                        Ctrl
                    </button>
                    <button
                        className={`virtual-key virtual-key-modifier ${alt ? 'virtual-key-active' : ''}`}
                        onTouchStart={(e) => {
                            e.preventDefault();
                            toggleModifier('alt');
                        }}
                        onClick={() => toggleModifier('alt')}
                    >
                        Alt
                    </button>
                    <button
                        className={`virtual-key virtual-key-modifier ${shift ? 'virtual-key-active' : ''}`}
                        onTouchStart={(e) => {
                            e.preventDefault();
                            toggleModifier('shift');
                        }}
                        onClick={() => toggleModifier('shift')}
                    >
                        Shift
                    </button>
                    <button
                        className={`virtual-key flex-1 ${showFn ? 'virtual-key-active' : ''}`}
                        onTouchStart={(e) => {
                            e.preventDefault();
                            setShowFn(!showFn);
                        }}
                        onClick={() => setShowFn(!showFn)}
                    >
                        Fn
                    </button>
                    <button
                        className="virtual-key flex-1"
                        onTouchStart={(e) => {
                            e.preventDefault();
                            handleKey('\x03'); // Ctrl+C
                        }}
                        onClick={() => handleKey('\x03')}
                    >
                        ^C
                    </button>
                    <button
                        className="virtual-key flex-1"
                        onTouchStart={(e) => {
                            e.preventDefault();
                            handleKey('\x04'); // Ctrl+D
                        }}
                        onClick={() => handleKey('\x04')}
                    >
                        ^D
                    </button>
                    <button
                        className="virtual-key flex-1"
                        onTouchStart={(e) => {
                            e.preventDefault();
                            handleKey('\x1a'); // Ctrl+Z
                        }}
                        onClick={() => handleKey('\x1a')}
                    >
                        ^Z
                    </button>
                </div>
            </div>
        </div>
    );
}
