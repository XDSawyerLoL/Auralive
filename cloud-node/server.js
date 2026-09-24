import { createServer } from 'node:http';

const host = '0.0.0.0';
const port = Number.parseInt(process.env.AURA_GATEWAY_PORT || '3000', 10) || 3000;
const MAX_BODY = 1_048_576;

let auraApp = null;
let auraModule = null;
let appState = 'loading';
let appError = '';

function cleanError(error) {
  return String(error?.message || error || 'unknown startup error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
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

function gatewayJson() {
  return {
    ok: true,
    gateway_ready: true,
    gateway_port: port,
    application_ready: appState === 'ready',
    application_state: appState,
    runtime_ready: Boolean(auraModule?.bootstrap?.runtimeReady),
    db_ready: Boolean(auraModule?.bootstrap?.dbReady),
    error_code: appError ? 'AURA_APPLICATION_BOOT_FAILED' : '',
  };
}

function fallbackHtml() {
  const detail = appError
    ? safeHtml(appError)
    : appState === 'loading'
      ? 'Chargement de l’application AURA dans le même processus Node…'
      : 'Le noyau cognitif attend encore sa configuration.';
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080b14">
<title>AURA Cloud</title>
<style>
:root{color-scheme:dark;--bg:#070912;--panel:#111626;--line:rgba(255,255,255,.1);--text:#f4f6fb;--muted:#9ba6ba;--green:#52d694;--amber:#ffc768;--red:#ff758d}
*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 20% 0,rgba(124,84,255,.25),transparent 34rem),var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;padding:24px;display:grid;place-items:center}
main{width:min(760px,100%);border:1px solid var(--line);border-radius:24px;background:rgba(17,22,38,.88);padding:26px;box-shadow:0 20px 70px rgba(0,0,0,.35)}
.top{display:flex;align-items:center;gap:13px}.orb{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 35% 32%,#fff 0 4%,#bca8ff 10%,#7650ff 35%,#20144d 68%,#080b14 75%);box-shadow:0 0 34px rgba(140,102,255,.45)}
h1{margin:0;font-size:24px;letter-spacing:.08em}.muted{color:var(--muted)}.ok{color:var(--green)}.warn{color:var(--amber)}.bad{color:var(--red)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}.card{border:1px solid var(--line);background:rgba(255,255,255,.025);padding:14px;border-radius:15px}.card b{display:block;margin-bottom:6px}.box{margin-top:16px;padding:14px;border-radius:14px;background:#090c15;border:1px solid var(--line);font:12px ui-monospace,SFMono-Regular,Consolas,monospace;color:#d8deeb;word-break:break-word}
@media(max-width:640px){.grid{grid-template-columns:1fr}}
</style>
</head>
<body><main>
<div class="top"><div class="orb"></div><div><h1>AURA CLOUD</h1><div class="muted">Hostinger · processus unique</div></div></div>
<p class="ok">Le serveur Node répond sur le port 3000.</p>
<p class="muted">Fastify ne dépend plus d’un second port interne : l’interface et le noyau vivent dans le même processus.</p>
<div class="grid">
  <div class="card"><b>Gateway</b><span class="ok">ACTIF</span></div>
  <div class="card"><b>Application AURA</b><span class="${appState === 'failed' ? 'bad' : 'warn'}">${safeHtml(appState.toUpperCase())}</span></div>
  <div class="card"><b>Port public</b><span>3000</span></div>
  <div class="card"><b>Port interne</b><span>SUPPRIMÉ</span></div>
</div>
<div class="box">${detail}</div>
</main></body></html>`;
}

function sendFallback(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.url === '/healthz' || request.url === '/api/bootstrap/status' || request.url === '/__aura_gateway') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(gatewayJson()));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(fallbackHtml());
}

function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    request.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    request.on('error', reject);
  });
}

async function dispatchToAura(request, response) {
  if (!auraApp) {
    sendFallback(request, response);
    return;
  }

  try {
    const payload = await readBody(request);
    const injected = await auraApp.inject({
      method: request.method,
      url: request.url,
      headers: request.headers,
      payload,
    });

    const headers = { ...injected.headers };
    delete headers.connection;
    delete headers['transfer-encoding'];
    response.writeHead(injected.statusCode, headers);

    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    response.end(injected.rawPayload ?? Buffer.from(injected.payload || ''));
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    response.writeHead(status >= 400 && status < 600 ? status : 500, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify({
      error: status >= 500 ? 'Erreur gateway AURA' : cleanError(error),
    }));
  }
}

const gateway = createServer((request, response) => {
  if (request.url === '/__aura_gateway') {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(JSON.stringify(gatewayJson()));
    return;
  }
  dispatchToAura(request, response);
});

gateway.on('error', (error) => {
  console.error('[AURA gateway] Fatal listener error:', error);
  process.exitCode = 1;
});

gateway.listen(port, host, () => {
  console.log(`[AURA gateway] listening on ${host}:${port}`);
});

setImmediate(async () => {
  try {
    auraModule = await import('./src/server.js');
    await auraModule.app.ready();
    auraApp = auraModule.app;
    appState = 'ready';
    appError = '';
    auraModule.startRuntimeLoop();
    console.log('[AURA gateway] Fastify embedded in-process; second listener removed.');
  } catch (error) {
    appState = 'failed';
    appError = cleanError(error);
    console.error('[AURA gateway] application bootstrap failed:', error);
  }
});

async function shutdown(signal) {
  console.log(`[AURA gateway] stopping on ${signal}`);
  try {
    await auraModule?.stopAura?.();
  } catch (error) {
    console.error('[AURA gateway] AURA shutdown warning:', error);
  }
  gateway.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
