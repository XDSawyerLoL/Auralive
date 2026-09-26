import { createHash, randomUUID } from 'node:crypto';
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

function clamp01(value, fallback = 0.5) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function stringList(value, limit = 64) {
  const rows = Array.isArray(value) ? value : [];
  return [...new Set(rows.map((item) => String(item || '').trim()).filter(Boolean))].slice(0, limit);
}

export function scoreMeshWorker(worker = {}) {
  const resources = worker.resources && typeof worker.resources === 'object'
    ? worker.resources
    : {};
  const reputation = clamp01(worker.reputation, 0.5);
  const threads = Math.min(64, Math.max(0, Number(resources.cpu_threads || 0))) / 64;
  const ram = Math.min(64, Math.max(0, Number(resources.ram_bytes || 0)) / (1024 ** 3)) / 64;
  const accelerator = resources.gpu || resources.accelerator ? 1 : 0;
  const resourceScore = threads * 0.35 + ram * 0.35 + accelerator * 0.3;
  const latency = Math.max(0, Number(worker.avg_latency_ms || 0));
  const latencyScore = latency > 0 ? 1 - Math.min(1, latency / 20_000) : 0.5;
  return Number((reputation * 0.7 + resourceScore * 0.2 + latencyScore * 0.1).toFixed(6));
}

export function meshResultFingerprint(kind, result = {}) {
  let canonical = result;
  if (kind === 'inference' || kind === 'moa') canonical = String(result?.answer || '').trim();
  if (kind === 'compute' && Object.prototype.hasOwnProperty.call(result || {}, 'value')) {
    canonical = result.value;
  }
  return createHash('sha256').update(JSON.stringify(canonical ?? null)).digest('hex');
}

