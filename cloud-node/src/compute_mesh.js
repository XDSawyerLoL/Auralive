import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { config } from './config.js';
import { one, query } from './db.js';
import { clamp } from './policy.js';

const now = () => new Date().toISOString();
const nowMs = () => Date.now();

const clean = (value, limit = 4000) =>
  String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function tokenHash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) =>
    JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
}

function resultHash(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizeTags(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source
    .map((item) => clean(item, 80).toLowerCase())
    .filter(Boolean))].slice(0, 40);
}

function normalizeModels(value) {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source
    .map((item) => clean(item, 240))
    .filter(Boolean))].slice(0, 24);
}

const RESERVED_PEER_TAGS = new Set(['trusted', 'private', 'secret', 'action', 'operator']);

function peerTags(value, trusted = false) {
  const tags = normalizeTags(value);
  return trusted ? tags : tags.filter((tag) => !RESERVED_PEER_TAGS.has(tag));
}

export function peerRoutingScore(peer, {
  requiredTags = [],
  modelHint = '',
} = {}) {
  const tags = new Set(normalizeTags(peer.capabilities?.tags || peer.tags || []));
  if (requiredTags.some((tag) => !tags.has(String(tag).toLowerCase()))) return -Infinity;
  const models = normalizeModels(peer.models || []);
  if (modelHint && models.length && !models.includes(modelHint)) return -Infinity;

  const reputation = clamp(peer.reputation ?? 0.5);
  const agreement = clamp(peer.agreement_rate ?? 0.5);
  const reliability = clamp(peer.reliability ?? 0.5);
  const latency = Math.max(0, Number(peer.latency_ms || 0));
  const latencyPenalty = Math.min(0.18, latency / 15000);
  const webgpuBonus = peer.webgpu ? 0.04 : 0;
  const warmModelBonus = modelHint && models.includes(modelHint) ? 0.08 : 0;

  return Number((
    reputation * 0.34
    + reliability * 0.30
    + agreement * 0.24
    + webgpuBonus
    + warmModelBonus
    - latencyPenalty
  ).toFixed(6));
}

export class ComputeMesh {
  static VERSION = 'aura-compute-mesh-v1';

  constructor() {
    this.started = false;
    this.cleanupTimer = null;
    this.lastError = '';
    this.lastDispatchAt = '';
    this.lastCompletionAt = '';
  }

  get enabled() {
    return Boolean(config.computeMeshEnabled);
  }

  async start() {
    if (this.started) return;
    this.started = true;
    if (!this.enabled) return;
    const cleanup = () => this.cleanup().catch((error) => {
      this.lastError = String(error?.message || error).slice(0, 1000);
    });
    await cleanup();
    this.cleanupTimer = setInterval(cleanup, Math.max(30, config.computeMeshCleanupSeconds) * 1000);
    this.cleanupTimer.unref?.();
  }

