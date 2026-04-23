/**
 * Termi Electron Main Process
 *
 * Manages the application lifecycle, spawns the local server stack (offline
 * mode) and owns the BrowserWindow.
 *
 * Mode overview
 * ─────────────
 *  online  → BrowserWindow loads https://termi.shuvoo.com
 *             No local processes are started.
 *
 *  offline → Copies empty SQLite DB template to userData on first run,
 *             auto-generates secrets, spawns Next.js standalone server
 *             (port 3000) and WebSocket gateway (port 8080) via
 *             utilityProcess.fork(), then loads http://localhost:3000.
 */

import {
    app,
    BrowserWindow,
    BrowserView,
    Menu,
    Tray,
    ipcMain,
    dialog,
    shell,
    nativeImage,
    UtilityProcess,
    utilityProcess,
    net,
} from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import * as nodePty from 'node-pty';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ONLINE_URL     = 'https://termi.shuvoo.com';
const WEB_PORT       = 3000;
const GATEWAY_PORT   = 8080;
const CONFIG_FILE    = 'config.json';
const ENV_FILE       = 'electron.env';
const DB_FILENAME    = 'termi.db';

const IS_DEV     = !app.isPackaged;
const RESOURCES  = IS_DEV
    ? path.join(__dirname, '../../resources')   // apps/electron/resources/
    : process.resourcesPath;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AppMode = 'online' | 'offline';

interface AppConfig {
    mode: AppMode | null;
    onlineUrl: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers
// ─────────────────────────────────────────────────────────────────────────────

function configPath(): string {
    return path.join(app.getPath('userData'), CONFIG_FILE);
}

function loadConfig(): AppConfig {
    const p = configPath();
    if (!fs.existsSync(p)) return { mode: null, onlineUrl: ONLINE_URL };
    try   { return JSON.parse(fs.readFileSync(p, 'utf-8')) as AppConfig; }
    catch { return { mode: null, onlineUrl: ONLINE_URL }; }
}

function saveConfig(cfg: AppConfig): void {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline: secrets + DB bootstrap
// ─────────────────────────────────────────────────────────────────────────────

function ensureOfflineEnv(): Record<string, string> {
    const envPath = path.join(app.getPath('userData'), ENV_FILE);
    const dbPath  = path.join(app.getPath('userData'), DB_FILENAME);

    if (!fs.existsSync(envPath)) {
        const env = [
            `SESSION_SECRET=${crypto.randomBytes(32).toString('base64')}`,
            `ENCRYPTION_KEY=${crypto.randomBytes(32).toString('base64')}`,
            `GATEWAY_JWT_SECRET=${crypto.randomBytes(32).toString('base64')}`,
            `DATABASE_URL=file:${dbPath}`,
            `NEXT_PUBLIC_GATEWAY_URL=ws://127.0.0.1:${GATEWAY_PORT}`,
            `NEXT_PUBLIC_BASE_URL=http://127.0.0.1:${WEB_PORT}`,
            `NEXT_PUBLIC_APP_URL=http://127.0.0.1:${WEB_PORT}`,
            `ALLOWED_ORIGINS=http://localhost:${WEB_PORT},http://127.0.0.1:${WEB_PORT}`,
        ].join('\n');
        fs.writeFileSync(envPath, env, 'utf-8');
    }

    // Parse stored env
    const vars: Record<string, string> = {};
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
        const eq = line.indexOf('=');
        if (eq > 0) vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    });
    return vars;
}

