const CAPABILITIES = [
  {
    id: 'edge.json.project',
    name: 'JSON projection',
    transport: 'edge-http',
    tags: ['compute', 'json', 'transform'],
    trust: 0.82,
    observed_reliability: 0.82,
    latency_ms: 15,
    cost_microunits: 1,
    side_effects: false,
    risk: 'safe',
    input_contract: { object: 'json', paths: 'string[]' },
    output_contract: { projected: 'json' },
    provider: 'cloudflare-workers',
    version: '1',
  },
  {
    id: 'edge.text.compact',
    name: 'Text compaction',
    transport: 'edge-http',
    tags: ['compute', 'text', 'transform'],
    trust: 0.82,
    observed_reliability: 0.82,
    latency_ms: 15,
    cost_microunits: 1,
    side_effects: false,
    risk: 'safe',
    input_contract: { text: 'string', max_chars: 'number' },
    output_contract: { text: 'string' },
    provider: 'cloudflare-workers',
    version: '1',
  },
  {
    id: 'edge.hash.sha256',
    name: 'SHA-256 digest',
    transport: 'edge-http',
    tags: ['compute', 'hash', 'verify'],
    trust: 0.9,
    observed_reliability: 0.9,
    latency_ms: 10,
    cost_microunits: 1,
    side_effects: false,
    risk: 'safe',
    input_contract: { value: 'string' },
    output_contract: { sha256: 'hex' },
    provider: 'cloudflare-workers',
    version: '1',
  },
];

const encoder = new TextEncoder();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function authorized(request, env) {
  const expected = String(env.AURA_FABRIC_TOKEN || '').trim();
  if (!expected) return false;
  const value = String(request.headers.get('authorization') || '');
  return value === `Bearer ${expected}`;
}

function projectPath(value, path) {
  let current = value;
  for (const part of String(path || '').split('.').filter(Boolean)) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(value || '')));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function execute(capability, input, env) {
  if (capability === 'edge.json.project') {
    const source = input?.object && typeof input.object === 'object' ? input.object : {};
    const paths = Array.isArray(input?.paths) ? input.paths.slice(0, 64) : [];
    const projected = {};
    for (const path of paths) {
      const key = String(path || '').slice(0, 240);
      if (!key) continue;
      const value = projectPath(source, key);
      if (value !== undefined) projected[key] = value;
    }
    return { projected };
  }

  if (capability === 'edge.text.compact') {
    const limit = Math.max(64, Math.min(Number(input?.max_chars || 4000), 20000));
    const text = String(input?.text || '').replace(/\s+/g, ' ').trim().slice(0, limit);
    return { text };
  }

  if (capability === 'edge.hash.sha256') {
    return { sha256: await sha256(input?.value) };
  }

  if (capability === 'edge.vector.query') {
    if (!env.AURA_INDEX) throw new Error('Vectorize binding AURA_INDEX absent');
    const vector = Array.isArray(input?.vector) ? input.vector.map(Number) : [];
    if (!vector.length || vector.some((item) => !Number.isFinite(item))) {
      throw new Error('vector invalide');
    }
    const topK = Math.max(1, Math.min(Number(input?.top_k || 8), 32));
    const matches = await env.AURA_INDEX.query(vector, {
      topK,
      returnMetadata: 'all',
      returnValues: false,
    });
    return { matches: matches?.matches || [] };
  }

  throw new Error('capability inconnue');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({
        ok: true,
        service: 'aura-fabric-edge',
        vectorize: Boolean(env.AURA_INDEX),
        arbitrary_code: false,
      });
    }

    if (url.pathname === '/v1/capabilities' && request.method === 'GET') {
      const capabilities = [...CAPABILITIES];
      if (env.AURA_INDEX) {
        capabilities.push({
          id: 'edge.vector.query',
          name: 'Vector routing query',
          transport: 'edge-http',
          tags: ['memory', 'vector', 'read', 'routing'],
          trust: 0.86,
          observed_reliability: 0.86,
          latency_ms: 25,
          cost_microunits: 2,
          side_effects: false,
          risk: 'safe',
          input_contract: { vector: 'number[]', top_k: 'number' },
          output_contract: { matches: 'array' },
          provider: 'cloudflare-vectorize',
          version: '1',
        });
      }
      return json({ version: 'aura-fabric-edge-v1', capabilities });
    }

    if (url.pathname === '/v1/execute' && request.method === 'POST') {
      if (!authorized(request, env)) return json({ error: 'unauthorized' }, 401);
      let body = {};
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid json' }, 400);
      }
      const capability = String(body?.capability || '');
      const allowed = new Set([
        ...CAPABILITIES.map((item) => item.id),
        ...(env.AURA_INDEX ? ['edge.vector.query'] : []),
      ]);
      if (!allowed.has(capability)) {
        return json({ error: 'capability not allowed' }, 403);
      }
      try {
        const started = Date.now();
        const result = await execute(capability, body?.input || {}, env);
        return json({
          ok: true,
          result,
          verification: { executor: 'cloudflare-worker', arbitrary_code: false },
          metrics: {
            elapsed_ms: Date.now() - started,
            cost_microunits: capability === 'edge.vector.query' ? 2 : 1,
          },
        });
      } catch (error) {
        return json({ ok: false, error: String(error?.message || error) }, 422);
      }
    }

    return json({ error: 'not found' }, 404);
  },
};
