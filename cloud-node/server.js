import { createServer, request as httpRequest } from 'node:http';

const publicHost = '0.0.0.0';
const production = process.env.NODE_ENV === 'production';
const requestedPort = Number.parseInt(
  process.env.AURA_PORT || process.env.PORT || process.env.AURA_GATEWAY_PORT || '3000',
  10,
);
const publicPort = production ? 3000 : (requestedPort || 3000);
const gatewayOnly = process.env.AURA_GATEWAY_ONLY === 'true';

let app = null;
let bootstrap = null;
let stopAura = async () => {};
let internalPort = null;
let applicationReady = false;
let startupError = '';
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

function gatewayState() {
  return {
    ok: true,
    gateway_ready: true,
    gateway_port: publicPort,
    application_ready: applicationReady,
    application_state: applicationReady ? 'ready' : (startupError ? 'recovery' : 'booting'),
    runtime_ready: Boolean(bootstrap?.runtimeReady),
    db_ready: Boolean(bootstrap?.dbReady),
    framework: applicationReady ? 'fastify-behind-node-gateway' : 'native-node-gateway',
    entry_file: 'server.js',
    internal_port: internalPort,
    startup_error: startupError,
  };
}

function recoveryHtml() {
  const state = gatewayState();
  const error = state.startup_error
    ? `<code>${escapeHtml(state.startup_error)}</code>`
    : '<p class="muted">Chargement du runtime AURA en cours…</p>';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="2">
<title>AURA — démarrage</title>
<style>
body{margin:0;background:#070a12;color:#eef2ff;font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;display:grid;min-height:100vh;place-items:center}
main{width:min(760px,calc(100% - 36px));padding:28px;border:1px solid #27304a;border-radius:22px;background:linear-gradient(145deg,#10172a,#0a0f1d);box-shadow:0 30px 90px #0008}
h1{margin:0 0 8px;font-size:34px}.ok{color:#75e3b1}.muted{color:#98a3bd}
code{display:block;white-space:pre-wrap;background:#050812;border:1px solid #202944;border-radius:14px;padding:14px;margin-top:16px;color:#ffcf93}
</style>
</head>
<body><main>
<h1>AURA</h1>
<p class="ok">Passerelle Hostinger active sur le port ${publicPort}.</p>
<p>Le serveur public est déjà vivant. AURA charge maintenant son runtime derrière cette passerelle.</p>
${error}
</main></body></html>`;
}

function sendGatewayResponse(req, res, statusCode = 200) {
  if ((req.url || '/') === '/healthz' || (req.url || '/') === '/__aura_gateway') {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify(gatewayState()));
    return;
  }

  res.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(recoveryHtml());
}

function proxyToAura(req, res) {
  const headers = { ...req.headers };
  delete headers.connection;
  headers.host = `127.0.0.1:${internalPort}`;
  headers['x-forwarded-host'] = String(req.headers.host || '');
  headers['x-forwarded-proto'] = String(req.headers['x-forwarded-proto'] || 'https');
  headers['x-forwarded-for'] = [
    req.headers['x-forwarded-for'],
    req.socket.remoteAddress,
  ].filter(Boolean).join(', ');

  const upstream = httpRequest({
    host: '127.0.0.1',
    port: internalPort,
    method: req.method,
    path: req.url,
    headers,
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });

  upstream.on('error', (error) => {
    applicationReady = false;
    startupError = `Proxy interne AURA: ${safeError(error)}`;
    if (!res.headersSent) sendGatewayResponse(req, res, 200);
    else res.end();
  });

  req.on('aborted', () => upstream.destroy());
  req.pipe(upstream);
}

const gateway = createServer((req, res) => {
  const url = req.url || '/';

  if (url === '/healthz' || url === '/__aura_gateway') {
    sendGatewayResponse(req, res, 200);
    return;
  }

  if (!applicationReady || !internalPort) {
    sendGatewayResponse(req, res, 200);
    return;
  }

  proxyToAura(req, res);
});

gateway.keepAliveTimeout = 65_000;
gateway.headersTimeout = 70_000;

gateway.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

gateway.on('error', (error) => {
  console.error('[AURA] public gateway failed:', error);
  process.exitCode = 1;
});

await new Promise((resolve, reject) => {
  gateway.once('error', reject);
  gateway.listen(publicPort, publicHost, () => {
    gateway.off('error', reject);
    console.log(`[AURA] Hostinger gateway listening immediately on ${publicHost}:${publicPort}`);
    resolve();
  });
});

async function bootAura() {
  try {
    const runtime = await import('./src/server.js');
    app = runtime.app;
    bootstrap = runtime.bootstrap;
    stopAura = runtime.stopAura;

    if (gatewayOnly) {
      console.log('[AURA] AURA_GATEWAY_ONLY=true — public gateway active, Fastify boot skipped.');
      return;
    }

    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    internalPort = Number.parseInt(new URL(address).port, 10);
    applicationReady = true;
    startupError = '';
    console.log(`[AURA] Fastify ready behind gateway on 127.0.0.1:${internalPort}`);

    runtime.startRuntimeLoop();
  } catch (error) {
    applicationReady = false;
    startupError = safeError(error);
    console.error('[AURA] Fastify bootstrap failed; public gateway remains online:', error);
  }
}

bootAura();

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[AURA] stopping on ${signal}`);
  try {
    if (applicationReady && app) await stopAura();
  } catch (error) {
    console.error('[AURA] shutdown warning:', error);
  }

  await new Promise((resolve) => gateway.close(resolve));
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
