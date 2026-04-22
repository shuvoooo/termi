/**
 * Preload script for the local terminal window.
 * Exposes a typed IPC bridge under window.termiTerminal.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import os from 'os';

contextBridge.exposeInMainWorld('termiTerminal', {
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
        const fn = (_: IpcRendererEvent, data: string) => cb(data);
        ipcRenderer.on(ch, fn);
        return () => ipcRenderer.removeListener(ch, fn);
    },

    /** One-shot listener for process exit. Returns an unsubscribe function. */
    onExit: (id: string, cb: (code: number) => void): (() => void) => {
        const ch = `terminal:exit:${id}`;
        const fn = (_: IpcRendererEvent, code: number) => cb(code);
        ipcRenderer.once(ch, fn);
        return () => ipcRenderer.removeListener(ch, fn);
    },

    platform: process.platform,
    homedir: os.homedir(),
});
