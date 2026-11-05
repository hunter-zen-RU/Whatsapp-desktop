import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray, shell } from 'electron';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import log from 'electron-log';
import { GatewayProcess, type GatewayEvent } from './gateway-process';
import { buildMenu } from './menu';
import { readBootstrapApiKey } from './api-key';
import { asDataUrl, errorDocument, splashDocument } from '../renderer-bootstrap';

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let gateway: GatewayProcess | null = null;
let isQuitting = false;

log.transports.file.level = 'info';

// A dev can point the per-user profile at a scratch dir (desktop/.dev-profile) so it never touches
// the real Electron userData location. Must run before app.whenReady / any getPath('userData').
if (!app.isPackaged && process.env.OPENWA_DESKTOP_PROFILE) {
  app.setPath('userData', resolve(process.env.OPENWA_DESKTOP_PROFILE));
}

// A gateway failure must never leave the shell spinning; show why and let the user retry.
function onGatewayEvent(e: GatewayEvent): void {
  if (!win) return;
  if (e.type === 'ready') {
    void win.loadURL(e.url);
  } else if (e.type === 'failed') {
    log.error(`Gateway failed: ${e.reason}`);
    void win.loadURL(asDataUrl(errorDocument(e.reason, e.logTail)));
  }
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b0f14',
    show: false,
    title: 'OpenWA',
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => win?.show());

  // Keep the dashboard inside the window; anything else opens in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url)) return { action: 'allow' };
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Closing hides to the tray (if present) so sessions stay connected; Quit stops the gateway.
  win.on('close', (event) => {
    if (isQuitting || !tray) return;
    event.preventDefault();
    win?.hide();
  });

  void win.loadURL(asDataUrl(splashDocument()));
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'tray.png')
    : join(app.getAppPath(), 'build', 'tray.png');
  if (!existsSync(iconPath)) return; // no tray icon shipped — closing quits instead
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return;
  tray = new Tray(image.resize({ width: 16, height: 16 }));
  tray.setToolTip('OpenWA');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open OpenWA', click: () => (win ? (win.show(), win.focus()) : createWindow()) },
      { label: 'Restart Gateway', click: () => void restartGateway() },
      { type: 'separator' },
      { label: 'Quit', click: () => quit() },
    ]),
  );
}

async function restartGateway(): Promise<void> {
  gateway?.stop();
  await new Promise((r) => setTimeout(r, 1000));
  if (win) void win.loadURL(asDataUrl(splashDocument('Restarting gateway…')));
  gateway = new GatewayProcess(onGatewayEvent);
  await gateway.start();
}

function quit(): void {
  isQuitting = true;
  gateway?.stop();
  app.quit();
}

function registerIpc(): void {
  ipcMain.handle('gateway:bootstrap-key', () => readBootstrapApiKey() ?? null);
  ipcMain.handle('gateway:restart', async () => {
    await restartGateway();
    return true;
  });
  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) await shell.openExternal(url);
  });
}

// Single instance: a second launch just surfaces the existing window.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.openwa.desktop'); // Windows taskbar grouping
    createTray();
    createWindow();
    registerIpc();
    buildMenu(() => void restartGateway());

    gateway = new GatewayProcess(onGatewayEvent);
    void gateway.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  // With a tray we keep running hidden; otherwise closing the window ends the app.
  if (!tray && process.platform !== 'darwin') quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  gateway?.stop();
});
