import { createServer } from 'node:http';

const publicHost = '0.0.0.0';
const renderManagedPort = (process.env.RENDER || process.env.RENDER_SERVICE_ID)
  ? process.env.PORT
  : '';
const publicPort = Number.parseInt(process.env.AURA_PORT || renderManagedPort || '3000', 10) || 3000;
const gatewayOnly = process.env.AURA_GATEWAY_ONLY === 'true';

let app = null;
let bootstrap = null;
let stopAura = async () => {};
let applicationReady = false;
let startupError = '';
let fallbackServer = null;
let shuttingDown = false;

function safeError(error) {
  return String(error?.message || error || 'Erreur inconnue')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1000);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function gatewayState(framework = 'fastify') {
  return {
    ok: true,
    gateway_ready: true,
    gateway_port: publicPort,
    application_ready: applicationReady,
    application_state: applicationReady ? 'ready' : (startupError ? 'recovery' : 'booting'),
    runtime_ready: Boolean(bootstrap?.runtimeReady),
    db_ready: Boolean(bootstrap?.dbReady),
    framework,
    entry_file: 'server.js',
    startup_error: startupError,
  };
}

function recoveryHtml() {
  const error = startupError
    ? `<code>${escapeHtml(startupError)}</code>`
    : '<p class="muted">Chargement du runtime AURA en cours…</p>';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3">
<title>AURA — récupération</title>
<style>
body{margin:0;background:#070a12;color:#eef2ff;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:grid;min-height:100vh;place-items:center}
main{width:min(760px,calc(100% - 36px));padding:28px;border:1px solid #27304a;border-radius:22px;background:linear-gradient(145deg,#10172a,#0a0f1d);box-shadow:0 30px 90px #0008}
h1{margin:0 0 8px;font-size:34px}.ok{color:#75e3b1}.muted{color:#98a3bd}
code{display:block;white-space:pre-wrap;background:#050812;border:1px solid #202944;border-radius:14px;padding:14px;margin-top:16px;color:#ffcf93}
</style>
</head>
<body><main>
<h1>AURA</h1>
<p class="ok">Processus Hostinger actif sur le port ${publicPort}.</p>
<p>Le runtime Fastify n'a pas pu terminer son démarrage. L'erreur réelle est affichée ci-dessous.</p>
${error}
</main></body></html>`;
}

function startFallback(error) {
  startupError = safeError(error);
  if (fallbackServer) return;

  console.error('[AURA] Fastify bootstrap failed; starting single-listener recovery server:', error);

  fallbackServer = createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/healthz' || url === '/__aura_gateway') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(gatewayState('native-node-recovery')));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(recoveryHtml());
  });

  fallbackServer.on('error', (listenError) => {
    console.error('[AURA] recovery server failed:', listenError);
    process.exitCode = 1;
  });

  fallbackServer.listen(publicPort, publicHost, () => {
    console.log(`[AURA] recovery server listening on ${publicHost}:${publicPort}`);
  });
}

async function bootAura() {
  try {
    const runtime = await import('./src/server.js');
    app = runtime.app;
    bootstrap = runtime.bootstrap;
    stopAura = runtime.stopAura;

    app.get('/__aura_gateway', async () => gatewayState('fastify'));

    await app.listen({ host: publicHost, port: publicPort });
    applicationReady = true;
    startupError = '';
    console.log(`[AURA] Fastify listening directly on ${publicHost}:${publicPort}`);

    if (gatewayOnly) {
      console.log('[AURA] AURA_GATEWAY_ONLY=true — Fastify is online, runtime loop skipped.');
      return;
    }

    runtime.startRuntimeLoop();
  } catch (error) {
    applicationReady = false;
    startFallback(error);
  }
}

// Important for Hostinger/LiteSpeed lsnode:
// do not use top-level await here. lsnode loads this ESM entry through require().
void bootAura();

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[AURA] stopping on ${signal}`);

  try {
    if (applicationReady && app) {
      await stopAura();
    } else if (fallbackServer) {
      await new Promise((resolve) => fallbackServer.close(resolve));
    }
  } catch (error) {
    console.error('[AURA] shutdown warning:', error);
  }

  process.exit(0);
}

process.on('uncaughtException', (error) => {
  startupError = safeError(error);
  console.error('[AURA] uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  startupError = safeError(error);
  console.error('[AURA] unhandled rejection:', error);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
