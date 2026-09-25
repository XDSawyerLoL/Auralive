const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function detectWebGpu() {
  if (!globalThis.navigator?.gpu) return { available: false };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return { available: Boolean(adapter) };
  } catch {
    return { available: false };
  }
}

export class AuraMeshBrowserPeer {
  constructor({
    baseUrl = '',
    llmAdapter = null,
    pollMs = 900,
    heartbeatMs = 15000,
  } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '');
    this.llmAdapter = llmAdapter;
    this.pollMs = Math.max(350, Number(pollMs || 900));
    this.heartbeatMs = Math.max(5000, Number(heartbeatMs || 15000));
    this.peerId = '';
    this.peerToken = '';
    this.running = false;
    this.jobsCompleted = 0;
    this.jobsFailed = 0;
    this.lastError = '';
    this.loopPromise = null;
  }

  async request(path, body = {}) {
    const headers = { 'content-type': 'application/json' };
    if (this.peerId && this.peerToken) {
      headers['x-aura-peer-id'] = this.peerId;
      headers.authorization = 'Bearer ' + this.peerToken;
    }
    const response = await fetch(this.baseUrl + path, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || ('HTTP ' + response.status));
    return data;
  }

  async capabilities() {
    const webgpu = await detectWebGpu();
    const llm = Boolean(this.llmAdapter?.generate);
    return {
      runtime: 'browser',
      webgpu: webgpu.available,
      wasm: typeof WebAssembly !== 'undefined',
      webnn: Boolean(globalThis.navigator?.ml),
      tags: [
        'compute',
        webgpu.available ? 'webgpu' : '',
        typeof WebAssembly !== 'undefined' ? 'wasm' : '',
        llm ? 'llm' : '',
      ].filter(Boolean),
    };
  }

  models() {
    const values = this.llmAdapter?.models?.();
    return Array.isArray(values) ? values.map(String).filter(Boolean).slice(0, 24) : [];
  }

  async register() {
    const response = await this.request('/api/mesh/register', {
      capabilities: await this.capabilities(),
      models: this.models(),
    });
    this.peerId = String(response?.peer_id || '');
    this.peerToken = String(response?.peer_token || '');
    if (!this.peerId || !this.peerToken) throw new Error('Identité Compute Mesh absente');
    return response;
  }

  async heartbeat() {
    if (!this.peerId || !this.peerToken) await this.register();
    return this.request('/api/mesh/heartbeat', {
      capabilities: await this.capabilities(),
      models: this.models(),
    });
  }

  async execute(assignment) {
    const kind = String(assignment?.kind || '');
    const payload = assignment?.payload && typeof assignment.payload === 'object'
      ? assignment.payload
      : {};

    if (kind === 'mesh.hash.sha256') {
      return { sha256: await sha256(payload.value) };
    }

    if (kind === 'mesh.benchmark') {
      const iterations = Math.max(1000, Math.min(Number(payload.iterations || 250000), 1000000));
      let checksum = 0;
      for (let i = 0; i < iterations; i += 1) {
        checksum = (checksum + Math.imul(i + 1, 2654435761)) >>> 0;
      }
      return { iterations, checksum };
    }

    if (kind === 'llm.chat') {
      if (!this.llmAdapter?.generate) throw new Error('Adaptateur SLM navigateur non chargé');
      const text = await this.llmAdapter.generate({
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        temperature: Number(payload.temperature ?? 0.35),
        maxTokens: Math.max(32, Math.min(Number(payload.max_tokens || 900), 1800)),
        modelHint: String(assignment?.model_hint || ''),
      });
      return {
        text: String(text || ''),
        model: String(this.llmAdapter.currentModel?.() || ''),
        runtime: 'browser-webgpu',
      };
    }

    throw new Error('Type de tâche Compute Mesh non supporté par le navigateur');
  }

  async pollOnce() {
    const claim = await this.request('/api/mesh/claim', {});
    const assignment = claim?.assignment;
    if (!assignment) return false;
    const started = performance.now();
    try {
      const result = await this.execute(assignment);
      await this.request('/api/mesh/complete', {
        assignment_id: assignment.id,
        result,
        latency_ms: Math.round(performance.now() - started),
      });
      this.jobsCompleted += 1;
    } catch (error) {
      this.jobsFailed += 1;
      await this.request('/api/mesh/complete', {
        assignment_id: assignment.id,
        error: String(error?.message || error).slice(0, 4000),
        latency_ms: Math.round(performance.now() - started),
      }).catch(() => {});
      throw error;
    }
    return true;
  }

  async loop() {
    let nextHeartbeat = 0;
    while (this.running) {
      try {
        if (Date.now() >= nextHeartbeat) {
          await this.heartbeat();
          nextHeartbeat = Date.now() + this.heartbeatMs;
        }
        const worked = await this.pollOnce();
        if (!worked) await sleep(this.pollMs);
        this.lastError = '';
      } catch (error) {
        this.lastError = String(error?.message || error).slice(0, 1000);
        await sleep(Math.min(5000, this.pollMs * 3));
      }
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;
    await this.register();
    this.loopPromise = this.loop();
  }

  async stop() {
    this.running = false;
    await Promise.race([
      this.loopPromise || Promise.resolve(),
      sleep(1200),
    ]).catch(() => {});
    this.loopPromise = null;
    this.peerToken = '';
    this.peerId = '';
  }

  diagnostic() {
    return {
      peer_id: this.peerId,
      running: this.running,
      jobs_completed: this.jobsCompleted,
      jobs_failed: this.jobsFailed,
      last_error: this.lastError,
    };
  }
}
