import { app, bootstrap, startRuntimeLoop, stopAura } from './src/server.js';

const host = '0.0.0.0';
const port = Number.parseInt(process.env.AURA_GATEWAY_PORT || '3000', 10) || 3000;
const gatewayOnly = process.env.AURA_GATEWAY_ONLY === 'true';

app.get('/__aura_gateway', async () => ({
  ok: true,
  gateway_ready: true,
  gateway_port: port,
  application_ready: true,
  application_state: 'ready',
  runtime_ready: Boolean(bootstrap.runtimeReady),
  db_ready: Boolean(bootstrap.dbReady),
  framework: 'fastify',
  entry_file: 'server.js',
}));

try {
  await app.listen({ host, port });
  console.log(`[AURA] Fastify listening directly on ${host}:${port}`);

  if (!gatewayOnly) {
    startRuntimeLoop();
  } else {
    console.log('[AURA] AURA_GATEWAY_ONLY=true — runtime loop disabled for smoke diagnostics.');
  }
} catch (error) {
  app.log.error(error, 'AURA Fastify startup failed');
  process.exit(1);
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[AURA] stopping on ${signal}`);
  try {
    await stopAura();
  } catch (error) {
    console.error('[AURA] shutdown warning:', error);
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
