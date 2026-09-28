import { createServer, request as httpRequest } from 'node:http';

const publicHost = '0.0.0.0';
const hostingerPort = 3000;
const configuredPort = Number.parseInt(
  process.env.PORT || process.env.AURA_GATEWAY_PORT || process.env.AURA_PORT || '3000',
  10,
) || 3000;
const publicPorts = [...new Set([hostingerPort, configuredPort])].filter(
  (port) => Number.isInteger(port) && port > 0 && port < 65536,
);
let internalPort = Number.parseInt(process.env.AURA_INTERNAL_PORT || '3988', 10) || 3988;
while (publicPorts.includes(internalPort)) internalPort += 1;

const gatewayOnly = process.env.AURA_GATEWAY_ONLY === 'true';

let app = null;
let bootstrap = null;
let stopAura = async () => {};
let applicationReady = false;
let startupError = '';
let shuttingDown = false;
const gatewayServers = new Map();

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

function gatewayState(port, framework = applicationReady ? 'fastify-via-native-gateway' : 'native-node-recovery') {
  return {
    ok: true,
    gateway_ready: true,
    gateway_port: port,
    gateway_ports: publicPorts,
    internal_port: internalPort,
    application_ready: applicationReady,
    application_state: applicationReady ? 'ready' : (startupError ? 'recovery' : 'booting'),
    runtime_ready: Boolean(bootstrap?.runtimeReady),
    db_ready: Boolean(bootstrap?.dbReady),
    framework,
    entry_file: 'server.js',
    startup_error: startupError,
  };
}

function recoveryHtml(port) {
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
<p class="ok">Passerelle Hostinger active sur le port ${port}.</p>
<p>Le runtime AURA est ${startupError ? 'en récupération' : 'en cours de démarrage'}.</p>
${error}
</main></body></html>`;
}

function sendGatewayJson(res, port) {
  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(gatewayState(port)));
}

function proxyToAura(req, res, port) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').trim();
  const headers = {
    ...req.headers,
    host: `127.0.0.1:${internalPort}`,
    'x-forwarded-host': String(req.headers.host || ''),
    'x-forwarded-proto': String(req.headers['x-forwarded-proto'] || 'https'),
    'x-forwarded-port': String(port),
  };
  if (forwardedFor) headers['x-forwarded-for'] = forwardedFor;

  const upstream = httpRequest({
    host: '127.0.0.1',
    port: internalPort,
    path: req.url || '/',
    method: req.method,
    headers,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
    upstreamRes.pipe(res);
  });

  upstream.on('error', (error) => {
    startupError = safeError(error);
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(JSON.stringify({
      ...gatewayState(port, 'native-gateway-upstream-error'),
      error: 'AURA internal runtime temporarily unavailable',
    }));
  });

  req.pipe(upstream);
}

function handleGateway(port, req, res) {
  const url = req.url || '/';

  if (url === '/__aura_gateway') {
    sendGatewayJson(res, port);
    return;
  }

  if (!applicationReady) {
    if (url === '/healthz') {
      sendGatewayJson(res, port);
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(recoveryHtml(port));
    return;
  }

  proxyToAura(req, res, port);
}

function startPublicGateways() {
  for (const port of publicPorts) {
    const server = createServer((req, res) => handleGateway(port, req, res));
    gatewayServers.set(port, server);

    server.on('error', (error) => {
      startupError = safeError(error);
      console.error(`[AURA] public gateway failed on ${publicHost}:${port}`, error);
    });

    server.listen(port, publicHost, () => {
      console.log(`[AURA] Hostinger gateway listening on ${publicHost}:${port}`);
    });
  }
}

async function bootAura() {
  try {
    const runtime = await import('./src/server.js');
    app = runtime.app;
    bootstrap = runtime.bootstrap;
    stopAura = runtime.stopAura;

    await app.listen({ host: '127.0.0.1', port: internalPort });
    applicationReady = true;
    startupError = '';
    console.log(`[AURA] Fastify internal runtime listening on 127.0.0.1:${internalPort}`);

    if (gatewayOnly) {
      console.log('[AURA] AURA_GATEWAY_ONLY=true — gateways online, runtime loop skipped.');
      return;
    }

    runtime.startRuntimeLoop();
  } catch (error) {
    applicationReady = false;
    startupError = safeError(error);
    console.error('[AURA] Fastify bootstrap failed; native Hostinger gateways remain online:', error);
  }
}

// Hostinger/LiteSpeed may require() this ESM entry. Keep the entry graph free of top-level await.
// Open the public listeners first so Hostinger never sees a dead application while AURA imports.
startPublicGateways();
void bootAura();

async function closeGateway(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[AURA] stopping on ${signal}`);

  try {
    if (applicationReady && app) {
      await stopAura();
      await app.close();
    }
  } catch (error) {
    console.error('[AURA] runtime shutdown warning:', error);
  }

  for (const server of gatewayServers.values()) {
    try {
      await closeGateway(server);
    } catch (error) {
      console.error('[AURA] gateway shutdown warning:', error);
    }
  }

  process.exit(0);
}

process.on('uncaughtException', (error) => {
  startupError = safeError(error);
  applicationReady = false;
  console.error('[AURA] uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  startupError = safeError(error);
  console.error('[AURA] unhandled rejection:', error);
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
