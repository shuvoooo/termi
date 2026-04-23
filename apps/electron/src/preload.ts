/**
 * Electron preload script
 *
 * Runs in an isolated context before the renderer page loads.
 * Exposes a safe, typed bridge (`window.termiElectron`) via contextBridge.
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('termiElectron', {
    /** User chose a mode on the selector screen */
    selectMode: (mode: 'online' | 'offline') => {
        ipcRenderer.send('select-mode', mode);
    },

    /** Get current app version */
    getVersion: (): string => ipcRenderer.sendSync('get-version') as string,

    /** Subscribe to startup status messages (offline mode loading) */
    onLoadingUpdate: (handler: (text: string) => void) => {
        ipcRenderer.on('loading-update', (_event, text: string) => handler(text));
    },

    /** Trigger native file-save dialog for a download URL */
    saveFile: (url: string, filename: string) => {
        ipcRenderer.send('save-file', { url, filename });
    },

    /** Open a URL in the system's default browser */
    openExternal: (url: string) => {
        ipcRenderer.send('open-external', url);
    },

    /** Switch mode from within the app (e.g. from settings) */
    switchMode: () => {
        ipcRenderer.send('switch-mode');
    },

    /** Toggle the in-app local terminal panel overlay (works in online mode) */
    toggleLocalTerminal: (): void => ipcRenderer.send('terminal:toggle-panel'),
    showLocalTerminal:   (): void => ipcRenderer.send('terminal:show-panel'),
    hideLocalTerminal:   (): void => ipcRenderer.send('terminal:hide-panel'),

    /** Local PTY terminal — only works in the Electron app */
    terminal: {
        /** Spawn a new PTY session. Returns a unique session ID. */
        create: (cwd?: string): Promise<string> =>
            ipcRenderer.invoke('terminal:create', cwd),

        /** Send keystrokes / data to the PTY. */
        input: (id: string, data: string): void =>
            ipcRenderer.send('terminal:input', id, data),

        /** Notify the PTY of a terminal resize. */
        resize: (id: string, cols: number, rows: number): void =>
            ipcRenderer.send('terminal:resize', id, cols, rows),

        /** Kill the PTY session. */
        close: (id: string): void =>
            ipcRenderer.send('terminal:close', id),

        /** Subscribe to output from the PTY. Returns an unsubscribe function. */
        onData: (id: string, cb: (data: string) => void): (() => void) => {
            const ch = `terminal:data:${id}`;
            const fn = (_: Electron.IpcRendererEvent, data: string) => cb(data);
            ipcRenderer.on(ch, fn);
            return () => ipcRenderer.removeListener(ch, fn);
        },

        /** One-shot listener for process exit. Returns an unsubscribe function. */
        onExit: (id: string, cb: (code: number) => void): (() => void) => {
            const ch = `terminal:exit:${id}`;
            const fn = (_: Electron.IpcRendererEvent, code: number) => cb(code);
            ipcRenderer.once(ch, fn);
            return () => ipcRenderer.removeListener(ch, fn);
        },
    },
});

// Extend global Window type so TypeScript is happy in renderer files
declare global {
    interface Window {
        termiElectron?: {
            selectMode(mode: 'online' | 'offline'): void;
            getVersion(): string;
            onLoadingUpdate(handler: (text: string) => void): void;
            saveFile(url: string, filename: string): void;
            openExternal(url: string): void;
            switchMode(): void;
            toggleLocalTerminal(): void;
            showLocalTerminal(): void;
            hideLocalTerminal(): void;
            terminal: {
                create(cwd?: string): Promise<string>;
                input(id: string, data: string): void;
                resize(id: string, cols: number, rows: number): void;
                close(id: string): void;
                onData(id: string, cb: (data: string) => void): () => void;
                onExit(id: string, cb: (code: number) => void): () => void;
            };
            toggleLocalTerminal(): void;
            showLocalTerminal(): void;
            hideLocalTerminal(): void;
        };
    }
}

// ── Floating "Local Terminal" button (online mode only) ───────────────────────
// Injected into the remote site's DOM so the user can open the terminal panel
// even before the deployed site has the nav item.
window.addEventListener('DOMContentLoaded', () => {
    const host = window.location.hostname;
    // Only inject on the remote site, not localhost / 127.0.0.1
    if (host === 'localhost' || host === '127.0.0.1' || host === '') return;

    const btn = document.createElement('button');
    btn.id = 'termi-local-terminal-fab';
    btn.title = 'Open Local Terminal';
    btn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
        </svg>
        <span>Local Terminal</span>
    `;

    Object.assign(btn.style, {
        position:    'fixed',
        bottom:      '24px',
        right:       '24px',
        zIndex:      '2147483647',
        display:     'flex',
        alignItems:  'center',
        gap:         '8px',
        background:  '#6366f1',
        color:       '#fff',
        border:      'none',
        borderRadius: '10px',
        padding:     '10px 16px',
        cursor:      'pointer',
        fontFamily:  'system-ui, -apple-system, sans-serif',
        fontSize:    '13px',
        fontWeight:  '600',
        boxShadow:   '0 4px 16px rgba(0,0,0,0.35)',
        transition:  'transform 0.15s ease, background 0.15s ease',
        outline:     'none',
    });

    btn.addEventListener('mouseenter', () => {
        btn.style.background  = '#4f46e5';
        btn.style.transform   = 'scale(1.04)';
    });
    btn.addEventListener('mouseleave', () => {
        btn.style.background  = '#6366f1';
        btn.style.transform   = 'scale(1)';
    });
    btn.addEventListener('click', () => {
        ipcRenderer.send('terminal:toggle-panel');
    });

    document.body.appendChild(btn);
});
