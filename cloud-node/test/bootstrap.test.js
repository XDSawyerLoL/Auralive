import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const GATEWAY_PORT = 34567;
const base = `http://127.0.0.1:${GATEWAY_PORT}`;

async function waitFor(path, matcher, timeoutMs = 15000) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(base + path);
      last = await response.text();
      if (response.ok && matcher(last)) return last;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`AURA Cloud did not become ready for ${path}. Last response: ${last}`);
}

function launch(extraEnv = {}) {
  return spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: 'antiquewhite-dolphin-780448.hostingersite.com',
      PORT: '49999',
      AURA_GATEWAY_PORT: String(GATEWAY_PORT),
      AURA_INTERNAL_PORT: String(GATEWAY_PORT + 1),
      DB_HOST: '',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_NAME: '',
      DATABASE_URL: '',
      AURA_CLOUD_TOKEN: '',
      AURA_EVOLUTION_CANARY_TOKEN: '',
      AI_MODE: 'off',
      HORIZON_ENABLED: 'false',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

test('native gateway stays online even when full runtime is disabled', async (t) => {
  const child = launch({ AURA_GATEWAY_ONLY: 'true' });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });

  const healthText = await waitFor('/healthz', (text) => text.includes('"gateway_ready":true'));
  const health = JSON.parse(healthText);
  assert.equal(health.ok, true);
  assert.equal(health.gateway_ready, true);
  assert.equal(health.runtime_ready, false);

  const root = await fetch(base + '/');
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /AURA CLOUD/);
  assert.match(html, /Gateway Hostinger actif/);
  assert.equal(child.exitCode, null, stderr);
});

test('gateway proxies to AURA dashboard without MySQL', async (t) => {
  const child = launch();
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });

  const html = await waitFor('/', (text) => text.includes('Interface de conscience opérationnelle'));
  assert.match(html, /AURA/);
  assert.match(html, /Interface de conscience opérationnelle/);
  assert.match(html, /Carte d’intérêt/);

  const healthText = await waitFor('/healthz', (text) => text.includes('"ok":true'));
  const payload = JSON.parse(healthText);
  assert.equal(payload.ok, true);

  const gatewayText = await waitFor('/__aura_gateway', (text) => text.includes('"gateway_ready":true'));
  const gateway = JSON.parse(gatewayText);
  assert.equal(gateway.gateway_ready, true);

  assert.equal(child.exitCode, null, stderr);
});
