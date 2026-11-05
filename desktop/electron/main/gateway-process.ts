import { fork, type ChildProcess } from 'child_process';
import { request } from 'http';
import { existsSync } from 'fs';
import { join } from 'path';
import { app } from 'electron';
import log from 'electron-log';
import { getFreePort } from './ports';
import { apiKeyPepper, apiMasterKey, mediaDir, profileDir } from './profile';
import { puppeteerArgsFor, resolveChromiumExecutable } from './chromium';
import { buildGatewayEnv, resolveGatewayEntry } from './gateway-env';

/** Emitted lifecycle events the shell reacts to. */
export type GatewayEvent =
  | { type: 'ready'; url: string }
  | { type: 'failed'; reason: string; logTail: string }
  | { type: 'stopped'; code: number | null; signal: string | null };

const HEALTH_TIMEOUT_MS = 90_000;
const MAX_RESTARTS = 3;

export class GatewayProcess {
  private child?: ChildProcess;
  private logTail: string[] = [];
  private restarts = 0;
  private intentionalStop = false;
  private port?: number;
  private starting = false;

  constructor(private readonly emit: (e: GatewayEvent) => void) {}

  get url(): string | undefined {
    return this.port ? `http://127.0.0.1:${this.port}` : undefined;
  }

  /** The staged gateway root: packaged app resources, or the dev stage next to the shell. */
  private gatewayRoot(): string {
    return app.isPackaged
      ? join(process.resourcesPath, 'gateway')
      : join(app.getAppPath(), 'dist-gateway');
  }

  /** Resolve the staged gateway entry point (compiled NestJS `dist/main.js`). */
  private entryPath(): string {
    const main = resolveGatewayEntry(this.gatewayRoot());
    if (!existsSync(main)) {
      throw new Error(
        `Gateway entry not found at ${main}. Run "npm run prepare:gateway" (dev) or build the app first.`,
      );
    }
    return main;
  }

  async start(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    this.intentionalStop = false;
    try {
      this.port = await getFreePort();
      this.spawnAndAwaitHealth();
    } finally {
      this.starting = false;
    }
  }

  private buildEnv(port: number): NodeJS.ProcessEnv {
    const chromium = resolveChromiumExecutable();
    const args = puppeteerArgsFor(chromium);
    return buildGatewayEnv({
      baseEnv: process.env,
      port,
      mediaDir: mediaDir(),
      apiMasterKey: apiMasterKey(),
      apiKeyPepper: apiKeyPepper(),
      chromiumPath: chromium,
      puppeteerArgs: args,
      engineType: process.env.OPENWA_DESKTOP_ENGINE?.trim() || 'whatsapp-web.js',
    });
  }

  private spawnAndAwaitHealth(): void {
    const port = this.port!;
    const entry = this.entryPath();
    log.info(`Forking gateway: ${entry} (cwd=${profileDir()}, port=${port})`);

    const child = fork(entry, [], {
      cwd: profileDir(),
      env: this.buildEnv(port),
      execPath: process.execPath,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    this.child = child;

    child.stdout?.on('data', (b) => this.onOutput(b.toString()));
    child.stderr?.on('data', (b) => this.onOutput(b.toString()));

    child.on('exit', (code, signal) => {
      this.child = undefined;
      if (this.intentionalStop) {
        this.emit({ type: 'stopped', code, signal });
        return;
      }
      // Unexpected exit: bounded restart with backoff, then surface a failure.
      if (this.restarts < MAX_RESTARTS) {
        this.restarts += 1;
        const delay = 1000 * 2 ** this.restarts;
        log.warn(`Gateway exited (code=${code} signal=${signal}); restarting in ${delay}ms (attempt ${this.restarts})`);
        setTimeout(() => this.spawnAndAwaitHealth(), delay);
        return;
      }
      this.emit({
        type: 'failed',
        reason: `Gateway exited unexpectedly (code=${code} signal=${signal}) after ${MAX_RESTARTS} restarts`,
        logTail: this.logTail.join('\n'),
      });
    });

    void this.awaitHealth(port, child).then((ok) => {
      if (!ok || this.child !== child || this.intentionalStop) return;
      this.restarts = 0; // a healthy boot clears the backoff budget
      this.emit({ type: 'ready', url: `http://127.0.0.1:${port}` });
    });
  }

  private onOutput(chunk: string): void {
    for (const line of chunk.split(/\r?\n/)) {
      if (!line) continue;
      log.info(`[gateway] ${line}`);
      this.logTail.push(line);
      if (this.logTail.length > 200) this.logTail.shift();
    }
  }

  private async awaitHealth(port: number, child: ChildProcess): Promise<boolean> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.child !== child) return false; // replaced or exited
      if (await this.probeHealth(port)) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    log.error('Gateway did not become healthy in time; killing child');
    child.kill('SIGKILL');
    this.emit({ type: 'failed', reason: 'Gateway health check timed out', logTail: this.logTail.join('\n') });
    return false;
  }

  private probeHealth(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/health', method: 'GET', timeout: 2000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  /** Graceful stop: SIGTERM lets the gateway drain (engine teardown, DB close) before exit. */
  stop(): void {
    this.intentionalStop = true;
    if (this.child) {
      this.child.kill('SIGTERM');
    }
  }
}
