import { BrowserWindow, Menu, app, shell } from 'electron';

/**
 * A minimal application menu. The dashboard owns all real actions; this only carries the OS-level
 * expectations (About / Quit / Edit roles so paste works in the web app, View for reload/devtools)
 * plus an explicit "Restart gateway". Devtools are gated to unpackaged runs.
 */
export function buildMenu(onRestartGateway: () => void): void {
  const isDev = !app.isPackaged;

  const template: Electron.MenuItemConstructorOptions[] = [
    { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
    {
      label: 'Gateway',
      submenu: [{ label: 'Restart Gateway', click: onRestartGateway }],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools', visible: isDev },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin'
          ? ([{ type: 'separator' }, { role: 'front' }] as Electron.MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as Electron.MenuItemConstructorOptions[])),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'OpenWA on GitHub',
          click: async () => {
            await shell.openExternal('https://github.com/rmyndharis/OpenWA');
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Show/focus a window from the tray, creating one only if the app is quitting-safe. */
export function revealWindow(win: BrowserWindow | null): void {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
