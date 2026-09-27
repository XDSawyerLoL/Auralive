const DEFAULT_BASE = 'https://antiquewhite-dolphin-780448.hostingersite.com';
const base = String(process.env.AURA_PRODUCTION_URL || process.argv[2] || DEFAULT_BASE).replace(/\/$/, '');
const timeoutMs = Number(process.env.AURA_CERT_TIMEOUT_MS || 15000);
const outputPath = process.env.AURA_CERT_OUTPUT || 'aura-production-certification.json';

const results = [];
let failures = 0;

async function request(path, { expected = 200, predicate = null } = {}) {
  const url = base + path;
  const started = Date.now();
  let status = 0;
  let body = null;
  let text = '';
  let error = '';
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'AURA-Production-Certifier/1.0' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    status = response.status;
    text = await response.text();
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    const statusOk = Array.isArray(expected) ? expected.includes(status) : status === expected;
    const predicateOk = !predicate || predicate(body, response);
    const ok = statusOk && predicateOk;
    if (!ok) failures += 1;
    results.push({ path, url, ok, status, elapsed_ms: Date.now() - started, body });
    return { ok, status, body };
  } catch (cause) {
    error = String(cause?.message || cause);
    failures += 1;
    results.push({ path, url, ok: false, status, elapsed_ms: Date.now() - started, error });
    return { ok: false, status, body: null };
  }
}

await request('/healthz', {
  predicate: (body) => Boolean(
    body
    && body.ok === true
    && body.ready === true
    && body.db === true
    && body.kernel_started === true
  ),
});

await request('/api/bootstrap/status', {
  predicate: (body) => Boolean(
    body
    && body.runtime_ready === true
    && body.db_ready === true
    && Array.isArray(body.issues)
    && body.issues.length === 0
  ),
});

await request('/api/kernel/status', {
  predicate: (body) => Boolean(body && body.started === true),
});

await request('/api/curiosity/status', {
  predicate: (body) => Boolean(body && body.enabled === true && body.started === true),
});

await request('/api/command/status', {
  predicate: (body) => Boolean(body && body.enabled === true && body.started === true),
});

for (const path of [
  '/api/kernel/soul',
  '/api/kernel/organism',
  '/api/kernel/lessons',
  '/api/kernel/intentions',
  '/api/kernel/activity',
  '/api/kernel/work',
  '/api/kernel/attention',
]) {
  await request(path, { expected: 401 });
}

const report = {
  product: 'AURA Cloud',
  certification_version: '1.0',
  base_url: base,
  certified_at: new Date().toISOString(),
  passed: failures === 0,
  failures,
  checks: results,
};

const { writeFile } = await import('node:fs/promises');
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
if (failures) process.exitCode = 1;
