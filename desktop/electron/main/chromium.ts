import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';

/**
 * Resolve the Chromium binary the whatsapp-web.js engine (default) should drive, returned as the
 * value for PUPPETEER_EXECUTABLE_PATH. Resolution order:
 *
 *   1. OPENWA_DESKTOP_CHROME  — an explicit operator override (system Chrome/Chromium path).
 *   2. A Chromium bundled as an app resource under resources/chromium/ (the packaged fallback).
 *   3. undefined — fall through to puppeteer's own bundled Chromium, which prepare-gateway copies
 *      into the staged gateway's node_modules cache. This is the default, lowest-risk path.
 *
 * Reusing Electron's OWN binary (process.execPath) is deliberately NOT the default: Electron is a
 * Chromium build, but launching the packaged app binary again re-opens the desktop app rather than
 * a CDP-controllable browser, so puppeteer.launch() against it does not work out of the box. It is
 * kept behind OPENWA_DESKTOP_USE_ELECTRON_CHROMIUM=1 for the spike described in the plan; when set,
 * the caller must also pass --no-sandbox (see puppeteerArgsFor).
 */
export function resolveChromiumExecutable(): string | undefined {
  const override = process.env.OPENWA_DESKTOP_CHROME?.trim();
  if (override) return override;

  if (process.env.OPENWA_DESKTOP_USE_ELECTRON_CHROMIUM === '1') {
    // Experimental: treat the running Electron binary as the browser executable.
    return process.execPath;
  }

  const bundled = findBundledChromium();
  if (bundled) return bundled;

  // Leave unset: the backend uses puppeteer's bundled Chromium.
  return undefined;
}

function findBundledChromium(): string | undefined {
  const base = app.isPackaged ? join(process.resourcesPath, 'chromium') : join(app.getAppPath(), 'resources', 'chromium');
  const candidates =
    process.platform === 'win32'
      ? [join(base, 'chrome.exe'), join(base, 'chrome-win', 'chrome.exe')]
      : process.platform === 'darwin'
        ? [join(base, 'Chromium.app', 'Contents', 'MacOS', 'Chromium')]
        : [join(base, 'chrome-linux', 'chrome'), join(base, 'chrome')];
  return candidates.find((p) => existsSync(p));
}

/**
 * Extra puppeteer launch args. When running against Electron's own binary we must disable the
 * sandbox (the app is already sandbox-managed and the second instance can't set up a fresh one);
 * otherwise return nothing and let the engine's documented default args stand.
 */
export function puppeteerArgsFor(executable: string | undefined): string[] {
  if (executable === process.execPath && process.env.OPENWA_DESKTOP_USE_ELECTRON_CHROMIUM === '1') {
    return ['--no-sandbox', '--disable-gpu'];
  }
  return [];
}
