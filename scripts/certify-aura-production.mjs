const DEFAULT_BASE = 'https://antiquewhite-dolphin-780448.hostingersite.com';
const base = String(process.env.AURA_PRODUCTION_URL || process.argv[2] || DEFAULT_BASE).replace(/\/$/, '');
const timeoutMs = Number(process.env.AURA_CERT_TIMEOUT_MS || 15000);
const outputPath = process.env.AURA_CERT_OUTPUT || 'aura-production-certification.json';
const expectedSha = String(process.env.AURA_EXPECTED_GIT_SHA || process.argv[3] || '').trim().toLowerCase();

const results = [];
let failures = 0;

function shaMatches(actual = '', expected = '') {
  const a = String(actual || '').trim().toLowerCase();
  const e = String(expected || '').trim().toLowerCase();
  if (!e) return Boolean(a);
  return Boolean(a && (a === e || a.startsWith(e) || e.startsWith(a)));
}

async function request(path, {
  expected = 200,
  predicate = null,
  method = 'GET',
  body = undefined,
  headers = {},
} = {}) {
  const url = base + path;
  const started = Date.now();
  let status = 0;
  let parsed = null;
  let text = '';
  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'AURA-Production-Certifier/2.0',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    status = response.status;
    text = await response.text();
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    const statusOk = Array.isArray(expected) ? expected.includes(status) : status === expected;
    const predicateOk = !predicate || predicate(parsed, response);
    const ok = statusOk && predicateOk;
    if (!ok) failures += 1;
    results.push({ path, ok, status, elapsed_ms: Date.now() - started, body: parsed });
    return { ok, status, body: parsed };
  } catch (cause) {
    failures += 1;
    results.push({
      path,
      ok: false,
      status,
      elapsed_ms: Date.now() - started,
      error: String(cause?.message || cause),
    });
    return { ok: false, status, body: null };
  }
}

const build = await request('/api/build', {
  predicate: (body) => Boolean(
    body
    && body.production_truth === true
    && body.provenance_verified === true
    && shaMatches(body.git_sha, expectedSha)
    && body.homeostasis === 'homeostasie_v9_unified'
    && String(body.cognition || '').startsWith('aura-cognition-native-')
  ),
});

await request('/healthz', {
  predicate: (body) => Boolean(
    body
    && body.ok === true
    && body.ready === true
    && body.db === true
    && body.kernel_started === true
    && shaMatches(body?.build?.git_sha, expectedSha || build.body?.git_sha)
  ),
});

await request('/api/bootstrap/status', {
  predicate: (body) => Boolean(
    body
    && body.runtime_ready === true
    && body.db_ready === true
    && Array.isArray(body.issues)
    && body.issues.length === 0
    && shaMatches(body.git_sha, expectedSha || build.body?.git_sha)
  ),
});

await request('/api/kernel/status', {
  predicate: (body) => Boolean(
    body
    && body.started === true
    && body.organism?.version === 'homeostasie_v9_unified'
    && body.cognition?.independent_from_language_model === true
  ),
});

await request('/api/capabilities', {
  predicate: (body) => Boolean(
    body
    && body.cognition?.ready === true
    && body.language?.native_dialogue_ready === true
    && body.organism?.version === 'homeostasie_v9_unified'
    && body.command_center?.started === true
  ),
});

await request('/api/curiosity/status', {
  predicate: (body) => Boolean(body && body.enabled === true && body.started === true),
});

await request('/api/command/status', {
  predicate: (body) => Boolean(
    body
    && body.enabled === true
    && body.started === true
    && body.director_mode === true
    && body.company_readiness
  ),
});

await request('/api/chat', {
  method: 'POST',
  body: { text: 'Que fais-tu en ce moment ?' },
  predicate: (body) => Boolean(
    body
    && typeof body.answer === 'string'
    && body.answer.trim().length >= 8
    && !/Je te suis\. Je reste sur ce que tu viens de dire\.?/i.test(body.answer)
  ),
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
  certification_version: '2.0-production-truth',
  base_url: base,
  expected_git_sha: expectedSha,
  deployed_git_sha: String(build.body?.git_sha || ''),
  sha_match: expectedSha ? shaMatches(build.body?.git_sha, expectedSha) : Boolean(build.body?.git_sha),
  certified_at: new Date().toISOString(),
  passed: failures === 0,
  failures,
  checks: results,
};

const { writeFile } = await import('node:fs/promises');
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
if (failures) process.exitCode = 1;
