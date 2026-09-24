import { randomUUID } from 'node:crypto';
import { one, query } from './db.js';

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();

function intEnv(name, fallback, min, max) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, value));
}

function boolEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'oui', 'on'].includes(String(value).trim().toLowerCase());
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

const settings = Object.freeze({
  token: String(process.env.AURA_BRIDGE_TOKEN || process.env.AURA_CLOUD_TOKEN || ''),
  leaseSeconds: intEnv('AURA_BRIDGE_LEASE_SECONDS', 90, 15, 900),
  workerOnlineMs: intEnv('AURA_BRIDGE_WORKER_ONLINE_MS', 45_000, 5_000, 300_000),
  operatorWaitMs: intEnv('AURA_BRIDGE_OPERATOR_WAIT_MS', 18_000, 1_000, 55_000),
  inferenceTimeoutMs: intEnv('AURA_BRIDGE_INFERENCE_TIMEOUT_MS', 90_000, 5_000, 180_000),
  voiceTimeoutMs: intEnv('AURA_BRIDGE_VOICE_TIMEOUT_MS', 60_000, 5_000, 120_000),
  operatorMaxSteps: intEnv('AURA_BRIDGE_OPERATOR_MAX_STEPS', 6, 1, 8),
  preferLocalAi: boolEnv('AURA_LOCAL_AI_PREFERRED', true),
});

export class ExecutionBridge {
  static VERSION = 'aura-cloud-local-bridge-v2';

  constructor() {
    this.lastError = '';
    this.lastJobAt = '';
  }

  get enabled() {
    return Boolean(settings.token);
  }

  get preferLocalAi() {
    return settings.preferLocalAi;
  }

  async workerOnline() {
    if (!this.enabled) return false;
    const row = await one(
      'SELECT last_seen_ms FROM aura_execution_workers ORDER BY last_seen_ms DESC LIMIT 1',
    );
    return Boolean(row && nowMs() - Number(row.last_seen_ms || 0) <= settings.workerOnlineMs);
  }

  async enqueue(kind, payload = {}, requestedRisks = []) {
    if (!this.enabled) throw new Error('Pont AURA Cloud ↔ Quantic Studio non configuré');
    const id = randomUUID();
    const timestamp = nowIso();
    await query(
      `INSERT INTO aura_execution_jobs(
        id,kind,payload,requested_risks,status,attempts,lease_owner,lease_until,result,error,created_at,updated_at
      ) VALUES(?,?,?,?, 'queued',0,'',0,'{}','',?,?)`,
      [
        id,
        String(kind).slice(0, 40),
        JSON.stringify(payload || {}).slice(0, 1_000_000),
        JSON.stringify(Array.from(requestedRisks || [])).slice(0, 20_000),
        timestamp,
        timestamp,
      ],
    );
    this.lastJobAt = timestamp;
    return { id, kind, status: 'queued', created_at: timestamp };
  }

  async getJob(id) {
    const row = await one(
      `SELECT id,kind,payload,requested_risks,status,attempts,lease_owner,lease_until,result,error,created_at,updated_at
       FROM aura_execution_jobs WHERE id=?`,
      [String(id)],
    );
    if (!row) return null;
    return {
      ...row,
      payload: parseJson(row.payload, {}),
      requested_risks: parseJson(row.requested_risks, []),
      result: parseJson(row.result, {}),
      attempts: Number(row.attempts || 0),
      lease_until: Number(row.lease_until || 0),
    };
  }

  async heartbeat(workerId, payload = {}) {
    const worker = String(workerId || '').trim().slice(0, 160);
    if (!worker) throw new Error('worker_id requis');
    const timestamp = nowIso();
    await query(
      `INSERT INTO aura_execution_workers(
        worker_id,capabilities,model,voice,version,last_seen_at,last_seen_ms
      ) VALUES(?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        capabilities=VALUES(capabilities),
        model=VALUES(model),
        voice=VALUES(voice),
        version=VALUES(version),
        last_seen_at=VALUES(last_seen_at),
        last_seen_ms=VALUES(last_seen_ms)`,
      [
        worker,
        JSON.stringify(payload.capabilities || []).slice(0, 80_000),
        String(payload.model || '').slice(0, 240),
        String(payload.voice || '').slice(0, 240),
        String(payload.version || '').slice(0, 120),
        timestamp,
        nowMs(),
      ],
    );
    return { ok: true, worker_id: worker, server_time: timestamp };
  }

