#!/usr/bin/env node
// Desktop dev orchestrator: build the gateway + dashboard, rebuild native deps against Electron's
// ABI, stage the gateway with a symlinked node_modules, then launch Electron with a scratch profile.
//
// Note: `rebuild` rewrites the repo-root better-sqlite3 / sharp bindings for Electron's Node ABI. If
// you switch back to the plain backend workflow (`npm run dev` on the gateway), rebuild again for the
// system Node (or reinstall) so those lanes keep working.

import { spawnSync } from 'child_process';
import { dirname, join, resolve } from 'path';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, '..');
const repoRoot = resolve(desktopRoot, '..');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function step(desc, args, cwd) {
  console.log(`\n[desktop:dev] ${desc}`);
  const r = spawnSync(npm, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[desktop:dev] "${args.join(' ')}" failed with code ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

step('Build backend + dashboard (repo root)', ['run', 'build:all'], repoRoot);
step('Rebuild native modules for Electron ABI', ['run', 'rebuild'], desktopRoot);
step('Compile Electron main + preload', ['run', 'build:main'], desktopRoot);
step('Stage gateway (dev, symlinked node_modules)', ['run', 'prepare:gateway'], desktopRoot);

const profileDir = join(desktopRoot, '.dev-profile');
mkdirSync(profileDir, { recursive: true });

console.log('\n[desktop:dev] Launching Electron…');
const electronBin = join(desktopRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
const r = spawnSync(electronBin, ['.'], {
  cwd: desktopRoot,
  stdio: 'inherit',
  env: { ...process.env, OPENWA_DESKTOP_PROFILE: profileDir, ELECTRON_ENABLE_LOGGING: '1' },
});
process.exit(r.status ?? 0);
