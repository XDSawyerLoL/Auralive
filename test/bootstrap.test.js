import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const HOSTINGER_PORT = 3000;
const base = `http://127.0.0.1:${HOSTINGER_PORT}`;

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
      AURA_GATEWAY_PORT: '3987',
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

test('production entry forces Hostinger port 3000 and stays online with runtime disabled', async (t) => {
  const child = launch({ AURA_GATEWAY_ONLY: 'true' });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });

  const gatewayText = await waitFor('/__aura_gateway', (text) => text.includes('"gateway_ready":true'));
  const gateway = JSON.parse(gatewayText);
  assert.equal(gateway.ok, true);
  assert.equal(gateway.gateway_ready, true);
  assert.equal(gateway.gateway_port, 3000);
  assert.equal(gateway.runtime_ready, false);
  assert.equal(gateway.framework, 'native-node-gateway');
  assert.equal(gateway.application_ready, false);

  const healthText = await waitFor('/healthz', (text) => text.includes('"ok":true'));
  const health = JSON.parse(healthText);
  assert.equal(health.ok, true);
  assert.equal(health.application_ready, false);

  const root = await fetch(base + '/');
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /AURA/);
  assert.match(html, /Passerelle Hostinger active/);
  assert.equal(child.exitCode, null, stderr);
});

test('direct Fastify server serves AURA dashboard without MySQL', async (t) => {
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
  assert.equal(gateway.application_ready, true);
  assert.equal(gateway.application_state, 'ready');

  const bootstrapResponse = await fetch(base + '/api/bootstrap/status');
  assert.equal(bootstrapResponse.status, 200);
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrap.server_ready, true);
  assert.equal(
    (bootstrap.issues || []).some((issue) => issue && issue.code === 'cloud_token_missing'),
    false,
    'AURA_CLOUD_TOKEN must not be required for direct dashboard/chat access',
  );

  const authResponse = await fetch(base + '/api/auth/session');
  assert.equal(authResponse.status, 200);
  const auth = await authResponse.json();
  assert.equal(auth.authenticated, false);

  assert.equal(child.exitCode, null, stderr);
});
