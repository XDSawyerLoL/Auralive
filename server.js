import { app, bootstrap, startRuntimeLoop, stopAura } from './src/server.js';

const host = '0.0.0.0';
const production = process.env.NODE_ENV === 'production';
const requestedPort = Number.parseInt(
  process.env.AURA_PORT || process.env.PORT || process.env.AURA_GATEWAY_PORT || '3000',
  10,
);
const port = production
  ? 3000
  : (Number.isInteger(requestedPort) && requestedPort > 0 ? requestedPort : 3000);
const gatewayOnly = process.env.AURA_GATEWAY_ONLY === 'true';

let shuttingDown = false;

app.get('/__aura_gateway', async () => ({
  ok: true,
  gateway_ready: true,
  gateway_port: port,
  application_ready: true,
  application_state: 'ready',
  runtime_ready: Boolean(bootstrap.runtimeReady),
  db_ready: Boolean(bootstrap.dbReady),
  framework: 'fastify-direct',
  entry_file: 'server.js',
  startup_error: String(bootstrap.startupError || ''),
}));

function start() {
  app.listen({ host, port })
    .then(() => {
      console.log(`[AURA] Fastify listening directly on ${host}:${port}`);
      if (gatewayOnly) {
        console.log('[AURA] AURA_GATEWAY_ONLY=true — runtime loop disabled.');
        return;
      }
      startRuntimeLoop();
    })
    .catch((error) => {
      console.error('[AURA] Fastify startup failed:', error);
      process.exitCode = 1;
    });
}

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

process.on('uncaughtException', (error) => {
  console.error('[AURA] uncaught exception:', error);
  process.exitCode = 1;
});
process.on('unhandledRejection', (error) => {
  console.error('[AURA] unhandled rejection:', error);
  process.exitCode = 1;
});
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