const settings = Object.freeze({
  token: String(process.env.AURA_BRIDGE_TOKEN || process.env.AURA_CLOUD_TOKEN || ''),
  leaseSeconds: intEnv('AURA_BRIDGE_LEASE_SECONDS', 90, 15, 900),
  workerOnlineMs: intEnv('AURA_BRIDGE_WORKER_ONLINE_MS', 45_000, 5_000, 300_000),
  operatorWaitMs: intEnv('AURA_BRIDGE_OPERATOR_WAIT_MS', 18_000, 1_000, 55_000),
  inferenceTimeoutMs: intEnv('AURA_BRIDGE_INFERENCE_TIMEOUT_MS', 90_000, 5_000, 180_000),
  voiceTimeoutMs: intEnv('AURA_BRIDGE_VOICE_TIMEOUT_MS', 60_000, 5_000, 120_000),
  imageTimeoutMs: intEnv('AURA_BRIDGE_IMAGE_TIMEOUT_MS', 300_000, 10_000, 600_000),
  operatorMaxSteps: intEnv('AURA_BRIDGE_OPERATOR_MAX_STEPS', 6, 1, 8),
  preferLocalAi: boolEnv('AURA_LOCAL_AI_PREFERRED', true),
  meshMaxQuorum: intEnv('AURA_MESH_MAX_QUORUM', 3, 1, 5),
  meshTimeoutMs: intEnv('AURA_MESH_TIMEOUT_MS', 120_000, 5_000, 600_000),
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

  async workers({ onlineOnly = true, computeOnly = false, capability = '' } = {}) {
    if (!this.enabled) return [];
    const rows = await query(
      `SELECT worker_id,capabilities,model,voice,version,compute_consent,mesh_capabilities,
              resources,reputation,jobs_completed,jobs_failed,avg_latency_ms,last_seen_at,last_seen_ms
       FROM aura_execution_workers
       ORDER BY reputation DESC,last_seen_ms DESC LIMIT 256`,
    );
    const required = String(capability || '').trim();
    return rows.map((row) => {
      const item = {
        worker_id: String(row.worker_id || ''),
        capabilities: parseJson(row.capabilities, []),
        model: String(row.model || ''),
        voice: String(row.voice || ''),
        version: String(row.version || ''),
        compute_consent: Boolean(Number(row.compute_consent || 0)),
        mesh_capabilities: stringList(parseJson(row.mesh_capabilities, [])),
        resources: parseJson(row.resources, {}),
        reputation: clamp01(row.reputation, 0.5),
        jobs_completed: Number(row.jobs_completed || 0),
        jobs_failed: Number(row.jobs_failed || 0),
        avg_latency_ms: Math.max(0, Number(row.avg_latency_ms || 0)),
        last_seen_at: String(row.last_seen_at || ''),
        last_seen_ms: Number(row.last_seen_ms || 0),
      };
      return { ...item, mesh_score: scoreMeshWorker(item) };
    }).filter((worker) => {
      if (onlineOnly && nowMs() - worker.last_seen_ms > settings.workerOnlineMs) return false;
      if (computeOnly && !worker.compute_consent) return false;
      if (required && !worker.mesh_capabilities.includes(required)) return false;
      return true;
    }).sort((a, b) => b.mesh_score - a.mesh_score || b.reputation - a.reputation);
  }

  async enqueue(kind, payload = {}, requestedRisks = [], options = {}) {
    if (!this.enabled) throw new Error('Pont AURA Cloud ↔ Quantic Studio non configuré');
    const id = randomUUID();
    const timestamp = nowIso();
    const targetWorkerId = String(options.targetWorkerId || '').trim().slice(0, 160);
    const requiredCapabilities = stringList(options.requiredCapabilities);
    const verificationMode = String(options.verificationMode || 'none').trim().slice(0, 40);
    const quorum = Math.max(1, Math.min(Number(options.quorum || 1), settings.meshMaxQuorum));
    await query(
      `INSERT INTO aura_execution_jobs(
        id,kind,payload,requested_risks,target_worker_id,required_capabilities,
        verification_mode,quorum,status,attempts,lease_owner,lease_until,assigned_at,
        result,error,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,'queued',0,'',0,0,'{}','',?,?)`,
      [
        id,
        String(kind).slice(0, 40),
        JSON.stringify(payload || {}).slice(0, 1_000_000),
        JSON.stringify(Array.from(requestedRisks || [])).slice(0, 20_000),
        targetWorkerId,
        JSON.stringify(requiredCapabilities).slice(0, 20_000),
        verificationMode,
        quorum,
        timestamp,
        timestamp,
      ],
    );
    this.lastJobAt = timestamp;
    return {
      id,
      kind,
      status: 'queued',
      target_worker_id: targetWorkerId,
      required_capabilities: requiredCapabilities,
      verification_mode: verificationMode,
      quorum,
      created_at: timestamp,
    };
  }

  async getJob(id) {
    const row = await one(
      `SELECT id,kind,payload,requested_risks,target_worker_id,required_capabilities,
              verification_mode,quorum,status,attempts,lease_owner,lease_until,assigned_at,
              result,error,created_at,updated_at
       FROM aura_execution_jobs WHERE id=?`,
      [String(id)],
    );
    if (!row) return null;
    return {
      ...row,
      payload: parseJson(row.payload, {}),
      requested_risks: parseJson(row.requested_risks, []),
      required_capabilities: stringList(parseJson(row.required_capabilities, [])),
      result: parseJson(row.result, {}),
      attempts: Number(row.attempts || 0),
      quorum: Math.max(1, Number(row.quorum || 1)),
      lease_until: Number(row.lease_until || 0),
      assigned_at: Number(row.assigned_at || 0),
    };
  }

  async heartbeat(workerId, payload = {}) {
    const worker = String(workerId || '').trim().slice(0, 160);
    if (!worker) throw new Error('worker_id requis');
    const timestamp = nowIso();
    await query(
      `INSERT INTO aura_execution_workers(
        worker_id,capabilities,model,voice,version,compute_consent,mesh_capabilities,
        resources,reputation,jobs_completed,jobs_failed,avg_latency_ms,last_seen_at,last_seen_ms
      ) VALUES(?,?,?,?,?,?,?,?,0.5,0,0,0,?,?)
      ON DUPLICATE KEY UPDATE
        capabilities=VALUES(capabilities),
        model=VALUES(model),
        voice=VALUES(voice),
        version=VALUES(version),
        compute_consent=VALUES(compute_consent),
        mesh_capabilities=VALUES(mesh_capabilities),
        resources=VALUES(resources),
        last_seen_at=VALUES(last_seen_at),
        last_seen_ms=VALUES(last_seen_ms)`,
      [
        worker,
        JSON.stringify(payload.capabilities || []).slice(0, 80_000),
        String(payload.model || '').slice(0, 240),
        String(payload.voice || '').slice(0, 240),
        String(payload.version || '').slice(0, 120),
        payload.compute_consent === true ? 1 : 0,
        JSON.stringify(stringList(payload.mesh_capabilities)).slice(0, 20_000),
        JSON.stringify(payload.resources && typeof payload.resources === 'object' ? payload.resources : {}).slice(0, 80_000),
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

    const workerRow = await one(
      'SELECT compute_consent,mesh_capabilities FROM aura_execution_workers WHERE worker_id=?',
      [worker],
    );
    const computeConsent = Boolean(Number(workerRow?.compute_consent || 0));
    const meshCapabilities = new Set(stringList(parseJson(workerRow?.mesh_capabilities, [])));
    const leaseUntil = nowMs() + settings.leaseSeconds * 1000;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const candidates = await query(
        `SELECT id,target_worker_id,required_capabilities FROM aura_execution_jobs
         WHERE status='queued' OR (status='leased' AND lease_until<?)
         ORDER BY created_at ASC LIMIT 32`,
        [nowMs()],
      );
      if (!candidates.length) return null;

      let claimed = false;
      for (const candidate of candidates) {
        const target = String(candidate.target_worker_id || '');
        if (target && target !== worker) continue;
        const required = stringList(parseJson(candidate.required_capabilities, []));
        if (required.length) {
          if (!computeConsent) continue;
          if (required.some((item) => !meshCapabilities.has(item))) continue;
        }
        const result = await query(
          `UPDATE aura_execution_jobs
           SET status='leased',lease_owner=?,lease_until=?,assigned_at=?,attempts=attempts+1,updated_at=?
           WHERE id=? AND (status='queued' OR (status='leased' AND lease_until<?))`,
          [worker, leaseUntil, nowMs(), nowIso(), candidate.id, nowMs()],
        );
        if (!Number(result.affectedRows || 0)) continue;
        claimed = true;
        return this.getJob(candidate.id);
      }
      if (!claimed) return null;
    }
    return null;
  }

  async renew(id, workerId) {
    const worker = String(workerId || '').trim().slice(0, 160);
    if (!worker) throw new Error('worker_id requis');
    const row = await one(
      'SELECT id,status,lease_owner FROM aura_execution_jobs WHERE id=?',
      [String(id)],
    );
    if (!row) throw new Error('job inconnu');
    if (row.status !== 'leased') throw new Error(`job non renouvelable: ${row.status}`);
    if (String(row.lease_owner || '') !== worker) throw new Error('lease worker invalide');

    const leaseUntil = nowMs() + settings.leaseSeconds * 1000;
    await query(
      'UPDATE aura_execution_jobs SET lease_until=?,updated_at=? WHERE id=? AND lease_owner=? AND status=\'leased\'',
      [leaseUntil, nowIso(), String(id), worker],
    );
    return { ok: true, id: String(id), lease_until: leaseUntil };
  }

  async complete(id, workerId, payload = {}) {
    const worker = String(workerId || '').trim().slice(0, 160);
    const row = await one(
      'SELECT id,status,lease_owner,assigned_at FROM aura_execution_jobs WHERE id=?',
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
        JSON.stringify(resultPayload || {}).slice(0, 20_000_000),
        error,
        nowIso(),
        String(id),
      ],
    );

    const assignedAt = Number(row.assigned_at || 0);
    const elapsed = assignedAt > 0 ? Math.max(0, nowMs() - assignedAt) : 0;
    await query(
      `UPDATE aura_execution_workers
       SET reputation=LEAST(0.99,GREATEST(0.05,reputation*0.85+?*0.15)),
           jobs_completed=jobs_completed+?,
           jobs_failed=jobs_failed+?,
           avg_latency_ms=CASE
             WHEN ?>0 THEN CASE WHEN avg_latency_ms<=0 THEN ? ELSE avg_latency_ms*0.8+?*0.2 END
             ELSE avg_latency_ms
           END
       WHERE worker_id=?`,
      [ok ? 1 : 0, ok ? 1 : 0, ok ? 0 : 1, elapsed, elapsed, elapsed, worker],
    ).catch(() => {});

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

  async executeMesh(kind, payload = {}, {
    capability = kind,
    quorum = 1,
    verification = 'none',
    timeoutMs = settings.meshTimeoutMs,
  } = {}) {
    const requestedQuorum = Math.max(1, Math.min(Number(quorum || 1), settings.meshMaxQuorum));
    const mode = String(verification || 'none').trim().toLowerCase();
    const workers = await this.workers({
      onlineOnly: true,
      computeOnly: true,
      capability: String(capability || kind),
    });
    if (workers.length < requestedQuorum) {
      throw new Error(
        `Compute Mesh insuffisant: ${workers.length} nœud(s) compatible(s), quorum ${requestedQuorum}`,
      );
    }

    const selected = workers.slice(0, requestedQuorum);
    const jobs = await Promise.all(selected.map((worker) => this.enqueue(
      kind,
      payload,
      kind === 'inference' ? ['ai'] : ['safe'],
      {
        targetWorkerId: worker.worker_id,
        requiredCapabilities: [String(capability || kind)],
        verificationMode: mode,
        quorum: requestedQuorum,
      },
    )));
    const settled = await Promise.allSettled(
      jobs.map((job) => this.wait(job.id, timeoutMs)),
    );
    const completed = [];
    const failures = [];
    for (let index = 0; index < settled.length; index += 1) {
      const item = settled[index];
      if (item.status === 'fulfilled') {
        completed.push({
          worker_id: selected[index].worker_id,
          reputation: selected[index].reputation,
          result: item.value,
          fingerprint: meshResultFingerprint(kind, item.value),
        });
      } else {
        failures.push({
          worker_id: selected[index].worker_id,
          error: String(item.reason?.message || item.reason || 'mesh-worker-failure').slice(0, 1000),
        });
      }
    }
    if (!completed.length) {
      throw new Error(failures[0]?.error || 'Aucun nœud Compute Mesh n’a répondu');
    }

    const counts = new Map();
    for (const item of completed) counts.set(item.fingerprint, (counts.get(item.fingerprint) || 0) + 1);
    const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    const winnerFingerprint = winner?.[0] || completed[0].fingerprint;
    const agreeing = Number(winner?.[1] || 1);
    const majority = Math.floor(requestedQuorum / 2) + 1;
    const verified = mode === 'none'
      ? completed.length > 0
      : mode === 'duplicate'
        ? agreeing >= 2 || requestedQuorum === 1
        : agreeing >= majority && completed.length >= majority;
    if (mode === 'quorum' && !verified) {
      throw new Error(
        `Quorum Compute Mesh non atteint: ${agreeing}/${requestedQuorum} résultat(s) concordant(s)`,
      );
    }
    const chosen = completed.find((item) => item.fingerprint === winnerFingerprint) || completed[0];
    return {
      ok: true,
      result: chosen.result,
      verification: {
        mode,
        requested_quorum: requestedQuorum,
        completed: completed.length,
        agreeing,
        verified,
        fingerprints: completed.map((item) => item.fingerprint),
      },
      mesh: {
        workers: completed.map((item) => ({
          worker_id: item.worker_id,
          reputation: item.reputation,
        })),
        failures,
      },
      metrics: {
        mesh_nodes: completed.length,
        cost_microunits: 0,
      },
    };
  }

  async infer(prompt, system, maxTokens = 700, taskRole = 'auto') {
    if (!await this.workerOnline()) throw new Error('Quantic Studio local hors ligne');
    const job = await this.enqueue(
      'inference',
      {
        prompt: String(prompt || '').slice(0, 50_000),
        system: String(system || '').slice(0, 20_000),
        max_tokens: Math.max(64, Math.min(Number(maxTokens) || 700, 8000)),
        task_role: String(taskRole || 'auto').slice(0, 80),
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

  async generateImage(options = {}) {
    if (!await this.workerOnline()) throw new Error('Quantic Studio local hors ligne');
    const prompt = String(options.prompt || '').trim();
    if (!prompt) throw new Error('Prompt image vide');
    const job = await this.enqueue(
      'image',
      {
        prompt: prompt.slice(0, 6000),
        negative_prompt: String(options.negative_prompt || '').slice(0, 3000),
        width: Number(options.width || 1024),
        height: Number(options.height || 1024),
        steps: Number(options.steps || 8),
        seed: options.seed == null ? null : Number(options.seed),
        model: String(options.model || '').slice(0, 240),
      },
      ['local-write'],
    );
    return this.wait(job.id, settings.imageTimeoutMs);
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
    const meshWorkers = await this.workers({ onlineOnly: true, computeOnly: true });
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
      mesh: {
        version: 'aura-compute-mesh-v0.1',
        consenting_online_nodes: meshWorkers.length,
        capabilities: [...new Set(meshWorkers.flatMap((item) => item.mesh_capabilities))].sort(),
        best_reputation: meshWorkers.length ? meshWorkers[0].reputation : 0,
        max_quorum: settings.meshMaxQuorum,
      },
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
