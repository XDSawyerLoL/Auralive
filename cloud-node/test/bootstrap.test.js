import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 34567;
const base = `http://127.0.0.1:${PORT}`;

async function waitForServer(timeoutMs = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(base + '/healthz');
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('AURA Cloud did not start in diagnostic mode');
}

test('Hostinger runtime stays online without MySQL and renders dashboard', async (t) => {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      // Simule une variable HOST potentiellement injectée par l'hébergeur.
      // AURA doit l'ignorer et écouter sur 0.0.0.0.
      HOST: 'antiquewhite-dolphin-780448.hostingersite.com',
      // Hostinger peut injecter PORT; AURA doit l'ignorer et utiliser AURA_PORT\n      // (3000 par défaut en production).\n      PORT: '49999',\n      AURA_PORT: String(PORT),
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
  t.after(() => {
    if (!child.killed) child.kill('SIGTERM');
  });

  await waitForServer();

  const root = await fetch(base + '/');
  assert.equal(root.status, 200);
  const html = await root.text();
  assert.match(html, /AURA CLOUD/);
  assert.match(html, /État interne/);

  const health = await fetch(base + '/healthz');
  assert.equal(health.status, 200);
  const payload = await health.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.ready, false);
  assert.equal(payload.status, 'diagnostic');
  assert.equal(payload.db, false);

  const bootstrap = await fetch(base + '/api/bootstrap/status');
  assert.equal(bootstrap.status, 200);
  const status = await bootstrap.json();
  assert.equal(status.server_ready, true);
  assert.equal(status.runtime_ready, false);
  assert.equal(status.db_configured, false);

  assert.equal(child.exitCode, null, stderr);
});
