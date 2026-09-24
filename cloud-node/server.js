import { createServer } from 'node:http';

try {
  await import('./src/server.js');
} catch (error) {
  const port = Number.parseInt(process.env.PORT || '3000', 10) || 3000;
  const host = '0.0.0.0';
  const message = String(error?.message || error || 'unknown startup error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  console.error('[AURA bootstrap] Full runtime failed to start:', error);

  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (request.url === '/healthz' || request.url === '/api/bootstrap/status') {
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        ok: true,
        ready: false,
        status: 'bootstrap-fallback',
        server_ready: true,
        runtime_ready: false,
        error_code: 'AURA_FULL_RUNTIME_START_FAILED',
      }));
      return;
    }

    const safeMessage = message.replace(/[&<>"']/g, '');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(\`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AURA Cloud — diagnostic</title>
<style>
body{margin:0;background:#070912;color:#f4f6fb;font-family:system-ui,-apple-system,Segoe UI,sans-serif;display:grid;min-height:100vh;place-items:center;padding:24px}
main{width:min(720px,100%);padding:28px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:#111626}
h1{margin:0 0 8px;font-size:28px}p{color:#aeb7c9;line-height:1.55}.ok{color:#66dfa1}.box{margin-top:18px;padding:14px;border-radius:14px;background:#0a0d17;border:1px solid rgba(255,255,255,.08);font:13px ui-monospace,SFMono-Regular,Consolas,monospace;color:#d8deeb;word-break:break-word}
</style>
</head>
<body><main>
<h1>AURA Cloud</h1>
<p class="ok">Le serveur Node Hostinger répond.</p>
<p>Le runtime complet n'a pas pu démarrer. Cette page de secours empêche un 503 et confirme que Node écoute correctement.</p>
<div class="box">AURA_FULL_RUNTIME_START_FAILED<br>\${safeMessage}</div>
</main></body></html>\`);
  });

  server.listen(port, host, () => {
    console.log(\`[AURA bootstrap] Diagnostic fallback listening on \${host}:\${port}\`);
  });
}
