#!/usr/bin/env node
// Stages the compiled gateway (backend dist + bundled dashboard + its runtime deps) into
// desktop/dist-gateway so the Electron shell can fork dist-gateway/dist/main.js as a self-contained
// app. Mirrors a prod install layout: DASHBOARD_DIST resolves to <gatewayRoot>/dashboard/dist
// relative to the backend's dist/ (see src/app.module.ts).
//
//   --dev  : symlink node_modules to the repo root install (fast; changes to root deps apply live).
//   --prod : copy a production node_modules into the stage so it is portable / packageable.
//
// Run the root build first: `npm run build:all` at the repo root (nest build + dashboard build).

import { cpSync, existsSync, mkdirSync, rmSync, symlinkSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, '..');
const repoRoot = resolve(desktopRoot, '..');

const mode = process.argv.includes('--prod') ? 'prod' : 'dev';

const backendDist = join(repoRoot, 'dist');
const dashboardDist = join(repoRoot, 'dashboard', 'dist');
const rootNodeModules = join(repoRoot, 'node_modules');
const stage = join(desktopRoot, 'dist-gateway');

function fail(msg) {
  console.error(`[prepare-gateway] ${msg}`);
  process.exit(1);
}

if (!existsSync(join(backendDist, 'main.js'))) {
  fail(`missing ${backendDist}/main.js — run "npm run build" at the repo root first.`);
}
if (!existsSync(join(dashboardDist, 'index.html'))) {
  fail(`missing ${dashboardDist}/index.html — run "npm run dashboard:build" at the repo root first.`);
}

// Fresh stage each run so stale chunks never shadow a rebuild.
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'dist'), { recursive: true });
mkdirSync(join(stage, 'dashboard'), { recursive: true });

console.log('[prepare-gateway] copying backend dist/ …');
cpSync(backendDist, join(stage, 'dist'), { recursive: true, dereference: true });

console.log('[prepare-gateway] copying dashboard/dist/ …');
cpSync(dashboardDist, join(stage, 'dashboard', 'dist'), { recursive: true, dereference: true });

// The compiled backend reads `../../../package.json` (its version) from several modules
// (health.controller, update-check, plugin-manifest), which resolves to the gateway root.
// Stage the root package.json there or the forked child crashes at boot with MODULE_NOT_FOUND.
cpSync(join(repoRoot, 'package.json'), join(stage, 'package.json'));

const nmTarget = join(stage, 'node_modules');
if (mode === 'dev') {
  // Symlink keeps dev builds instant and picks up root dependency changes; on Windows a directory
  // junction avoids needing developer-mode privileges for symlinks.
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  symlinkSync(rootNodeModules, nmTarget, linkType);
  console.log(`[prepare-gateway] symlinked node_modules -> ${rootNodeModules}`);
} else {
  if (!existsSync(rootNodeModules)) fail(`missing ${rootNodeModules} — run "npm ci" at the repo root first.`);
  console.log('[prepare-gateway] copying production node_modules (this is the bulk of the bundle) …');
  cpSync(rootNodeModules, nmTarget, { recursive: true, dereference: true, force: true });
  console.log('[prepare-gateway] copied node_modules');
}

// Sanity check the runtime layout the backend expects.
const entry = join(stage, 'dist', 'main.js');
const dashIndex = join(stage, 'dashboard', 'dist', 'index.html');
const stagePkg = join(stage, 'package.json');
for (const p of [entry, dashIndex, stagePkg]) {
  if (!existsSync(p) || !statSync(p).isFile()) fail(`staged file missing: ${p}`);
}
console.log(`[prepare-gateway] done (${mode}). Gateway entry: ${entry}`);
