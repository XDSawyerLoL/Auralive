import { createHash } from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { clamp } from './policy.js';

const clean = (value, limit = 4000) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

function stableId(value) {
  return clean(value, 180).replace(/[^a-zA-Z0-9._:-]/g, '-');
}

function manifestHash(manifest) {
  return createHash('sha256')
    .update(JSON.stringify({
      id: manifest.id,
      transport: manifest.transport,
      tags: manifest.tags,
      side_effects: manifest.side_effects,
      input_contract: manifest.input_contract,
      output_contract: manifest.output_contract,
    }))
    .digest('hex');
}

export function normalizeCapability(raw = {}) {
  const id = stableId(raw.id);
  if (!id) throw new Error('capability id manquant');
  const transport = clean(raw.transport || 'local', 80);
  if (!['local', 'edge-http', 'studio-bridge', 'mesh-worker', 'peer-p2p'].includes(transport)) {
    throw new Error(`transport capability non autorisé: ${transport}`);
  }
  const tags = [...new Set(
    (Array.isArray(raw.tags) ? raw.tags : [])
      .map((tag) => stableId(tag))
      .filter(Boolean),
  )].slice(0, 24);
  const normalized = {
    id,
    name: clean(raw.name || id, 240),
    transport,
    endpoint: clean(raw.endpoint, 1400),
    tags,
    trust: clamp(raw.trust ?? 0.5),
    observed_reliability: clamp(raw.observed_reliability ?? raw.trust ?? 0.5),
    latency_ms: Math.max(0, Number(raw.latency_ms || 0)),
    cost_microunits: Math.max(0, Number(raw.cost_microunits || 0)),
    side_effects: Boolean(raw.side_effects),
    risk: clean(raw.risk || (raw.side_effects ? 'remote-write' : 'safe'), 80),
    input_contract: raw.input_contract && typeof raw.input_contract === 'object'
      ? raw.input_contract
      : {},
    output_contract: raw.output_contract && typeof raw.output_contract === 'object'
      ? raw.output_contract
      : {},
    provider: clean(raw.provider || 'aura', 160),
    region: clean(raw.region || 'global', 120),
    version: clean(raw.version || '1', 80),
    enabled: raw.enabled !== false,
  };
  return {
    ...normalized,
    manifest_hash: manifestHash(normalized),
  };
}

export function scoreCapability(capability, {
  requiredTags = [],
  allowSideEffects = false,
  maxCostMicrounits = 0,
} = {}) {
  if (!capability?.enabled) return -Infinity;
  if (capability.side_effects && !allowSideEffects) return -Infinity;
  if (maxCostMicrounits > 0 && capability.cost_microunits > maxCostMicrounits) return -Infinity;
  const tags = new Set(capability.tags || []);
  const requested = requiredTags.filter(Boolean);
  if (requested.some((tag) => !tags.has(tag))) return -Infinity;
  const trust = clamp(capability.trust ?? 0.5);
  const reliability = clamp(capability.observed_reliability ?? trust);
  const latencyPenalty = Math.min(0.2, Number(capability.latency_ms || 0) / 20000);
  const costPenalty = maxCostMicrounits > 0
    ? Math.min(0.15, Number(capability.cost_microunits || 0) / maxCostMicrounits * 0.15)
    : 0;
  return Number((trust * 0.46 + reliability * 0.46 + Math.min(0.08, requested.length * 0.02)
    - latencyPenalty - costPenalty).toFixed(6));
}

export class CapabilityFabric {
  static VERSION = 'aura-capability-fabric-v1';

  constructor({ webSubstrate = null, bridge = null, peerMesh = null } = {}) {
    this.webSubstrate = webSubstrate;
    this.bridge = bridge;
    this.peerMesh = peerMesh;
    this.registry = new Map();
    this.handlers = new Map();
    this.lastDiscoveryAt = '';
    this.lastExecutionAt = '';
    this.lastError = '';
    this.executionCount = 0;
    this.meshNodes = 0;
    this.started = false;
    this.discoveryTimer = null;
    this.registerBuiltins();
  }

