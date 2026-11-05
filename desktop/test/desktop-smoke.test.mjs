import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';

import { getFreePort } from '../dist-electron/main/ports.js';
import { buildGatewayEnv, resolveGatewayEntry } from '../dist-electron/main/gateway-env.js';
import { asDataUrl, errorDocument, splashDocument } from '../dist-electron/renderer-bootstrap.js';

test('getFreePort reserves a usable loopback port', async () => {
  const port = await getFreePort();
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536, `unexpected port ${port}`);
  // The reservation server is closed, so the port should be free to bind again.
  await assert.doesNotReject(
    new Promise((resolve, reject) => {
      const s = createConnection({ host: '127.0.0.1', port });
      s.on('connect', () => {
        s.destroy();
        reject(new Error('port unexpectedly in use'));
      });
      s.on('error', (e) => (e.code === 'ECONNREFUSED' ? resolve() : reject(e)));
    }),
  );
});

test('buildGatewayEnv enforces the desktop invariants', () => {
  const env = buildGatewayEnv({
    baseEnv: { SOME_PARENT_VAR: 'keep-me' },
    port: 4321,
    mediaDir: '/profile/data/media',
    apiMasterKey: 'mk',
    apiKeyPepper: 'pk',
    chromiumPath: undefined,
    puppeteerArgs: [],
    engineType: 'whatsapp-web.js',
  });

  assert.equal(env.SOME_PARENT_VAR, 'keep-me', 'inherits base env');
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
  assert.equal(env.PORT, '4321');
  assert.equal(env.BIND_HOST, '127.0.0.1', 'loopback only');
  assert.equal(env.BASE_URL, 'http://127.0.0.1:4321');
  assert.equal(env.SERVE_DASHBOARD, 'true');
  assert.equal(env.CSP_UPGRADE_INSECURE_REQUESTS, 'false', 'avoids blank-dashboard trap');
  assert.equal(env.DATABASE_TYPE, 'sqlite');
  assert.equal(env.STORAGE_TYPE, 'local');
  assert.equal(env.STORAGE_LOCAL_PATH, '/profile/data/media');
  assert.equal(env.REDIS_ENABLED, 'false');
  assert.equal(env.ENGINE_TYPE, 'whatsapp-web.js');
  assert.equal(env.API_MASTER_KEY, 'mk');
  assert.equal(env.API_KEY_PEPPER, 'pk');
  assert.equal(env.DOCKER_HOST, '');
  assert.ok(!('PUPPETEER_EXECUTABLE_PATH' in env), 'unset chromium leaves puppeteer default');
  assert.ok(!('PUPPETEER_ARGS' in env), 'no args -> no PUPPETEER_ARGS');
});

test('buildGatewayEnv passes a resolved Chromium and args through', () => {
  const env = buildGatewayEnv({
    baseEnv: {},
    port: 1,
    mediaDir: '/m',
    apiMasterKey: 'a',
    apiKeyPepper: 'p',
    chromiumPath: '/opt/chrome',
    puppeteerArgs: ['--no-sandbox', '--disable-gpu'],
    engineType: 'baileys',
  });
  assert.equal(env.PUPPETEER_EXECUTABLE_PATH, '/opt/chrome');
  assert.equal(env.PUPPETEER_ARGS, '--no-sandbox,--disable-gpu');
  assert.equal(env.ENGINE_TYPE, 'baileys');
});

test('resolveGatewayEntry matches the staged layout prepare-gateway produces', () => {
  assert.equal(resolveGatewayEntry('/app/gateway'), '/app/gateway/dist/main.js');
});

test('renderer documents escape untrusted text and encode as data URLs', () => {
  const err = errorDocument('<script>alert(1)</script>', 'line1\n<img src=x onerror=y>');
  assert.ok(!err.includes('<script>alert(1)</script>'), 'raw script must be escaped');
  assert.ok(err.includes('&lt;script&gt;'), 'escaped entity present');
  assert.ok(err.includes('&lt;img'), 'log tail escaped too');

  const splash = splashDocument('Starting…');
  assert.ok(splash.startsWith('<!doctype html>'));

  const url = asDataUrl('<a href="x">&</a>');
  assert.ok(url.startsWith('data:text/html;charset=utf-8,'));
  assert.ok(!url.includes('<'), 'encoded, not raw');
});
