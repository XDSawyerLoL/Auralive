import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const HOSTINGER_PORT = 34567;
const base = `http://127.0.0.1:${HOSTINGER_PORT}`;

async function waitForBase(targetBase, path, matcher, timeoutMs = 15000) {
  const started = Date.now();
  let last = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(targetBase + path);
      last = await response.text();
      if (response.ok && matcher(last)) return last;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`AURA Cloud did not become ready for ${path}. Last response: ${last}`);
}

async function waitFor(path, matcher, timeoutMs = 15000) {
  return waitForBase(base, path, matcher, timeoutMs);
}

function launch(extraEnv = {}) {
  return spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: 'antiquewhite-dolphin-780448.hostingersite.com',
      PORT: String(HOSTINGER_PORT),
      AURA_GATEWAY_PORT: '3987',
      AURA_PORT: '3000',
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


test('Hostinger lsnode can require the ESM entry because server.js has no top-level await', async (t) => {
  const requirePort = 3011;
  const child = spawn(process.execPath, ['-e', "require('./server.js')"], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      AURA_PORT: String(requirePort),
      AURA_GATEWAY_ONLY: 'true',
      DB_HOST: '',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_NAME: '',
      DATABASE_URL: '',
      AURA_CLOUD_TOKEN: '',
      AURA_EVOLUTION_CANARY_TOKEN: '',
      AI_MODE: 'off',
      HORIZON_ENABLED: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });

  const targetBase = `http://127.0.0.1:${requirePort}`;
  const gatewayText = await waitForBase(
    targetBase,
    '/__aura_gateway',
    (text) => text.includes('"gateway_ready":true'),
  );
  const gateway = JSON.parse(gatewayText);
  assert.equal(gateway.gateway_port, requirePort);
  assert.equal(gateway.framework, 'fastify-via-native-gateway');
  assert.equal(gateway.application_ready, true);
  assert.doesNotMatch(stderr, /listen\(\) was called more than once/);
  assert.equal(child.exitCode, null, stderr);
});

test('production entry honors Hostinger PORT before AURA fallbacks with runtime disabled', async (t) => {
  const child = launch({ AURA_GATEWAY_ONLY: 'true' });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  t.after(() => { if (!child.killed) child.kill('SIGTERM'); });

  const gatewayText = await waitFor('/__aura_gateway', (text) => text.includes('"gateway_ready":true'));
  const gateway = JSON.parse(gatewayText);
  assert.equal(gateway.ok, true);
  assert.equal(gateway.gateway_ready, true);
  assert.equal(gateway.gateway_port, HOSTINGER_PORT);
  assert.deepEqual(gateway.gateway_ports, [3000, HOSTINGER_PORT]);
  assert.equal(gateway.runtime_ready, false);
  assert.equal(gateway.framework, 'fastify-via-native-gateway');
  assert.equal(gateway.application_ready, true);

  const healthText = await waitFor('/healthz', (text) => text.includes('"ok":true'));
  const health = JSON.parse(healthText);
  assert.equal(health.ok, true);

  const fixedHostinger = await fetch('http://127.0.0.1:3000/__aura_gateway');
  assert.equal(fixedHostinger.status, 200);
  const fixedGateway = await fixedHostinger.json();
  assert.equal(fixedGateway.gateway_port, 3000);
  assert.equal(fixedGateway.application_ready, true);

  const root = await fetch(base + '/');
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /AURA/);
  assert.match(html, /Interface de conscience opérationnelle/);
  assert.doesNotMatch(stderr, /listen\(\) was called more than once/);
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


test('bootstrap source opens Hostinger 3000 plus configured PORT before importing AURA', async () => {
  const fs = await import('node:fs');
  const source = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(source, /const hostingerPort = 3000/);
  assert.match(source, /new Set\(\[hostingerPort, configuredPort\]\)/);
  assert.ok(source.indexOf('startPublicGateways();') < source.indexOf('void bootAura();'));
  assert.match(source, /Fastify internal runtime listening/);
});