  get enabled() {
    return Boolean(config.fabricEnabled);
  }

  async persistCapability(capability) {
    const item = capability || {};
    const stamp = new Date().toISOString();
    await query(
      `INSERT INTO aura_fabric_capabilities(
        id,manifest,manifest_hash,transport,provider,trust,observed_reliability,
        latency_ms,cost_microunits,side_effects,last_seen_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        manifest=VALUES(manifest),
        manifest_hash=VALUES(manifest_hash),
        transport=VALUES(transport),
        provider=VALUES(provider),
        trust=VALUES(trust),
        observed_reliability=VALUES(observed_reliability),
        latency_ms=VALUES(latency_ms),
        cost_microunits=VALUES(cost_microunits),
        side_effects=VALUES(side_effects),
        last_seen_at=VALUES(last_seen_at),
        updated_at=VALUES(updated_at)`,
      [
        item.id,
        JSON.stringify(item).slice(0, 50000),
        item.manifest_hash,
        item.transport,
        item.provider,
        Number(item.trust || 0),
        Number(item.observed_reliability || 0),
        Math.max(0, Number(item.latency_ms || 0)),
        Math.max(0, Number(item.cost_microunits || 0)),
        item.side_effects ? 1 : 0,
        stamp,
        stamp,
      ],
    );
  }