function ensureDatabase(dbPath: string): void {
    if (fs.existsSync(dbPath)) return;

    const template = path.join(RESOURCES, 'empty.db');
    if (fs.existsSync(template)) {
        fs.copyFileSync(template, dbPath);
        console.log('[DB] Copied empty template →', dbPath);
    } else {
        // Template not yet generated (dev environment) — DB will be created
        // on first Prisma connection when migrations run automatically via
        // the `prisma migrate deploy` step in the build pipeline.
        console.warn('[DB] No template found; Prisma will create the database on first run.');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wait for local server to accept connections
// ─────────────────────────────────────────────────────────────────────────────

async function waitForServer(
    url: string,
    maxRetries = 60,
    intervalMs  = 1000,
): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await net.fetch(url, { method: 'HEAD' });
            if (res.ok || res.status < 500) return true;
        } catch { /* not ready yet */ }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Process management
// ─────────────────────────────────────────────────────────────────────────────

let webProcess:     UtilityProcess | null = null;
let gatewayProcess: UtilityProcess | null = null;

function spawnOfflineProcesses(
    envVars: Record<string, string>,
    onStatus: (msg: string) => void,
): void {
    const env = { ...process.env, ...envVars, NODE_ENV: 'production' };

    // ── Next.js standalone server ──────────────────────────────────────────
    const webServerPath = IS_DEV
        ? path.join(__dirname, '../../../apps/web/.next/standalone/server.js')
        : path.join(RESOURCES, 'web', 'server.js');

    onStatus('Starting web server…');
    webProcess = utilityProcess.fork(webServerPath, [], {
        cwd: IS_DEV
            ? path.join(__dirname, '../../../apps/web/.next/standalone')
            : path.join(RESOURCES, 'web'),
        env: { ...env, PORT: String(WEB_PORT), HOSTNAME: '127.0.0.1' },
        stdio: 'pipe',
    });
    webProcess.stdout?.on('data', (d: Buffer) => process.stdout.write('[web] ' + d));
    webProcess.stderr?.on('data', (d: Buffer) => process.stderr.write('[web] ' + d));

    // ── Gateway ────────────────────────────────────────────────────────────
    const gatewayPath = IS_DEV
        ? path.join(__dirname, '../../../apps/gateway/dist/index.js')
        : path.join(RESOURCES, 'gateway', 'index.js');

    onStatus('Starting gateway…');
    gatewayProcess = utilityProcess.fork(gatewayPath, [], {
        cwd: IS_DEV
            ? path.join(__dirname, '../../../apps/gateway')
            : path.join(RESOURCES, 'gateway'),
        env: {
            ...env,
            GATEWAY_PORT: String(GATEWAY_PORT),
            GATEWAY_HOST: '127.0.0.1',
        },
        stdio: 'pipe',
    });
    gatewayProcess.stdout?.on('data', (d: Buffer) => process.stdout.write('[gw] ' + d));
    gatewayProcess.stderr?.on('data', (d: Buffer) => process.stderr.write('[gw] ' + d));
}

function killOfflineProcesses(): void {
    webProcess?.kill();
    gatewayProcess?.kill();
    webProcess     = null;
    gatewayProcess = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tray
// ─────────────────────────────────────────────────────────────────────────────

let tray: Tray | null = null;

function buildTrayMenu(mode: AppMode, win: BrowserWindow): Menu {
    const modeLabel = mode === 'online' ? '☁️  Online Mode' : '🖥️  Offline Mode';
    return Menu.buildFromTemplate([
        { label: 'Termi', enabled: false },
        { label: modeLabel, enabled: false },
        { type: 'separator' },
        { label: 'Open Termi', click: () => win.show() },
        { label: 'Toggle Local Terminal', click: () => toggleTerminalPanel(win) },
        { label: 'Switch Mode…', click: () => promptModeSwitch(win) },
        { type: 'separator' },
        { label: 'Quit Termi', click: () => { app.quit(); } },
    ]);
}

function setupTray(mode: AppMode, win: BrowserWindow): void {
    // Prefer native icon; fall back to empty image in dev
    const iconPath = IS_DEV
        ? nativeImage.createEmpty()
        : nativeImage.createFromPath(path.join(RESOURCES, 'tray-icon.png'));

    tray = new Tray(iconPath);
    tray.setToolTip(`Termi — ${mode === 'online' ? 'Online' : 'Offline'}`);
    tray.setContextMenu(buildTrayMenu(mode, win));
    tray.on('double-click', () => win.show());
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode switch helper
// ─────────────────────────────────────────────────────────────────────────────

function promptModeSwitch(win: BrowserWindow): void {
    dialog.showMessageBox(win, {
        type: 'question',
        title: 'Switch Mode',
        message: 'Switch Termi mode?',
        detail: 'The app will restart to apply the new mode.',
        buttons: ['Switch Mode', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
    }).then(({ response }) => {
        if (response === 0) {
            const cfg = loadConfig();
            cfg.mode = null; // triggers mode selector on next launch
            saveConfig(cfg);
            killOfflineProcesses();
            app.relaunch();
            app.quit();
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Application menu
// ─────────────────────────────────────────────────────────────────────────────

function buildAppMenu(mode: AppMode, win: BrowserWindow): Menu {
    const isMac = process.platform === 'darwin';
    const template: Electron.MenuItemConstructorOptions[] = [
        ...(isMac ? [{ label: app.name, submenu: [
            { role: 'about' as const },
            { type: 'separator' as const },
            { role: 'services' as const },
            { type: 'separator' as const },
            { role: 'hide' as const },
            { role: 'hideOthers' as const },
            { role: 'unhide' as const },
            { type: 'separator' as const },
            { role: 'quit' as const },
        ]}] : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'Switch Mode…',
                    accelerator: 'CmdOrCtrl+Shift+M',
                    click: () => promptModeSwitch(win),
                },
                { type: 'separator' },
                isMac ? { role: 'close' as const } : { role: 'quit' as const },
            ],
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' as const },
                { role: 'forceReload' as const },
                { role: 'toggleDevTools' as const },
                { type: 'separator' },
                { role: 'resetZoom' as const },
                { role: 'zoomIn' as const },
                { role: 'zoomOut' as const },
                { type: 'separator' },
                { role: 'togglefullscreen' as const },
            ],
        },
        {
            label: 'Window',
            submenu: [
                {
                    label: 'Toggle Local Terminal',
                    accelerator: 'CmdOrCtrl+Shift+T',
                    click: () => {
                        if (mainWin) toggleTerminalPanel(mainWin);
                        else openLocalTerminal();
                    },
                },
                { type: 'separator' },
                { role: 'minimize' as const },
                { role: 'zoom' as const },
                ...(isMac ? [
                    { type: 'separator' as const },
                    { role: 'front' as const },
                ] : []),
            ],
        },
        {
            label: 'Help',
            submenu: [
                {
                    label: `Mode: ${mode === 'online' ? '☁️ Online' : '🖥️ Offline'}`,
                    enabled: false,
                },
                { type: 'separator' },
                {
                    label: 'GitHub Repository',
                    click: () => shell.openExternal('https://github.com/shuvoooo/termi'),
                },
            ],
        },
    ];
    return Menu.buildFromTemplate(template);
}

// ─────────────────────────────────────────────────────────────────────────────
// Window factory
// ─────────────────────────────────────────────────────────────────────────────

function createWindow(mode: AppMode, url: string): BrowserWindow {
    const win = new BrowserWindow({
        width:  1280,
        height: 800,
        minWidth:  900,
        minHeight: 600,
        show: false,
        title: 'Termi',
        backgroundColor: '#0f172a',
        webPreferences: {
            preload:          path.join(__dirname, 'preload.js'),
            nodeIntegration:  false,
            contextIsolation: true,
            // Allow loading local server over http in offline mode
            allowRunningInsecureContent: mode === 'offline',
        },
    });

    mainWin = win;

    win.once('ready-to-show', () => win.show());
    win.loadURL(url);

    // Open external links in the default browser (not a new Electron window)
    win.webContents.setWindowOpenHandler(({ url: externalUrl }) => {
        if (!externalUrl.startsWith('http://localhost') &&
            !externalUrl.startsWith('https://termi.shuvoo.com')) {
            shell.openExternal(externalUrl);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // Intercept file downloads → native save dialog
    win.webContents.session.on('will-download', (_event, item) => {
        const defaultPath = path.join(app.getPath('downloads'), item.getFilename());
        item.setSavePath(defaultPath);
    });

    return win;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mode selector window
// ─────────────────────────────────────────────────────────────────────────────

function openModeSelector(): Promise<AppMode> {
    return new Promise(resolve => {
        const selector = new BrowserWindow({
            width:  560,
            height: 480,
            frame:  false,
            resizable: false,
            center: true,
            show: false,
            backgroundColor: '#0f172a',
            webPreferences: {
                preload:          path.join(__dirname, 'preload.js'),
                nodeIntegration:  false,
                contextIsolation: true,
            },
        });

        selector.once('ready-to-show', () => selector.show());
        selector.loadFile(path.join(__dirname, 'mode-selector.html'));

        ipcMain.once('select-mode', (_event, mode: AppMode) => {
            // Save choice and let the main flow continue
            const cfg = loadConfig();
            cfg.mode = mode;
            saveConfig(cfg);
            resolve(mode);
        });
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Terminal (PTY)
// ─────────────────────────────────────────────────────────────────────────────

const ptyMap = new Map<string, nodePty.IPty>();
const terminalWindows = new Set<BrowserWindow>();

// ── In-app terminal panel (BrowserView overlay, used in online mode) ──────────
let mainWin:      BrowserWindow | null = null;
let terminalPanel: BrowserView  | null = null;
let panelVisible                       = false;
let panelLoaded                        = false;

function getOrCreatePanel(): BrowserView {
    if (!terminalPanel) {
        terminalPanel = new BrowserView({
            webPreferences: {
                preload:          path.join(__dirname, 'preload-terminal.js'),
                nodeIntegration:  false,
                contextIsolation: true,
            },
        });
        // Auto-open DevTools in development to diagnose issues
        if (IS_DEV) {
            terminalPanel.webContents.openDevTools({ mode: 'detach' });
        }
    }
    return terminalPanel;
}

function showTerminalPanel(win: BrowserWindow): void {
    const panel = getOrCreatePanel();

    if (!panelVisible) {
        win.addBrowserView(panel);

        // Auto-resize with window so we don't need a manual resize handler
        panel.setAutoResize({ width: true, height: true });

        const [width, height] = win.getContentSize();
        panel.setBounds({ x: 0, y: 0, width, height });

        // Load AFTER bounds are set so xterm.js sees the correct viewport size
        if (!panelLoaded) {
            panel.webContents.loadFile(
                path.join(__dirname, 'local-terminal.html'),
                { search: 'panel=1' },
            );
            panelLoaded = true;
        }

        panelVisible = true;
    }

    panel.webContents.focus();
}

function hideTerminalPanel(win: BrowserWindow): void {
    if (terminalPanel && panelVisible) {
        win.removeBrowserView(terminalPanel);
        panelVisible = false;
    }
}

function toggleTerminalPanel(win: BrowserWindow): void {
    if (panelVisible) hideTerminalPanel(win);
    else showTerminalPanel(win);
}

function openLocalTerminal(cwd?: string): BrowserWindow {
    const isMac = process.platform === 'darwin';
    const win = new BrowserWindow({
        width: 900,
        height: 620,
        minWidth: 600,
        minHeight: 400,
        title: 'Local Terminal',
        backgroundColor: '#0d0d0d',
        titleBarStyle: isMac ? 'hiddenInset' : 'default',
        webPreferences: {
            preload: path.join(__dirname, 'preload-terminal.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const htmlPath = path.join(__dirname, 'local-terminal.html');
    const search = cwd ? `cwd=${encodeURIComponent(cwd)}` : '';
    win.loadFile(htmlPath, { search });

    win.on('closed', () => terminalWindows.delete(win));
    terminalWindows.add(win);
    return win;
}

function setupTerminalIpc(): void {
    ipcMain.handle('terminal:create', (event, cwd?: string) => {
        const id = crypto.randomUUID();
        const shell_ = process.platform === 'win32'
            ? (process.env.COMSPEC ?? 'cmd.exe')
            : (process.env.SHELL ?? '/bin/bash');

        let pty: nodePty.IPty;
        try {
            pty = nodePty.spawn(shell_, [], {
                name: 'xterm-256color',
                cols: 80,
                rows: 24,
                cwd: cwd ?? os.homedir(),
                env: process.env as Record<string, string>,
            });
        } catch (err) {
            console.error('[PTY] Failed to spawn shell:', err);
            throw err;
        }

        const sender = event.sender;

        pty.onData(data => {
            if (!sender.isDestroyed()) sender.send(`terminal:data:${id}`, data);
        });

        pty.onExit(({ exitCode }) => {
            ptyMap.delete(id);
            if (!sender.isDestroyed()) sender.send(`terminal:exit:${id}`, exitCode ?? 0);
        });

        ptyMap.set(id, pty);
        return id;
    });

    ipcMain.on('terminal:input', (_e, id: string, data: string) => {
        ptyMap.get(id)?.write(data);
    });

    ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) => {
        try { ptyMap.get(id)?.resize(cols, rows); } catch { /* ignore if process exited */ }
    });

    ipcMain.on('terminal:close', (_e, id: string) => {
        const p = ptyMap.get(id);
        if (p) { try { p.kill(); } catch { /* already dead */ } ptyMap.delete(id); }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC handlers
// ─────────────────────────────────────────────────────────────────────────────

function registerIpcHandlers(): void {
    setupTerminalIpc();

    // Terminal panel (WebContentsView overlay for online mode)
    ipcMain.on('terminal:show-panel',   () => { if (mainWin) showTerminalPanel(mainWin); });
    ipcMain.on('terminal:hide-panel',   () => { if (mainWin) hideTerminalPanel(mainWin); });
    ipcMain.on('terminal:toggle-panel', () => { if (mainWin) toggleTerminalPanel(mainWin); });

    ipcMain.on('get-version', event => {
        event.returnValue = app.getVersion();
    });

    ipcMain.on('open-external', (_event, url: string) => {
        if (typeof url === 'string') shell.openExternal(url);
    });

    ipcMain.on('switch-mode', event => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) promptModeSwitch(win);
    });

    ipcMain.on('save-file', async (_event, { url, filename }: { url: string; filename: string }) => {
        const { filePath } = await dialog.showSaveDialog({
            defaultPath: path.join(app.getPath('downloads'), filename),
        });
        if (filePath) {
            const response = await net.fetch(url);
            const buffer   = Buffer.from(await response.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

app.on('ready', async () => {
    registerIpcHandlers();

    // ── 1. Determine mode ──────────────────────────────────────────────────
    let cfg = loadConfig();

    if (cfg.mode === null) {
        // Show mode selector; it resolves once the user picks
        cfg.mode = await openModeSelector();
    }

    const mode = cfg.mode;

    // ── 2. Online mode (simple) ────────────────────────────────────────────
    if (mode === 'online') {
        const win = createWindow('online', cfg.onlineUrl);
        Menu.setApplicationMenu(buildAppMenu('online', win));
        setupTray('online', win);
        return;
    }

    // ── 3. Offline mode ────────────────────────────────────────────────────

    // Bootstrap secrets & database
    const envVars = ensureOfflineEnv();
    const dbPath  = (envVars.DATABASE_URL ?? '').replace(/^file:/, '');
    ensureDatabase(dbPath);

    // Create a temporary splash / loading state in the selector window
    // (it stays open while the servers start)
    let selectorWin: BrowserWindow | null =
        BrowserWindow.getAllWindows().find(w => !w.isDestroyed()) ?? null;

    const notify = (text: string) => {
        selectorWin?.webContents.send('loading-update', text);
    };

    // Spawn Next.js + Gateway
    spawnOfflineProcesses(envVars, notify);

    // Wait for web server to be ready
    notify('Waiting for server…');
    const ready = await waitForServer(`http://127.0.0.1:${WEB_PORT}`);

    if (!ready) {
        dialog.showErrorBox(
            'Startup failed',
            'The local server did not start in time. Please restart Termi.',
        );
        app.quit();
        return;
    }

    // Open main window
    const win = createWindow('offline', `http://127.0.0.1:${WEB_PORT}`);
    Menu.setApplicationMenu(buildAppMenu('offline', win));
    setupTray('offline', win);

    // Dismiss the selector/loading window
    selectorWin?.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        killOfflineProcesses();
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        const cfg = loadConfig();
        if (cfg.mode === 'online') {
            createWindow('online', cfg.onlineUrl);
        } else {
            createWindow('offline', `http://127.0.0.1:${WEB_PORT}`);
        }
    }
});

app.on('before-quit', () => killOfflineProcesses());

// Prevent multiple app instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) { win.restore(); win.focus(); }
    });
}
