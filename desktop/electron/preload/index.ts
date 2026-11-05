import { contextBridge, ipcRenderer } from 'electron';

/**
 * The dashboard is a normal web app served by the local gateway over http://127.0.0.1:<port>, so it
 * needs no Node access. This bridge exposes only the handful of native capabilities the shell must
 * mediate: reading the first-run admin key (so sign-in can be prefilled), restarting the gateway,
 * and opening external links. Everything else stays inside the web app.
 */
const api = {
  platform: process.platform,
  fetchBootstrapKey: (): Promise<string | null> => ipcRenderer.invoke('gateway:bootstrap-key'),
  restartGateway: (): Promise<boolean> => ipcRenderer.invoke('gateway:restart'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
};

contextBridge.exposeInMainWorld('openwaDesktop', api);

export type OpenwaDesktopApi = typeof api;