  async hydrate() {
    try {
      const rows = await query(
        `SELECT manifest FROM aura_fabric_capabilities
         ORDER BY observed_reliability DESC,updated_at DESC LIMIT ?`,
        [Math.max(1, Math.min(config.fabricMaxRemoteCapabilities * 4, 256))],
      );
      for (const row of rows) {
        try {
          const parsed = JSON.parse(row.manifest || '{}');
          if (!parsed?.id || parsed.transport === 'local' || parsed.transport === 'studio-bridge') continue;
          this.register(parsed);
        } catch {}
      }
      return { ok: true, restored: rows.length };
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 1000);
      return { ok: false, restored: 0, error: this.lastError };
    }
  }

  async recordObservation(capability, { ok, elapsedMs = 0 } = {}) {
    const current = this.registry.get(capability.id) || capability;
    const alpha = 0.18;
    const previousReliability = clamp(current.observed_reliability ?? current.trust ?? 0.5);
    const sample = ok ? 1 : 0;
    const previousLatency = Math.max(0, Number(current.latency_ms || elapsedMs || 0));
    const next = normalizeCapability({
      ...current,
      observed_reliability: previousReliability * (1 - alpha) + sample * alpha,
      latency_ms: previousLatency
        ? previousLatency * (1 - alpha) + Math.max(0, elapsedMs) * alpha
        : Math.max(0, elapsedMs),
    });
    this.registry.set(next.id, next);
    await this.persistCapability(next).catch(() => {});
    return next;
  }

  async recordGraph(graph, { status = 'planned', result = {} } = {}) {
    if (!graph?.id) return;
    const stamp = new Date().toISOString();
    await query(
      `INSERT INTO aura_fabric_graphs(id,objective,graph,status,result,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         graph=VALUES(graph),status=VALUES(status),result=VALUES(result),updated_at=VALUES(updated_at)`,
      [
        String(graph.id).slice(0, 120),
        clean(graph.objective, 10000),
        JSON.stringify(graph).slice(0, 200000),
        String(status).slice(0, 40),
        JSON.stringify(result || {}).slice(0, 200000),
        stamp,
        stamp,
      ],
    );
  }

  async recordNodeRun(graphId, node, outcome = {}) {
    await query(
      `INSERT INTO aura_fabric_node_runs(
        graph_id,node_id,capability_id,ok,elapsed_ms,result,error,created_at
      ) VALUES(?,?,?,?,?,?,?,?)`,
      [
        String(graphId || '').slice(0, 120),
        String(node?.id || '').slice(0, 120),
        String(node?.capability || '').slice(0, 180),
        outcome?.ok === false ? 0 : 1,
        Math.max(0, Number(outcome?.metrics?.elapsed_ms || 0)),
        JSON.stringify(outcome?.result ?? {}).slice(0, 100000),
        String(outcome?.error || '').slice(0, 5000),
        new Date().toISOString(),
      ],
    );
  }

  register(manifest, handler = null) {
    const normalized = normalizeCapability(manifest);
    this.registry.set(normalized.id, normalized);
    if (handler) this.handlers.set(normalized.id, handler);
    return normalized;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    await this.hydrate();
    await this.refreshMesh().catch(() => {});
    await this.refreshPeers().catch(() => {});
    if (!this.enabled || !config.fabricDiscoveryUrls.length) return;
    const discover = () => this.discoverRemote().catch((error) => {
      this.lastError = String(error?.message || error).slice(0, 1000);
    });
    await discover();
    this.discoveryTimer = setInterval(
      discover,
      config.fabricDiscoverySeconds * 1000,
    );
    this.discoveryTimer.unref?.();
  }

  stop() {
    if (this.discoveryTimer) clearInterval(this.discoveryTimer);
    this.discoveryTimer = null;
    this.started = false;
  }

  registerBuiltins() {
    if (this.webSubstrate) {
      this.register({
        id: 'web.research',
        name: 'Web evidence research',
        transport: 'local',
        tags: ['research', 'web', 'evidence', 'read'],
        trust: 0.88,
        observed_reliability: 0.82,
        latency_ms: 2500,
        side_effects: false,
        risk: 'safe',
        input_contract: { question: 'string' },
        output_contract: { epistemic_status: 'string', evidence: 'array' },
        provider: 'aura-web-substrate',
      }, async (input, options) => {
        const question = clean(input?.question || input?.objective, 6000);
        if (!question) throw new Error('web.research exige question');
        const result = await this.webSubstrate.research(question, {
          trigger: options?.trigger || 'fabric',
        });
        return {
          ok: result?.ok !== false,
          result,
          evidence: result?.evidence || [],
          verification: {
            epistemic_status: result?.epistemic_status || 'unverified',
            confidence: Number(result?.confidence || 0),
          },
          metrics: {
            cost_microunits: 0,
            sources: Number(result?.evidence_count || 0),
          },
        };
      });

      this.register({
        id: 'web.fetch',
        name: 'Safe HTTPS document fetch',
        transport: 'local',
        tags: ['web', 'read', 'fetch'],
        trust: 0.8,
        observed_reliability: 0.8,
        latency_ms: 800,
        side_effects: false,
        risk: 'safe',
        input_contract: { url: 'https-url' },
        output_contract: { text: 'string', content_type: 'string' },
        provider: 'aura-web-substrate',
      }, async (input) => {
        const url = clean(input?.url, 1800);
        if (!url) throw new Error('web.fetch exige url');
        const result = await this.webSubstrate.fetchText(url);
        return {
          ok: true,
          result,
          evidence: [{ source_url: result.url, stance: 'neutral' }],
          metrics: { cost_microunits: 0 },
        };
      });
    }

    if (this.bridge) {
      this.register({
        id: 'studio.operator',
        name: 'Quantic Studio authenticated operator',
        transport: 'studio-bridge',
        tags: ['action', 'local', 'operator'],
        trust: 0.94,
        observed_reliability: 0.9,
        latency_ms: 1200,
        side_effects: true,
        risk: 'local-control',
        input_contract: { objective: 'string' },
        output_contract: { job_id: 'string' },
        provider: 'quantic-studio',
      }, async (input) => {
        if (!this.bridge.enabled) throw new Error('Quantic Studio bridge désactivé');
        const online = await this.bridge.workerOnline().catch(() => false);
        if (!online) throw new Error('Quantic Studio hors ligne');
        const objective = clean(input?.objective, 6000);
        if (!objective) throw new Error('studio.operator exige objective');
        const task = [
          objective,
          input?.dependencies && Object.keys(input.dependencies).length
            ? 'Contexte dépendances: ' + JSON.stringify(input.dependencies).slice(0, 12000)
            : '',
        ].filter(Boolean).join('\n');
        const result = await this.bridge.operate(task, ['local-control']);
        return {
          ok: true,
          result,
          verification: { authority: 'authenticated-local-worker' },
          metrics: { cost_microunits: 0 },
        };
      });

      this.register({
        id: 'mesh.compute',
        name: 'AURA voluntary deterministic compute mesh',
        transport: 'mesh-worker',
        tags: ['compute', 'mesh', 'deterministic', 'vector'],
        trust: 0.72,
        observed_reliability: 0.72,
        latency_ms: 1800,
        side_effects: false,
        risk: 'safe',
        input_contract: { op: 'sha256|sum|dot|cosine', values: 'array', left: 'array', right: 'array' },
        output_contract: { value: 'json', op: 'string' },
        provider: 'aura-compute-mesh',
        enabled: false,
      }, async (input, options) => this.bridge.executeMesh('compute', input, {
        capability: 'compute',
        quorum: options?.quorum || 1,
        verification: options?.verification || 'none',
      }));

      this.register({
        id: 'mesh.inference',
        name: 'AURA voluntary local-model mesh inference',
        transport: 'mesh-worker',
        tags: ['compute', 'mesh', 'inference', 'ai', 'reasoning'],
        trust: 0.68,
        observed_reliability: 0.68,
        latency_ms: 3500,
        side_effects: false,
        risk: 'safe',
        input_contract: { prompt: 'string', system: 'string', max_tokens: 'integer' },
        output_contract: { answer: 'string' },
        provider: 'aura-compute-mesh',
        enabled: false,
      }, async (input, options) => {
        const prompt = clean(input?.prompt || input?.question || input?.objective, 50000);
        if (!prompt) throw new Error('mesh.inference exige prompt, question ou objective');
        return this.bridge.executeMesh('inference', {
          prompt,
          system: clean(input?.system, 20000),
          max_tokens: Math.max(64, Math.min(Number(input?.max_tokens || 700), 8000)),
          task_role: clean(input?.task_role || 'reasoning', 80),
        }, {
          capability: 'inference',
          quorum: options?.quorum || 1,
          verification: options?.verification || 'none',
        });
      });
    }

    if (this.peerMesh) {
      this.register({
        id: 'mesh.webgpu',
        name: 'AURA signed WebRTC/WebGPU peer compute',
        transport: 'peer-p2p',
        tags: ['compute', 'mesh', 'p2p', 'webrtc', 'webgpu', 'vector'],
        trust: 0.78,
        observed_reliability: 0.74,
        latency_ms: 2200,
        side_effects: false,
        risk: 'safe',
        input_contract: { op: 'dot|cosine|vector_add|vector_sub|vector_mul|axpy', left: 'array', right: 'array', alpha: 'number?' },
        output_contract: { value: 'json', engine: 'webgpu|cpu-js' },
        provider: 'aura-peer-mesh',
        enabled: false,
      }, async (input, options) => this.peerMesh.execute('webgpu', input, {
        timeoutMs: config.meshP2pTimeoutMs,
        quorum: options?.quorum || 1,
      }));
    }
  }

  list({ includeDisabled = false } = {}) {
    return [...this.registry.values()]
      .filter((item) => includeDisabled || item.enabled)
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  select({
    capabilityId = '',
    requiredTags = [],
    allowSideEffects = false,
    maxCostMicrounits = 0,
  } = {}) {
    if (capabilityId) {
      const item = this.registry.get(stableId(capabilityId));
      if (!item) return null;
      const score = scoreCapability(item, { requiredTags, allowSideEffects, maxCostMicrounits });
      return Number.isFinite(score) ? { ...item, routing_score: score } : null;
    }
    let best = null;
    for (const item of this.registry.values()) {
      const score = scoreCapability(item, { requiredTags, allowSideEffects, maxCostMicrounits });
      if (!Number.isFinite(score)) continue;
      if (!best || score > best.routing_score) best = { ...item, routing_score: score };
    }
    return best;
  }

  async refreshMesh() {
    if (!this.bridge || typeof this.bridge.workers !== 'function') {
      this.meshNodes = 0;
      return { nodes: 0, compute: 0, inference: 0 };
    }
    const workers = await this.bridge.workers({ onlineOnly: true, computeOnly: true });
    const compute = workers.filter((item) => item.mesh_capabilities?.includes('compute'));
    const inference = workers.filter((item) => item.mesh_capabilities?.includes('inference'));
    this.meshNodes = workers.length;

    const update = (id, rows) => {
      const current = this.registry.get(id);
      if (!current) return;
      const best = rows.length
        ? Math.max(...rows.map((item) => Number(item.reputation || 0.5)))
        : 0;
      this.register({
        ...current,
        enabled: rows.length > 0,
        trust: rows.length ? Math.min(0.92, 0.55 + best * 0.35) : current.trust,
        observed_reliability: rows.length ? Math.min(0.95, 0.45 + best * 0.5) : current.observed_reliability,
      });
    };
    update('mesh.compute', compute);
    update('mesh.inference', inference);
    return { nodes: workers.length, compute: compute.length, inference: inference.length };
  }

  async refreshPeers() {
    if (!this.peerMesh || typeof this.peerMesh.peers !== 'function') return { peers: 0, webgpu: 0 };
    const peers = await this.peerMesh.peers({ onlineOnly: true });
    const webrtc = peers.filter((item) => item.capabilities?.includes('webrtc'));
    const webgpu = peers.filter((item) =>
      item.capabilities?.includes('webrtc') && item.capabilities?.includes('webgpu'));
    const current = this.registry.get('mesh.webgpu');
    if (current) {
      const best = webgpu.length
        ? Math.max(...webgpu.map((item) => Number(item.reputation || 0.5)))
        : 0;
      this.register({
        ...current,
        enabled: webgpu.length >= 1 && webrtc.length >= 2,
        trust: webgpu.length >= 1 && webrtc.length >= 2 ? Math.min(0.94, 0.62 + best * 0.32) : current.trust,
        observed_reliability: webgpu.length >= 1 && webrtc.length >= 2
          ? Math.min(0.96, 0.52 + best * 0.44)
          : current.observed_reliability,
      });
    }
    return { peers: peers.length, webrtc: webrtc.length, webgpu: webgpu.length };
  }

  async discoverRemote() {
    const endpoints = Array.isArray(config.fabricDiscoveryUrls)
      ? config.fabricDiscoveryUrls
      : [];
    const discovered = [];
    for (const baseRaw of endpoints) {
      const base = String(baseRaw || '').replace(/\/$/, '');
      if (!base) continue;
      try {
        if (this.webSubstrate) await this.webSubstrate.assertSafeUrl(base + '/v1/capabilities');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.fabricRequestTimeoutMs);
        try {
          const headers = { Accept: 'application/json', 'User-Agent': 'AURA-Capability-Fabric/1.0' };
          if (config.fabricToken) headers.Authorization = 'Bearer ' + config.fabricToken;
          const response = await fetch(base + '/v1/capabilities', {
            headers,
            redirect: 'error',
            signal: controller.signal,
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const rows = Array.isArray(body?.capabilities) ? body.capabilities : [];
          for (const raw of rows.slice(0, config.fabricMaxRemoteCapabilities)) {
            const item = this.register({
              ...raw,
              endpoint: base,
              transport: 'edge-http',
              provider: raw?.provider || new URL(base).hostname,
              trust: Math.min(clamp(raw?.trust ?? 0.6), config.fabricRemoteTrustCeiling),
              observed_reliability: Math.min(
                clamp(raw?.observed_reliability ?? raw?.trust ?? 0.6),
                config.fabricRemoteTrustCeiling,
              ),
            });
            await this.persistCapability(item).catch(() => {});
            discovered.push(item.id);
          }
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        this.lastError = String(error?.message || error).slice(0, 1000);
      }
    }
    this.lastDiscoveryAt = new Date().toISOString();
    return discovered;
  }

  async executeRemote(capability, input, {
    trigger = 'fabric',
    maxCostMicrounits = 0,
    verification = 'none',
    quorum = 1,
  } = {}) {
    if (!capability.endpoint) throw new Error('endpoint remote absent');
    if (capability.side_effects) {
      throw new Error('effet de bord remote interdit par politique AURA');
    }
    if (maxCostMicrounits > 0 && capability.cost_microunits > maxCostMicrounits) {
      throw new Error('budget capability dépassé');
    }
    const base = capability.endpoint.replace(/\/$/, '');
    if (this.webSubstrate) await this.webSubstrate.assertSafeUrl(base + '/v1/execute');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fabricRequestTimeoutMs);
    try {
      const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'AURA-Capability-Fabric/1.0',
      };
      if (config.fabricToken) headers.Authorization = 'Bearer ' + config.fabricToken;
      const response = await fetch(base + '/v1/execute', {
        method: 'POST',
        headers,
        redirect: 'error',
        body: JSON.stringify({
          capability: capability.id,
          manifest_hash: capability.manifest_hash,
          input,
          context: {
            trigger,
            verification,
            quorum,
          },
        }),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
      if (body?.manifest_hash && body.manifest_hash !== capability.manifest_hash) {
        throw new Error('manifest capability modifié pendant exécution');
      }
      return {
        ok: body?.ok !== false,
        result: body?.result ?? body,
        evidence: Array.isArray(body?.evidence) ? body.evidence : [],
        verification: body?.verification || {},
        metrics: {
          ...(body?.metrics || {}),
          cost_microunits: Math.max(
            Number(body?.metrics?.cost_microunits || 0),
            Number(capability.cost_microunits || 0),
          ),
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async execute(capabilityId, input = {}, options = {}) {
    const capability = this.select({
      capabilityId,
      allowSideEffects: Boolean(options.allowSideEffects),
      maxCostMicrounits: Number(options.maxCostMicrounits || 0),
    });
    if (!capability) throw new Error(`capability indisponible ou interdite: ${capabilityId}`);

    const started = Date.now();
    try {
      let outcome;
      if (capability.transport === 'edge-http') {
        outcome = await this.executeRemote(capability, input, options);
      } else {
        const handler = this.handlers.get(capability.id);
        if (!handler) throw new Error(`handler local absent: ${capability.id}`);
        outcome = await handler(input, options);
      }
      const elapsedMs = Date.now() - started;
      this.executionCount += 1;
      this.lastExecutionAt = new Date().toISOString();
      this.lastError = '';
      await this.recordObservation(capability, { ok: outcome?.ok !== false, elapsedMs }).catch(() => {});
      return {
        ...outcome,
        capability: capability.id,
        provider: capability.provider,
        manifest_hash: capability.manifest_hash,
        metrics: {
          ...(outcome?.metrics || {}),
          elapsed_ms: elapsedMs,
        },
      };
    } catch (error) {
      const elapsedMs = Date.now() - started;
      this.lastError = String(error?.message || error).slice(0, 1000);
      await this.recordObservation(capability, { ok: false, elapsedMs }).catch(() => {});
      throw error;
    }
  }

  status() {
    const all = this.list({ includeDisabled: true });
    return {
      version: CapabilityFabric.VERSION,
      enabled: Boolean(config.fabricEnabled),
      started: this.started,
      capabilities: all.length,
      local: all.filter((item) => item.transport === 'local').length,
      edge: all.filter((item) => item.transport === 'edge-http').length,
      studio: all.filter((item) => item.transport === 'studio-bridge').length,
      mesh: all.filter((item) => item.transport === 'mesh-worker' && item.enabled).length,
      mesh_nodes: this.meshNodes,
      p2p: all.filter((item) => item.transport === 'peer-p2p' && item.enabled).length,
      remote_side_effects: false,
      discovery_urls: config.fabricDiscoveryUrls.length,
      last_discovery_at: this.lastDiscoveryAt,
      last_execution_at: this.lastExecutionAt,
      executions: this.executionCount,
      last_error: this.lastError,
      arbitrary_remote_shell: false,
      policy: 'typed-capabilities-only',
    };
  }
}
