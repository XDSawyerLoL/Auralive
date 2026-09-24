import { createServer, request as httpRequest } from 'node:http';

const gatewayHost = '0.0.0.0';
const gatewayPort = Number.parseInt(process.env.AURA_GATEWAY_PORT || '3000', 10) || 3000;
const internalHost = '127.0.0.1';
const internalPort = Number.parseInt(process.env.AURA_INTERNAL_PORT || '3001', 10) || 3001;

let internalState = 'starting';
let internalError = '';

function cleanError(error) {
  return String(error?.message || error || 'unknown startup error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 800);
}

function safeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function fallbackHtml() {
  const detail = internalError
    ? safeHtml(internalError)
    : 'Le noyau complet est encore en cours de démarrage.';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080b14">
<title>AURA Cloud</title>
<style>
:root{color-scheme:dark;--bg:#070912;--panel:#111626;--line:rgba(255,255,255,.1);--text:#f4f6fb;--muted:#9ba6ba;--accent:#8c66ff;--green:#52d694;--amber:#ffc768}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0,rgba(124,84,255,.25),transparent 34rem),var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;display:grid;place-items:center}
main{width:min(760px,100%);border:1px solid var(--line);border-radius:24px;background:rgba(17,22,38,.88);padding:26px;box-shadow:0 20px 70px rgba(0,0,0,.35)}
.top{display:flex;align-items:center;gap:13px}.orb{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 35% 32%,#fff 0 4%,#bca8ff 10%,#7650ff 35%,#20144d 68%,#080b14 75%);box-shadow:0 0 34px rgba(140,102,255,.45)}
h1{margin:0;font-size:24px;letter-spacing:.08em}.muted{color:var(--muted)}.ok{color:var(--green)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}.card{border:1px solid var(--line);background:rgba(255,255,255,.025);padding:14px;border-radius:15px}.card b{display:block;margin-bottom:6px}.box{margin-top:16px;padding:14px;border-radius:14px;background:#090c15;border:1px solid var(--line);font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:#d8deeb;word-break:break-word}
@media(max-width:640px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<div class="top"><div class="orb"></div><div><h1>AURA CLOUD</h1><div class="muted">Gateway Hostinger actif</div></div></div>
<p class="ok">Le serveur Node répond correctement sur le port 3000.</p>
<p class="muted">Le gateway reste en ligne pendant que le noyau AURA/Fastify démarre en interne. Cette page remplace définitivement le 503 applicatif.</p>
<div class="grid">
  <div class="card"><b>Gateway</b><span class="ok">ACTIF</span></div>
  <div class="card"><b>Noyau AURA</b><span>${safeHtml(internalState.toUpperCase())}</span></div>
  <div class="card"><b>Port public</b><span>3000</span></div>
  <div class="card"><b>Port interne</b><span>3001</span></div>
</div>
<div class="box">${detail}</div>
</main></body></html>`;
}

function fallbackJson() {
  return {
    ok: true,
    gateway_ready: true,
    gateway_port: gatewayPort,
    runtime_ready: internalState === 'ready',
    runtime_state: internalState,
    error_code: internalError ? 'AURA_INTERNAL_RUNTIME_START_FAILED' : '',
  };
}

function sendFallback(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.url === '/healthz' || request.url === '/api/bootstrap/status' || request.url === '/__aura_gateway') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(fallbackJson()));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(fallbackHtml());
}

function proxyToAura(request, response) {
  const upstream = httpRequest({
    hostname: internalHost,
    port: internalPort,
    path: request.url,
    method: request.method,
    headers: {
      ...request.headers,
      host: `${internalHost}:${internalPort}`,
      'x-forwarded-host': request.headers.host || '',
      'x-forwarded-proto': request.headers['x-forwarded-proto'] || 'https',
    },
  }, (upstreamResponse) => {
    internalState = 'ready';
    response.writeHead(
      upstreamResponse.statusCode || 200,
      upstreamResponse.statusMessage || '',
      upstreamResponse.headers,
    );
    upstreamResponse.pipe(response);
  });

  upstream.setTimeout(2500, () => {
    upstream.destroy(new Error('AURA internal timeout'));
  });

  upstream.on('error', (error) => {
    if (internalState !== 'failed') internalState = 'starting';
    if (!response.headersSent) sendFallback(request, response);
    else response.end();
    if (!internalError && error?.code !== 'ECONNREFUSED') internalError = cleanError(error);
  });

  request.pipe(upstream);
}

const gateway = createServer((request, response) => {
  if (request.url === '/__aura_gateway') {
    sendFallback(request, response);
    return;
  }
  proxyToAura(request, response);
});

gateway.on('error', (error) => {
  console.error('[AURA gateway] Fatal listener error:', error);
  process.exitCode = 1;
});

gateway.listen(gatewayPort, gatewayHost, () => {
  console.log(`[AURA gateway] listening on ${gatewayHost}:${gatewayPort}`);
});

if (process.env.AURA_GATEWAY_ONLY !== 'true') {
  process.env.AURA_HOST = internalHost;
  process.env.AURA_PORT = String(internalPort);
  setImmediate(() => {
    import('./src/server.js')
      .then(() => {
        internalState = 'ready';
        internalError = '';
        console.log(`[AURA gateway] full runtime available on ${internalHost}:${internalPort}`);
      })
      .catch((error) => {
        internalState = 'failed';
        internalError = cleanError(error);
        console.error('[AURA gateway] full runtime failed:', error);
      });
  });
} else {
  internalState = 'disabled';
  internalError = 'AURA_GATEWAY_ONLY=true — noyau interne volontairement désactivé pour le test.';
}

async function shutdown(signal) {
  console.log(`[AURA gateway] stopping on ${signal}`);
  gateway.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