  async claim(workerId) {
    if (!this.enabled) return null;
    const worker = String(workerId || '').trim().slice(0, 160);
    if (!worker) throw new Error('worker_id requis');

    const leaseUntil = nowMs() + settings.leaseSeconds * 1000;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidate = await one(
        `SELECT id FROM aura_execution_jobs
         WHERE status='queued' OR (status='leased' AND lease_until<?)
         ORDER BY created_at ASC LIMIT 1`,
        [nowMs()],
      );
      if (!candidate) return null;
      const result = await query(
        `UPDATE aura_execution_jobs
         SET status='leased',lease_owner=?,lease_until=?,attempts=attempts+1,updated_at=?
         WHERE id=? AND (status='queued' OR (status='leased' AND lease_until<?))`,
        [worker, leaseUntil, nowIso(), candidate.id, nowMs()],
      );
      if (!Number(result.affectedRows || 0)) continue;
      return this.getJob(candidate.id);
    }
    return null;
  }

  async complete(id, workerId, payload = {}) {
    const worker = String(workerId || '').trim().slice(0, 160);
    const row = await one(
      'SELECT id,status,lease_owner FROM aura_execution_jobs WHERE id=?',
      [String(id)],
    );
    if (!row) throw new Error('job inconnu');
    if (row.status !== 'leased') throw new Error(`job non exécutable: ${row.status}`);
    if (String(row.lease_owner || '') !== worker) throw new Error('lease worker invalide');

    const ok = payload.ok !== false;
    const resultPayload = payload.result ?? payload;
    const error = ok
      ? ''
      : String(payload.error || resultPayload?.error || 'échec worker').slice(0, 4000);
    await query(
      `UPDATE aura_execution_jobs
       SET status=?,result=?,error=?,lease_until=0,updated_at=? WHERE id=?`,
      [
        ok ? 'completed' : 'error',
        JSON.stringify(resultPayload || {}).slice(0, 12_000_000),
        error,
        nowIso(),
        String(id),
      ],
    );
    this.lastJobAt = nowIso();
    return this.getJob(id);
  }

  async wait(id, timeoutMs) {
    const deadline = nowMs() + Math.max(1000, Number(timeoutMs || settings.inferenceTimeoutMs));
    while (nowMs() < deadline) {
      const job = await this.getJob(id);
      if (!job) throw new Error('job disparu');
      if (job.status === 'completed') return job.result;
      if (job.status === 'error') throw new Error(job.error || 'worker execution failed');
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error('AURA bridge timeout');
  }

  async infer(prompt, system, maxTokens = 700) {
    if (!await this.workerOnline()) throw new Error('Quantic Studio local hors ligne');
    const job = await this.enqueue(
      'inference',
      {
        prompt: String(prompt || '').slice(0, 50_000),
        system: String(system || '').slice(0, 20_000),
        max_tokens: Math.max(64, Math.min(Number(maxTokens) || 700, 8000)),
      },
      ['ai'],
    );
    const result = await this.wait(job.id, settings.inferenceTimeoutMs);
    const answer = String(result?.answer || '').trim();
    if (!answer) throw new Error('Le moteur local n’a renvoyé aucune réponse');
    return answer;
  }

  async operate(task, requestedRisks = []) {
    if (!await this.workerOnline()) throw new Error('Quantic Studio local hors ligne');
    const job = await this.enqueue(
      'operator',
      {
        task: String(task || '').slice(0, 12_000),
        max_steps: settings.operatorMaxSteps,
      },
      requestedRisks,
    );
    try {
      const result = await this.wait(job.id, settings.operatorWaitMs);
      return { executed: true, job_id: job.id, result };
    } catch (error) {
      const latest = await this.getJob(job.id);
      if (latest && ['queued', 'leased'].includes(latest.status)) {
        return {
          executed: false,
          queued: true,
          job_id: job.id,
          status: latest.status,
          reason: 'Quantic Studio poursuit la mission localement.',
        };
      }
      throw error;
    }
  }

  async synthesize(text, options = {}) {
    if (!await this.workerOnline()) throw new Error('Quantic Studio local hors ligne');
    const job = await this.enqueue(
      'tts',
      {
        text: String(text || '').slice(0, 430),
        rate: Number(options.rate || 1),
        pitch: Number(options.pitch || 1),
        volume: Number(options.volume || 1),
        context: String(options.context || 'aura-cloud').slice(0, 120),
      },
      ['safe'],
    );
    return this.wait(job.id, settings.voiceTimeoutMs);
  }

  async evolve(objective) {
    if (!await this.workerOnline()) throw new Error('Quantic Studio local hors ligne');
    const job = await this.enqueue(
      'evolution',
      {
        objective: String(objective || '').slice(0, 8000),
        trigger: 'aura-cloud',
      },
      ['ai', 'local-write', 'network', 'process'],
    );
    return { ...job, delegated: true };
  }

  async status() {
    const counts = await one(`SELECT
      SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status='leased' THEN 1 ELSE 0 END) AS leased,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
      FROM aura_execution_jobs`);
    const worker = await one(
      `SELECT worker_id,capabilities,model,voice,version,last_seen_at,last_seen_ms
       FROM aura_execution_workers ORDER BY last_seen_ms DESC LIMIT 1`,
    );
    const online = Boolean(
      worker && nowMs() - Number(worker.last_seen_ms || 0) <= settings.workerOnlineMs,
    );
    return {
      version: ExecutionBridge.VERSION,
      enabled: this.enabled,
      mode: this.enabled ? 'cloud-to-local-execution' : 'disabled',
      local_ai_preferred: settings.preferLocalAi,
      worker_online: online,
      worker: worker ? {
        worker_id: worker.worker_id,
        capabilities: parseJson(worker.capabilities, []),
        model: worker.model || '',
        voice: worker.voice || '',
        version: worker.version || '',
        last_seen_at: worker.last_seen_at || '',
      } : null,
      counts: {
        queued: Number(counts?.queued || 0),
        leased: Number(counts?.leased || 0),
        completed: Number(counts?.completed || 0),
        errors: Number(counts?.errors || 0),
      },
      last_error: this.lastError,
      last_job_at: this.lastJobAt,
    };
  }
}
