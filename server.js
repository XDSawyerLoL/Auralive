import { createServer } from 'node:http';

const host = '0.0.0.0';
const production = process.env.NODE_ENV === 'production';
const requestedPort = Number.parseInt(
  process.env.AURA_PORT || process.env.PORT || process.env.AURA_GATEWAY_PORT || '3000',
  10,
);
const port = production ? 3000 : (requestedPort || 3000);
const gatewayOnly = process.env.AURA_GATEWAY_ONLY === 'true';

let app = null;
let stopAura = async () => {};
let fallbackServer = null;
let fullRuntimeStarted = false;

function fallbackHtml(error) {
  const safe = String(error?.message || error || 'Erreur inconnue')
    .replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AURA — récupération</title>
<style>
body{margin:0;background:#070a12;color:#eef2ff;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:grid;min-height:100vh;place-items:center}
main{width:min(760px,calc(100% - 36px));padding:28px;border:1px solid #27304a;border-radius:22px;background:linear-gradient(145deg,#10172a,#0a0f1d);box-shadow:0 30px 90px #0008}
h1{margin:0 0 8px;font-size:34px} .ok{color:#75e3b1}.muted{color:#98a3bd} code{display:block;white-space:pre-wrap;background:#050812;border:1px solid #202944;border-radius:14px;padding:14px;margin-top:16px;color:#ffcf93}
</style>
</head>
<body><main><h1>AURA</h1><p class="ok">Passerelle Hostinger active sur le port 3000.</p><p>Le processus Node répond, mais le runtime Fastify complet n'a pas pu démarrer. Cette page empêche un 503 opaque et expose l'erreur réelle ci-dessous.</p><code>${safe}</code><p class="muted">Consulte aussi /healthz et les Runtime logs Hostinger.</p></main></body></html>`;
}

function startFallback(error) {
  console.error('[AURA] Fastify bootstrap failed; starting native recovery gateway:', error);
  fallbackServer = createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/healthz' || url === '/__aura_gateway') {
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify({
        ok: true,
        gateway_ready: true,
        gateway_port: port,
        application_ready: false,
        application_state: 'recovery',
        runtime_ready: false,
        framework: 'native-node-recovery',
        entry_file: 'server.js',
        startup_error: String(error?.message || error || ''),
      }));
      return;
    }
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
    res.end(fallbackHtml(error));
  });
  fallbackServer.on('error', (listenError) => {
    console.error('[AURA] recovery gateway failed:', listenError);
    process.exitCode = 1;
  });
  fallbackServer.listen(port, host, () => {
    console.log(`[AURA] recovery gateway listening on ${host}:${port}`);
  });
}

try {
  const runtime = await import('./src/server.js');
  app = runtime.app;
  stopAura = runtime.stopAura;

  app.get('/__aura_gateway', async () => ({
    ok: true,
    gateway_ready: true,
    gateway_port: port,
    application_ready: true,
    application_state: 'ready',
    runtime_ready: Boolean(runtime.bootstrap.runtimeReady),
    db_ready: Boolean(runtime.bootstrap.dbReady),
    framework: 'fastify',
    entry_file: 'server.js',
  }));

  await app.listen({ host, port });
  fullRuntimeStarted = true;
  console.log(`[AURA] Fastify listening directly on ${host}:${port}`);

  if (!gatewayOnly) {
    runtime.startRuntimeLoop();
  } else {
    console.log('[AURA] AURA_GATEWAY_ONLY=true — runtime loop disabled for smoke diagnostics.');
  }
} catch (error) {
  startFallback(error);
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[AURA] stopping on ${signal}`);
  try {
    if (fullRuntimeStarted) await stopAura();
    if (fallbackServer) {
      await new Promise((resolve) => fallbackServer.close(resolve));
    }
  } catch (error) {
    console.error('[AURA] shutdown warning:', error);
  } finally {
    process.exit(0);
  }
}

process.on('uncaughtException', (error) => {
  console.error('[AURA] uncaught exception:', error);
});
process.on('unhandledRejection', (error) => {
  console.error('[AURA] unhandled rejection:', error);
});
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
