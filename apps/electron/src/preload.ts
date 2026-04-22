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
        };
    }
}
