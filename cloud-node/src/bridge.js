import { randomUUID } from 'node:crypto';
import { one, query } from './db.js';

const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();

const intEnv = (name, fallback, min, max) => {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, value));
};
const bridgeConfig = Object.freeze({
  token: String(process.env.AURA_BRIDGE_TOKEN || ''),
  leaseSeconds: intEnv('AURA_BRIDGE_LEASE_SECONDS', 90, 15, 900),
  workerOnlineMs: intEnv('AURA_BRIDGE_WORKER_ONLINE_MS', 45000, 5000, 300000),
  operatorWaitMs: intEnv('AURA_BRIDGE_OPERATOR_WAIT_MS', 15000, 1000, 55000),
  inferenceTimeoutMs: intEnv('AURA_BRIDGE_INFERENCE_TIMEOUT_MS', 90000, 5000, 180000),
  voiceTimeoutMs: intEnv('AURA_BRIDGE_VOICE_TIMEOUT_MS', 60000, 5000, 120000),
  operatorMaxSteps: intEnv('AURA_BRIDGE_OPERATOR_MAX_STEPS', 6, 1, 8),
  allowedRisks: new Set(String(process.env.AURA_CLOUD_OPERATOR_ALLOWED_RISKS || 'safe,ai').split(',').map((v) => v.trim()).filter(Boolean)),
});

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export class ExecutionBridge {
  static VERSION = 'aura-cloud-local-bridge-v1';

  constructor() {
    this.lastError = '';
    this.lastJobAt = '';
  }

  get enabled() {
    return Boolean(bridgeConfig.token);
  }

  async enqueue(kind, payload = {}, requestedRisks = []) {
    if (!this.enabled) {
      throw new Error('AURA_BRIDGE_TOKEN non configuré');
    }
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

  async claim(workerId, capabilities = []) {
    if (!this.enabled) return null;
    const worker = String(workerId || '').trim().slice(0, 160);
    if (!worker) throw new Error('worker_id requis');

    const leaseUntil = nowMs() + bridgeConfig.leaseSeconds * 1000;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidate = await one(
        `SELECT id FROM aura_execution_jobs
         WHERE status='queued' OR (status='leased' AND lease_until<?)
         ORDER BY created_at ASC LIMIT 1`,
        [nowMs()],
      );
      if (!candidate) return null;

      const update = await query(
        `UPDATE aura_execution_jobs
         SET status='leased',lease_owner=?,lease_until=?,attempts=attempts+1,updated_at=?
         WHERE id=? AND (status='queued' OR (status='leased' AND lease_until<?))`,
        [worker, leaseUntil, nowIso(), candidate.id, nowMs()],
      );
      if (!Number(update.affectedRows || 0)) continue;
      const job = await this.getJob(candidate.id);
      return job ? { ...job, worker_id: worker } : null;
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
    const result = payload.result ?? payload;
    const error = ok ? '' : String(payload.error || result?.error || 'échec worker').slice(0, 4000);
    const status = ok ? 'completed' : 'error';
    await query(
      `UPDATE aura_execution_jobs
       SET status=?,result=?,error=?,lease_until=0,updated_at=? WHERE id=?`,
      [status, JSON.stringify(result || {}).slice(0, 8_000_000), error, nowIso(), String(id)],
    );
    this.lastJobAt = nowIso();
    return this.getJob(id);
  }

  async heartbeat(workerId, payload = {}) {
    const worker = String(workerId || '').trim().slice(0, 160);
    if (!worker) throw new Error('worker_id requis');
    const timestamp = nowIso();
    await query(
      `INSERT INTO aura_execution_workers(worker_id,capabilities,model,version,last_seen_at,last_seen_ms)
       VALUES(?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         capabilities=VALUES(capabilities),
         model=VALUES(model),
         version=VALUES(version),
         last_seen_at=VALUES(last_seen_at),
         last_seen_ms=VALUES(last_seen_ms)`,
      [
        worker,
        JSON.stringify(payload.capabilities || []).slice(0, 50_000),
        String(payload.model || '').slice(0, 240),
        String(payload.version || '').slice(0, 120),
        timestamp,
        nowMs(),
      ],
    );
    return { ok: true, worker_id: worker, server_time: timestamp };
  }

  async wait(id, timeoutMs = bridgeConfig.inferenceTimeoutMs) {
    const deadline = nowMs() + Math.max(1000, Number(timeoutMs || 0));
    while (nowMs() < deadline) {
      const job = await this.getJob(id);
      if (!job) throw new Error('job disparu');
      if (job.status === 'completed') return job.result;
      if (job.status === 'error') throw new Error(job.error || 'worker execution failed');
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
    throw new Error('AURA bridge timeout');
  }

  async infer(prompt, system, maxTokens = 700) {
    const job = await this.enqueue('inference', {
      prompt: String(prompt || '').slice(0, 50_000),
      system: String(system || '').slice(0, 20_000),
      max_tokens: Math.max(64, Math.min(Number(maxTokens) || 700, 8000)),
    }, ['ai']);
    const result = await this.wait(job.id, bridgeConfig.inferenceTimeoutMs);
    const answer = String(result?.answer || '').trim();
    if (!answer) throw new Error('Le worker local n’a renvoyé aucune réponse IA');
    return answer;
  }

  async operate(task, requestedRisks = []) {
    const job = await this.enqueue('operator', {
      task: String(task || '').slice(0, 12_000),
      max_steps: bridgeConfig.operatorMaxSteps,
    }, requestedRisks);

    try {
      const result = await this.wait(job.id, bridgeConfig.operatorWaitMs);
      return { executed: true, job_id: job.id, result };
    } catch (error) {
      const latest = await this.getJob(job.id);
      if (latest && ['queued', 'leased'].includes(latest.status)) {
        return {
          executed: false,
          queued: true,
          job_id: job.id,
          status: latest.status,
          reason: 'Quantic Studio exécutera la mission dès que le worker local sera disponible.',
        };
      }
      throw error;
    }
  }

  async synthesize(text, options = {}) {
    const job = await this.enqueue('tts', {
      text: String(text || '').slice(0, 430),
      rate: Number(options.rate || 1),
      pitch: Number(options.pitch || 1),
      volume: Number(options.volume || 1),
      context: String(options.context || 'aura-cloud').slice(0, 120),
    }, ['safe']);
    return this.wait(job.id, bridgeConfig.voiceTimeoutMs);
  }

  async evolve(objective) {
    const job = await this.enqueue('evolution', {
      objective: String(objective || '').slice(0, 8000),
      trigger: 'aura-cloud',
    }, ['ai', 'local-write', 'network', 'process']);
    return { ...job, delegated: true };
  }

  get allowedRisks() { return new Set(bridgeConfig.allowedRisks); }

  async status() {
    const counts = await one(`SELECT
      SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status='leased' THEN 1 ELSE 0 END) AS leased,
      SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
      FROM aura_execution_jobs`);
    const worker = await one(
      `SELECT worker_id,capabilities,model,version,last_seen_at,last_seen_ms
       FROM aura_execution_workers ORDER BY last_seen_ms DESC LIMIT 1`,
    );
    const workerOnline = Boolean(worker && nowMs() - Number(worker.last_seen_ms || 0) <= bridgeConfig.workerOnlineMs);
    return {
      version: ExecutionBridge.VERSION,
      enabled: this.enabled,
      mode: this.enabled ? 'cloud-to-local-execution' : 'disabled',
      worker_online: workerOnline,
      worker: worker ? {
        worker_id: worker.worker_id,
        capabilities: parseJson(worker.capabilities, []),
        model: worker.model || '',
        version: worker.version || '',
        last_seen_at: worker.last_seen_at || '',
      } : null,
      allowed_risks: [...bridgeConfig.allowedRisks],
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
