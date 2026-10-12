import { createHash, randomUUID } from 'node:crypto';
import { query } from './db.js';

export const AGENT_ROLES = Object.freeze(['planner','research','dev','security','operator','critic']);

const normal = (value, max = 120) => String(value || '').slice(0, max);
const utc = () => new Date().toISOString();

export class AgentRunLedger {
  constructor({ storage = { query: query } } = {}) {
    this.storage = storage;
  }

  async execute({ role, missionId = '', task = '', invoke, provider = () => '' } = {}) {
    if (!AGENT_ROLES.includes(role)) throw new Error('Unknown AURA agent role');
    if (typeof invoke !== 'function') throw new Error('Missing agent executor');
    const id = randomUUID();
    const taskHash = createHash('sha256').update(String(task)).digest('hex');
    const startedAt = utc();
    const startMs = Date.now();
    let result = '';
    let failure = null;
    let status = 'blocked';
    try {
      result = String(await invoke() || '').trim();
      if (result && !/^IA non configurée|^ERREUR:/i.test(result)) status = 'completed';
    } catch (error) {
      failure = error;
      status = 'failed';
    }
    const elapsedMs = Math.max(0, Date.now() - startMs);
    // Never persist the untrusted task prompt or potentially sensitive response.
    // The execution status is factual; it is not a quality-of-answer rating.
    await this.storage.query(
      'INSERT INTO aura_agent_runs(id,mission_id,role,status,task_sha256,provider,latency_ms,error_code,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [id, normal(missionId, 36), role, status, taskHash, normal(provider(), 120),
        elapsedMs, failure ? normal(failure.code || 'agent-error', 64) : '', startedAt, utc()],
    );
    if (failure) throw failure;
    return { id, role, status, answer: result };
  }

  async status() {
    const rows = await this.storage.query(
      'SELECT role,status,COUNT(*) AS total FROM aura_agent_runs GROUP BY role,status',
    );
    const counts = {};
    for (const row of rows) {
      if (!AGENT_ROLES.includes(String(row.role))) continue;
      counts[row.role] ||= { completed: 0, blocked: 0, failed: 0 };
      if (Object.hasOwn(counts[row.role], String(row.status))) {
        counts[row.role][row.status] = Number(row.total || 0);
      }
    }
    return { version: 'aura-agent-ledger-v1', roles: [...AGENT_ROLES], counts };
  }
}