  stop() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    this.started = false;
  }

  async cleanup() {
    const staleBefore = nowMs() - config.computeMeshPeerTtlSeconds * 1000;
    const leaseBefore = nowMs();
    await query(
      `UPDATE aura_mesh_peers
       SET status='offline',updated_at=?
       WHERE status='online' AND last_seen_ms < ?`,
      [now(), staleBefore],
    );
    await query(
      `UPDATE aura_mesh_assignments a
       JOIN aura_mesh_peers p ON p.id=a.peer_id
       SET a.status='failed',a.error='Pair Mesh hors ligne',a.lease_expires_ms=0,a.updated_at=?
       WHERE a.status IN ('queued','leased') AND p.status='offline'`,
      [now()],
    );
    await query(
      `UPDATE aura_mesh_assignments
       SET status='failed',error='Lease Mesh expiré',lease_expires_ms=0,updated_at=?
       WHERE status='leased' AND lease_expires_ms > 0 AND lease_expires_ms < ?`,
      [now(), leaseBefore],
    );
    await this.rebalanceOpenTasks().catch(() => {});
  }

  async registerPeer(input = {}, { trusted = false } = {}) {
    if (!this.enabled) throw new Error('Compute Mesh désactivé');
    const token = randomBytes(32).toString('base64url');
    const peerId = randomUUID();
    const stamp = now();
    const capabilities = {
      tags: peerTags(input?.capabilities?.tags || input?.tags || [], trusted),
      runtime: clean(input?.capabilities?.runtime || input?.runtime || 'browser', 80),
      wasm: Boolean(input?.capabilities?.wasm ?? input?.wasm),
      webgpu: Boolean(input?.capabilities?.webgpu ?? input?.webgpu),
      webnn: Boolean(input?.capabilities?.webnn ?? input?.webnn),
    };
    const models = normalizeModels(input?.models || []);
    const webgpu = Boolean(capabilities.webgpu);
    const trustTier = trusted ? 'trusted' : 'public';

    await query(
      `INSERT INTO aura_mesh_peers(
        id,token_hash,trust_tier,status,capabilities,models,webgpu,
        vram_mb,memory_mb,reputation,reliability,agreement_rate,latency_ms,
        jobs_ok,jobs_failed,last_seen_ms,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        peerId,
        tokenHash(token),
        trustTier,
        'online',
        JSON.stringify(capabilities).slice(0, 16000),
        JSON.stringify(models).slice(0, 16000),
        webgpu ? 1 : 0,
        Math.max(0, Math.min(Number(input?.vram_mb || 0), 262144)),
        Math.max(0, Math.min(Number(input?.memory_mb || 0), 1048576)),
        trusted ? 0.72 : 0.5,
        trusted ? 0.72 : 0.5,
        0.5,
        Math.max(0, Math.min(Number(input?.latency_ms || 0), 120000)),
        0,
        0,
        nowMs(),
        stamp,
        stamp,
      ],
    );

    return {
      peer_id: peerId,
      peer_token: token,
      trust_tier: trustTier,
      expires_after_seconds: config.computeMeshPeerTtlSeconds,
      policy: {
        public_tasks_only_for_public_peers: true,
        secret_tasks_never_distributed: true,
        side_effects: false,
      },
    };
  }

  async authenticate(peerId, token) {
    const row = await one(
      `SELECT * FROM aura_mesh_peers
       WHERE id=? AND token_hash=? LIMIT 1`,
      [String(peerId || ''), tokenHash(token)],
    );
    if (!row) return null;
    const staleBefore = nowMs() - config.computeMeshPeerTtlSeconds * 2 * 1000;
    if (Number(row.last_seen_ms || 0) < staleBefore) return null;
    return {
      ...row,
      capabilities: parseJson(row.capabilities, {}),
      models: parseJson(row.models, []),
      webgpu: Boolean(row.webgpu),
      reputation: Number(row.reputation || 0),
      reliability: Number(row.reliability || 0),
      agreement_rate: Number(row.agreement_rate || 0),
      latency_ms: Number(row.latency_ms || 0),
    };
  }

  async heartbeat(peer, input = {}) {
    const capabilities = {
      ...(peer.capabilities || {}),
      tags: peerTags(
        input?.capabilities?.tags || input?.tags || peer.capabilities?.tags || [],
        peer.trust_tier === 'trusted',
      ),
      runtime: clean(input?.capabilities?.runtime || peer.capabilities?.runtime || 'browser', 80),
      wasm: Boolean(input?.capabilities?.wasm ?? peer.capabilities?.wasm),
      webgpu: Boolean(input?.capabilities?.webgpu ?? input?.webgpu ?? peer.webgpu),
      webnn: Boolean(input?.capabilities?.webnn ?? peer.capabilities?.webnn),
    };
    const models = normalizeModels(input?.models || peer.models || []);
    const observedLatency = Math.max(0, Math.min(Number(input?.latency_ms || peer.latency_ms || 0), 120000));
    const nextLatency = peer.latency_ms
      ? peer.latency_ms * 0.82 + observedLatency * 0.18
      : observedLatency;

    await query(
      `UPDATE aura_mesh_peers
       SET status='online',capabilities=?,models=?,webgpu=?,vram_mb=?,memory_mb=?,
           latency_ms=?,last_seen_ms=?,updated_at=?
       WHERE id=?`,
      [
        JSON.stringify(capabilities).slice(0, 16000),
        JSON.stringify(models).slice(0, 16000),
        capabilities.webgpu ? 1 : 0,
        Math.max(0, Math.min(Number(input?.vram_mb || peer.vram_mb || 0), 262144)),
        Math.max(0, Math.min(Number(input?.memory_mb || peer.memory_mb || 0), 1048576)),
        nextLatency,
        nowMs(),
        now(),
        peer.id,
      ],
    );
    await this.rebalanceOpenTasks().catch(() => {});
    return { ok: true, peer_id: peer.id, next_heartbeat_seconds: config.computeMeshHeartbeatSeconds };
  }

  async onlinePeers({
    requiredTags = [],
    modelHint = '',
    dataClass = 'public',
    limit = 32,
  } = {}) {
    if (dataClass === 'secret' || dataClass === 'local') return [];
    const cutoff = nowMs() - config.computeMeshPeerTtlSeconds * 1000;
    const rows = await query(
      `SELECT * FROM aura_mesh_peers
       WHERE status='online' AND last_seen_ms >= ?
       ORDER BY reputation DESC,reliability DESC,latency_ms ASC
       LIMIT ?`,
      [cutoff, Math.max(1, Math.min(Number(limit || 32), 128))],
    );
    return rows
      .map((row) => ({
        ...row,
        capabilities: parseJson(row.capabilities, {}),
        models: parseJson(row.models, []),
        webgpu: Boolean(row.webgpu),
        reputation: Number(row.reputation || 0),
        reliability: Number(row.reliability || 0),
        agreement_rate: Number(row.agreement_rate || 0),
        latency_ms: Number(row.latency_ms || 0),
      }))
      .filter((peer) => dataClass === 'public' || peer.trust_tier === 'trusted')
      .map((peer) => ({
        ...peer,
        routing_score: peerRoutingScore(peer, { requiredTags, modelHint }),
      }))
      .filter((peer) => Number.isFinite(peer.routing_score))
      .sort((a, b) => b.routing_score - a.routing_score);
  }

  async rebalanceTask(taskId) {
    const task = await one(
      `SELECT * FROM aura_mesh_tasks
       WHERE id=? AND status IN ('queued','running','waiting') LIMIT 1`,
      [String(taskId || '')],
    );
    if (!task || nowMs() >= Number(task.deadline_ms || 0)) return 0;

    const existing = await query(
      'SELECT peer_id,status FROM aura_mesh_assignments WHERE task_id=?',
      [task.id],
    );
    const used = new Set(existing.map((row) => String(row.peer_id || '')));
    const usableAssignments = existing.filter((row) =>
      !['failed', 'rejected', 'cancelled'].includes(String(row.status || '')));
    const missing = Math.max(0, Number(task.replicas || 1) - usableAssignments.length);
    if (!missing) return 0;

    const peers = await this.onlinePeers({
      requiredTags: parseJson(task.required_tags, []),
      modelHint: String(task.model_hint || ''),
      dataClass: String(task.data_class || 'private'),
      limit: Math.max(16, missing * 6),
    });
    const selected = peers.filter((peer) => !used.has(peer.id)).slice(0, missing);
    const stamp = now();
    for (const peer of selected) {
      await query(
        `INSERT IGNORE INTO aura_mesh_assignments(
          id,task_id,peer_id,status,lease_expires_ms,result,result_hash,
          latency_ms,error,created_at,updated_at
        ) VALUES(?,?,?,'queued',0,'{}','',0,'',?,?)`,
        [randomUUID(), task.id, peer.id, stamp, stamp],
      );
    }
    if (selected.length) {
      await query(
        "UPDATE aura_mesh_tasks SET status='running',error='',updated_at=? WHERE id=?",
        [now(), task.id],
      );
    }
    return selected.length;
  }

  async rebalanceOpenTasks(limit = 24) {
    const rows = await query(
      `SELECT id FROM aura_mesh_tasks
       WHERE status IN ('queued','running','waiting') AND deadline_ms > ?
       ORDER BY created_at ASC LIMIT ?`,
      [nowMs(), Math.max(1, Math.min(Number(limit || 24), 100))],
    );
    let assigned = 0;
    for (const row of rows) assigned += await this.rebalanceTask(row.id);
    return assigned;
  }

  async enqueueTask({
    kind,
    payload = {},
    dataClass = 'public',
    requiredTags = [],
    modelHint = '',
    replicas = 1,
    quorum = 1,
    consensusMode = 'any',
    timeoutMs = 30000,
    source = 'aura',
  } = {}) {
    if (!this.enabled) throw new Error('Compute Mesh désactivé');
    const normalizedClass = ['public', 'private', 'secret', 'local'].includes(dataClass)
      ? dataClass
      : 'private';
    if (normalizedClass === 'secret' || normalizedClass === 'local') {
      throw new Error('Cette classe de données ne peut pas quitter le nœud AURA local');
    }
    const taskKind = clean(kind, 120);
    if (!taskKind) throw new Error('kind Mesh requis');
    if (!config.computeMeshAllowedTaskKinds.has(taskKind)) {
      throw new Error(`Type de tâche Mesh non autorisé: ${taskKind}`);
    }
    const payloadText = JSON.stringify(payload || {});
    if (Buffer.byteLength(payloadText) > config.computeMeshMaxPayloadBytes) {
      throw new Error('payload Mesh trop volumineux');
    }

    const desiredReplicas = Math.max(1, Math.min(Number(replicas || 1), config.computeMeshMaxReplicas));
    const desiredQuorum = Math.max(1, Math.min(Number(quorum || 1), desiredReplicas));
    const peers = await this.onlinePeers({
      requiredTags: normalizeTags(requiredTags),
      modelHint,
      dataClass: normalizedClass,
      limit: Math.max(desiredReplicas * 4, 16),
    });
    const selected = peers.slice(0, desiredReplicas);
    const id = randomUUID();
    const stamp = now();
    const deadlineMs = nowMs() + Math.max(1000, Math.min(Number(timeoutMs || 30000), config.computeMeshMaxTaskMs));

    await query(
      `INSERT INTO aura_mesh_tasks(
        id,kind,data_class,payload,required_tags,model_hint,replicas,quorum,
        consensus_mode,status,source,deadline_ms,result,error,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,'queued',?,?, '{}','',?,?)`,
      [
        id,
        taskKind,
        normalizedClass,
        payloadText,
        JSON.stringify(normalizeTags(requiredTags)),
        clean(modelHint, 240),
        desiredReplicas,
        desiredQuorum,
        ['exact', 'multi-agent', 'any'].includes(consensusMode) ? consensusMode : 'any',
        clean(source, 120),
        deadlineMs,
        stamp,
        stamp,
      ],
    );

    for (const peer of selected) {
      await query(
        `INSERT IGNORE INTO aura_mesh_assignments(
          id,task_id,peer_id,status,lease_expires_ms,result,result_hash,
          latency_ms,error,created_at,updated_at
        ) VALUES(?,?,?,'queued',0,'{}','',0,'',?,?)`,
        [randomUUID(), id, peer.id, stamp, stamp],
      );
    }

    if (!selected.length) {
      await query(
        "UPDATE aura_mesh_tasks SET status='waiting',error=?,updated_at=? WHERE id=?",
        ['Aucun pair compatible en ligne', now(), id],
      );
    } else {
      await query(
        "UPDATE aura_mesh_tasks SET status='running',updated_at=? WHERE id=?",
        [now(), id],
      );
    }
    this.lastDispatchAt = now();

    return {
      id,
      status: selected.length ? 'running' : 'waiting',
      assigned_peers: selected.length,
      replicas: desiredReplicas,
      quorum: desiredQuorum,
      data_class: normalizedClass,
      consensus_mode: consensusMode,
      deadline_ms: deadlineMs,
    };
  }

  async claim(peer) {
    await this.cleanup();
    const row = await one(
      `SELECT a.id AS assignment_id,a.task_id,t.kind,t.data_class,t.payload,t.model_hint,
              t.consensus_mode,t.deadline_ms
       FROM aura_mesh_assignments a
       JOIN aura_mesh_tasks t ON t.id=a.task_id
       WHERE a.peer_id=? AND a.status='queued'
         AND t.status IN ('queued','running')
         AND t.deadline_ms > ?
       ORDER BY t.created_at ASC LIMIT 1`,
      [peer.id, nowMs()],
    );
    if (!row) return { assignment: null };

    if (row.data_class !== 'public' && peer.trust_tier !== 'trusted') {
      await query(
        "UPDATE aura_mesh_assignments SET status='rejected',error=?,updated_at=? WHERE id=?",
        ['Classe de données interdite pour ce pair', now(), row.assignment_id],
      );
      return { assignment: null };
    }

    const leaseMs = Math.min(config.computeMeshLeaseSeconds * 1000, Math.max(1000, row.deadline_ms - nowMs()));
    const update = await query(
      `UPDATE aura_mesh_assignments
       SET status='leased',lease_expires_ms=?,updated_at=?
       WHERE id=? AND status='queued'`,
      [nowMs() + leaseMs, now(), row.assignment_id],
    );
    if (!update?.affectedRows) return { assignment: null };

    return {
      assignment: {
        id: row.assignment_id,
        task_id: row.task_id,
        kind: row.kind,
        data_class: row.data_class,
        payload: parseJson(row.payload, {}),
        model_hint: row.model_hint,
        consensus_mode: row.consensus_mode,
        deadline_ms: Number(row.deadline_ms || 0),
      },
    };
  }

  async complete(peer, assignmentId, { result, error = '', latency_ms = 0 } = {}) {
    const assignment = await one(
      `SELECT a.*,t.consensus_mode,t.quorum,t.replicas,t.status AS task_status
       FROM aura_mesh_assignments a
       JOIN aura_mesh_tasks t ON t.id=a.task_id
       WHERE a.id=? AND a.peer_id=? LIMIT 1`,
      [String(assignmentId || ''), peer.id],
    );
    if (!assignment) throw new Error('assignment Mesh introuvable');
    if (['completed', 'failed', 'cancelled'].includes(String(assignment.task_status || ''))) {
      throw new Error('tâche Mesh déjà finalisée');
    }
    if (String(assignment.status || '') !== 'leased') {
      throw new Error('assignment Mesh non loué ou déjà terminé');
    }

    const resultText = JSON.stringify(result ?? {});
    if (Buffer.byteLength(resultText) > config.computeMeshMaxResultBytes) {
      throw new Error('résultat Mesh trop volumineux');
    }

    const ok = !error;
    const latency = Math.max(0, Math.min(Number(latency_ms || 0), config.computeMeshMaxTaskMs));
    const hash = ok ? resultHash(result) : '';
    await query(
      `UPDATE aura_mesh_assignments
       SET status=?,result=?,result_hash=?,latency_ms=?,error=?,lease_expires_ms=0,updated_at=?
       WHERE id=?`,
      [
        ok ? 'completed' : 'failed',
        resultText,
        hash,
        latency,
        clean(error, 5000),
        now(),
        assignment.id,
      ],
    );

    await this.updatePeerOutcome(peer.id, { ok, latencyMs: latency });
    const task = await this.reconcileTask(assignment.task_id);
    this.lastCompletionAt = now();
    return { ok: true, task };
  }

  async updatePeerOutcome(peerId, { ok, latencyMs = 0, agreed = null } = {}) {
    const peer = await one('SELECT * FROM aura_mesh_peers WHERE id=?', [peerId]);
    if (!peer) return;
    const alpha = 0.15;
    const reliability = clamp(Number(peer.reliability || 0.5) * (1 - alpha) + (ok ? 1 : 0) * alpha);
    const reputationTarget = ok ? (agreed === false ? 0.35 : 1) : 0;
    const reputation = clamp(Number(peer.reputation || 0.5) * (1 - alpha) + reputationTarget * alpha);
    const agreement = agreed == null
      ? Number(peer.agreement_rate || 0.5)
      : clamp(Number(peer.agreement_rate || 0.5) * (1 - alpha) + (agreed ? 1 : 0) * alpha);
    const previousLatency = Math.max(0, Number(peer.latency_ms || latencyMs || 0));
    const latency = previousLatency
      ? previousLatency * 0.82 + Math.max(0, latencyMs) * 0.18
      : Math.max(0, latencyMs);

    await query(
      `UPDATE aura_mesh_peers
       SET reputation=?,reliability=?,agreement_rate=?,latency_ms=?,
           jobs_ok=jobs_ok+?,jobs_failed=jobs_failed+?,updated_at=?
       WHERE id=?`,
      [reputation, reliability, agreement, latency, ok ? 1 : 0, ok ? 0 : 1, now(), peerId],
    );
  }

  async updatePeerAgreement(peerId, agreed) {
    const peer = await one('SELECT agreement_rate,reputation FROM aura_mesh_peers WHERE id=?', [peerId]);
    if (!peer) return;
    const alpha = 0.12;
    const agreement = clamp(
      Number(peer.agreement_rate || 0.5) * (1 - alpha) + (agreed ? 1 : 0) * alpha,
    );
    const reputation = clamp(
      Number(peer.reputation || 0.5) * (1 - alpha)
        + (agreed ? 0.9 : 0.25) * alpha,
    );
    await query(
      'UPDATE aura_mesh_peers SET agreement_rate=?,reputation=?,updated_at=? WHERE id=?',
      [agreement, reputation, now(), peerId],
    );
  }

  async reconcileTask(taskId) {
    const task = await one('SELECT * FROM aura_mesh_tasks WHERE id=?', [String(taskId || '')]);
    if (!task) return null;
    await this.rebalanceTask(task.id).catch(() => {});
    const rows = await query(
      `SELECT a.*,p.reputation,p.reliability
       FROM aura_mesh_assignments a
       JOIN aura_mesh_peers p ON p.id=a.peer_id
       WHERE a.task_id=? ORDER BY a.updated_at ASC`,
      [task.id],
    );
    const completed = rows.filter((row) => row.status === 'completed');
    const active = rows.filter((row) => ['queued', 'leased'].includes(row.status));
    const quorum = Math.max(1, Number(task.quorum || 1));
    const mode = String(task.consensus_mode || 'any');

    if (mode === 'exact' && completed.length) {
      const groups = new Map();
      for (const row of completed) {
        const list = groups.get(row.result_hash) || [];
        list.push(row);
        groups.set(row.result_hash, list);
      }
      const winner = [...groups.values()].sort((a, b) => b.length - a.length)[0] || [];
      if (winner.length >= quorum) {
        const agreedPeers = new Set(winner.map((row) => row.peer_id));
        for (const row of completed) {
          await this.updatePeerAgreement(row.peer_id, agreedPeers.has(row.peer_id));
        }
        const result = parseJson(winner[0].result, {});
        await query(
          "UPDATE aura_mesh_tasks SET status='completed',result=?,error='',updated_at=? WHERE id=?",
          [JSON.stringify({ consensus: result, votes: winner.length }), now(), task.id],
        );
        return { id: task.id, status: 'completed', result, votes: winner.length };
      }
    }

    if (mode === 'multi-agent' && completed.length >= quorum) {
      const candidates = completed.map((row) => ({
        peer_id: row.peer_id,
        result: parseJson(row.result, {}),
        reputation: Number(row.reputation || 0),
        reliability: Number(row.reliability || 0),
        latency_ms: Number(row.latency_ms || 0),
      }));
      await query(
        "UPDATE aura_mesh_tasks SET status='completed',result=?,error='',updated_at=? WHERE id=?",
        [JSON.stringify({ candidates }).slice(0, config.computeMeshMaxResultBytes), now(), task.id],
      );
      return { id: task.id, status: 'completed', candidates };
    }

    if (mode === 'any' && completed.length >= quorum) {
      const best = completed
        .slice()
        .sort((a, b) => (Number(b.reputation || 0) + Number(b.reliability || 0))
          - (Number(a.reputation || 0) + Number(a.reliability || 0)))[0];
      const result = parseJson(best.result, {});
      await query(
        "UPDATE aura_mesh_tasks SET status='completed',result=?,error='',updated_at=? WHERE id=?",
        [JSON.stringify({ result, peer_id: best.peer_id }), now(), task.id],
      );
      return { id: task.id, status: 'completed', result };
    }

    if (nowMs() >= Number(task.deadline_ms || 0)) {
      await query(
        "UPDATE aura_mesh_tasks SET status='failed',error=?,updated_at=? WHERE id=?",
        ['Délai Mesh dépassé', now(), task.id],
      );
      return { id: task.id, status: 'failed', error: 'deadline exceeded' };
    }

    if (!active.length && completed.length < quorum) {
      await query(
        "UPDATE aura_mesh_tasks SET status='waiting',error=?,updated_at=? WHERE id=?",
        ['Quorum en attente de pairs compatibles', now(), task.id],
      );
      return {
        id: task.id,
        status: 'waiting',
        completed: completed.length,
        active: 0,
        missing_quorum: quorum - completed.length,
      };
    }

    return { id: task.id, status: task.status, completed: completed.length, active: active.length };
  }

  async getTask(taskId) {
    const task = await one('SELECT * FROM aura_mesh_tasks WHERE id=?', [String(taskId || '')]);
    if (!task) return null;
    return {
      ...task,
      payload: parseJson(task.payload, {}),
      required_tags: parseJson(task.required_tags, []),
      result: parseJson(task.result, {}),
      replicas: Number(task.replicas || 0),
      quorum: Number(task.quorum || 0),
      deadline_ms: Number(task.deadline_ms || 0),
    };
  }

  async waitForTask(taskId, timeoutMs = 12000) {
    const deadline = Date.now() + Math.max(250, Math.min(Number(timeoutMs || 12000), 60000));
    while (Date.now() < deadline) {
      await this.rebalanceTask(taskId).catch(() => {});
      const task = await this.getTask(taskId);
      if (!task) throw new Error('tâche Mesh introuvable');
      if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return this.getTask(taskId);
  }

  async status({ publicView = true } = {}) {
    const cutoff = nowMs() - config.computeMeshPeerTtlSeconds * 1000;
    const [peers, tasks] = await Promise.all([
      one(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN last_seen_ms >= ? AND status='online' THEN 1 ELSE 0 END) AS online,
           SUM(CASE WHEN last_seen_ms >= ? AND status='online' AND webgpu=1 THEN 1 ELSE 0 END) AS webgpu,
           SUM(CASE WHEN last_seen_ms >= ? AND status='online' AND trust_tier='trusted' THEN 1 ELSE 0 END) AS trusted,
           AVG(CASE WHEN last_seen_ms >= ? AND status='online' THEN reputation ELSE NULL END) AS reputation
         FROM aura_mesh_peers`,
        [cutoff, cutoff, cutoff, cutoff],
      ),
      one(
        `SELECT
           SUM(CASE WHEN status IN ('queued','running','waiting') THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
         FROM aura_mesh_tasks`,
      ),
    ]);
    const out = {
      version: ComputeMesh.VERSION,
      enabled: this.enabled,
      started: this.started,
      peers_online: Number(peers?.online || 0),
      peers_webgpu: Number(peers?.webgpu || 0),
      average_reputation: Number(Number(peers?.reputation || 0).toFixed(3)),
      tasks_active: Number(tasks?.active || 0),
      tasks_completed: Number(tasks?.completed || 0),
      tasks_failed: Number(tasks?.failed || 0),
      public_peer_policy: 'read-compute-only',
      secret_data_distributed: false,
      side_effects_from_public_peers: false,
      last_dispatch_at: this.lastDispatchAt,
      last_completion_at: this.lastCompletionAt,
      last_error: this.lastError,
    };
    if (!publicView) {
      out.peers_total = Number(peers?.total || 0);
      out.peers_trusted = Number(peers?.trusted || 0);
    }
    return out;
  }
}
