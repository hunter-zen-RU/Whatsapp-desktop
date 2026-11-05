/**
 * Pure gateway environment builder. Split from gateway-process.ts (which is coupled to the Electron
 * `app`) so the exact env contract the shell relies on is unit-testable headlessly. The caller
 * resolves the inputs (profile dir, media dir, persisted secrets, Chromium path/args, engine) and
 * this only assembles the process.env shape.
 *
 * The invariants here are the desktop guarantees from the plan:
 *   - loopback-only bind + a single chosen port
 *   - plain-HTTP localhost without the CSP https-upgrade blank-dashboard trap
 *   - zero external services (SQLite + local media under the profile)
 *   - whatsapp-web.js default engine with the resolved Chromium
 *   - the child runs as Node on the Electron binary (matching the rebuilt native ABI)
 */

import { join } from 'path';

/**
 * The compiled gateway entry for a staged gateway root. Pure (no Electron) so the layout the
 * packaging script produces and the shell forks can be asserted in a headless test.
 */
export function resolveGatewayEntry(gatewayRoot: string): string {
  return join(gatewayRoot, 'dist', 'main.js');
}

export interface GatewayEnvInput {
  /** Inherited base env (usually process.env). */
  baseEnv: NodeJS.ProcessEnv;
  port: number;
  mediaDir: string;
  apiMasterKey: string;
  apiKeyPepper: string;
  /** Resolved PUPPETEER_EXECUTABLE_PATH, or undefined to let puppeteer use its bundled Chromium. */
  chromiumPath?: string;
  /** Extra puppeteer args, joined into PUPPETEER_ARGS when non-empty. */
  puppeteerArgs: string[];
  /** Selected engine id; defaults to whatsapp-web.js. */
  engineType: string;
}

export function buildGatewayEnv(input: GatewayEnvInput): NodeJS.ProcessEnv {
  const url = `http://127.0.0.1:${input.port}`;
  const env: NodeJS.ProcessEnv = {
    ...input.baseEnv,
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1',

    PORT: String(input.port),
    BIND_HOST: '127.0.0.1',
    BASE_URL: url,
    NODE_ENV: 'production',
    SERVE_DASHBOARD: 'true',
    ENABLE_SWAGGER: 'false',
    CSP_UPGRADE_INSECURE_REQUESTS: 'false',

    DATABASE_TYPE: 'sqlite',
    POSTGRES_BUILTIN: 'false',
    REDIS_ENABLED: 'false',
    REDIS_BUILTIN: 'false',
    QUEUE_ENABLED: 'false',
    STORAGE_TYPE: 'local',
    MINIO_BUILTIN: 'false',
    STORAGE_LOCAL_PATH: input.mediaDir,

    ENGINE_TYPE: input.engineType,
    PUPPETEER_HEADLESS: 'true',

    API_MASTER_KEY: input.apiMasterKey,
    API_KEY_PEPPER: input.apiKeyPepper,

    // Desktop never uses the Docker datastore orchestration sidecar.
    DOCKER_HOST: '',
  };
  if (input.chromiumPath) env.PUPPETEER_EXECUTABLE_PATH = input.chromiumPath;
  if (input.puppeteerArgs.length) env.PUPPETEER_ARGS = input.puppeteerArgs.join(',');
  return env;
}
