import { createHash, randomUUID } from 'node:crypto';
import { config } from './config.js';
import { one, query } from './db.js';
import { clamp } from './policy.js';

const now = () => new Date().toISOString();

const DEFAULT_SERVICES = [
  {
    id: 'aura',
    name: 'AURA',
    kind: 'core',
    objective: 'Maintenir le noyau AURA disponible, cohérent, apprenant et capable d’agir.',
    criticality: 1,
  },
  {
    id: 'quantic-studio',
    name: 'Quantic Studio',
    kind: 'execution',
    objective: 'Fournir à AURA ses capacités locales, ses modèles, ses outils et son bras opérateur.',
    criticality: 0.95,
  },
  {
    id: 'horizon',
    name: 'HORIZON',
    kind: 'intelligence',
    objective: 'Apporter des signaux vérifiés et du contexte prédictif sans transformer les hypothèses en faits.',
    criticality: 0.86,
  },
  {
    id: 'quantic-news',
    name: 'Quantic News',
    kind: 'information',
    objective: 'Transformer les informations utiles en contexte exploitable pour l’écosystème.',
    criticality: 0.72,
  },
  {
    id: 'zoon',
    name: 'ZOON',
    kind: 'social',
    objective: 'Maintenir la couche sociale de Quantic Sillage exploitable, observable et cohérente.',
    criticality: 0.68,
  },
  {
    id: 'quantic-mail',
    name: 'Quantic Mail',
    kind: 'communication',
    objective: 'Maintenir une messagerie souveraine et exploitable par l’écosystème.',
    criticality: 0.76,
  },
  {
    id: 'quantic-glide',
    name: 'Quantic Glide',
    kind: 'browser',
    objective: 'Fournir un accès Web privé, portable et compatible à l’écosystème.',
    criticality: 0.72,
  },
  {
    id: 'providence',
    name: 'Providence',
    kind: 'knowledge',
    objective: 'Transformer les documents et informations en connaissances utilisables.',
    criticality: 0.66,
  },
  {
    id: 'quantic-os',
    name: 'Quantic OS',
    kind: 'platform',
    objective: 'Servir de couche système cohérente aux produits Quantic Sillage.',
    criticality: 0.74,
  },
];

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting']);
const BAD_SERVICE_STATES = new Set(['degraded', 'offline', 'error', 'unhealthy']);

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function fingerprint(parts) {
  return createHash('sha256')
    .update(parts.map((item) => String(item || '').trim().toLowerCase()).join('|'))
    .digest('hex')
    .slice(0, 40);
}

function normalizeRisks(value) {
  const source = value instanceof Set ? [...value] : Array.from(value || []);
  return [...new Set(source.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

export class CommandCenter {
  static VERSION = 'aura-command-center-v1';

  constructor(kernel, evolution, bridge) {
    this.kernel = kernel;
    this.evolution = evolution;
    this.bridge = bridge;
    this.started = false;
    this.running = false;
    this.timer = null;
    this.warmupTimer = null;
    this.lastCycleAt = '';
    this.lastActionAt = '';
    this.lastError = '';
  }

  async init() {
    const stamp = now();
    for (const service of DEFAULT_SERVICES) {
      await query(
        `INSERT INTO aura_command_services(
          id,name,kind,objective,endpoint,repository,criticality,enabled,state,state_detail,
          last_observed_at,metadata,created_at,updated_at
        ) VALUES(?,?,?,?, '', '', ?,1,'unknown','', '', '{}',?,?)
        ON DUPLICATE KEY UPDATE
          name=VALUES(name),
          kind=VALUES(kind),
          objective=IF(objective='' OR objective IS NULL, VALUES(objective), objective),
          criticality=GREATEST(criticality, VALUES(criticality)),
          updated_at=VALUES(updated_at)`,
        [
          service.id,
          service.name,
          service.kind,
          service.objective,
          clamp(service.criticality),
          stamp,
          stamp,
        ],
      );
    }
  }

  async start() {
    if (this.started) return;
    await this.init();
    this.started = true;
    if (!config.commandCenterEnabled) return;
    const run = () => this.runCycle('autonomous').catch((error) => {
      this.lastError = String(error?.message || error).slice(0, 1000);
    });
    this.warmupTimer = setTimeout(
      run,
      Math.min(120_000, Math.max(15_000, config.commandCenterWarmupSeconds * 1000)),
    );
    this.timer = setInterval(run, config.commandCenterTickSeconds * 1000);
    this.warmupTimer.unref?.();
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.warmupTimer) clearTimeout(this.warmupTimer);
    this.timer = null;
    this.warmupTimer = null;
    this.started = false;
  }

  async services() {
    const rows = await query(
      `SELECT id,name,kind,objective,endpoint,repository,criticality,enabled,state,state_detail,
              last_observed_at,metadata,created_at,updated_at
       FROM aura_command_services
       ORDER BY criticality DESC,name ASC`,
    );
    return rows.map((row) => ({
      ...row,
      criticality: Number(row.criticality || 0),
      enabled: Boolean(row.enabled),
      metadata: parseJson(row.metadata, {}),
    }));
  }

  async upsertService(payload = {}) {
    const id = String(payload.id || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(0, 80);
    const name = String(payload.name || '').trim().slice(0, 160);
    if (!id || !name) throw new Error('id et name sont requis');
    const stamp = now();
    await query(
      `INSERT INTO aura_command_services(
        id,name,kind,objective,endpoint,repository,criticality,enabled,state,state_detail,
        last_observed_at,metadata,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,?, ?,?,?)
      ON DUPLICATE KEY UPDATE
        name=VALUES(name),
        kind=VALUES(kind),
        objective=VALUES(objective),
        endpoint=VALUES(endpoint),
        repository=VALUES(repository),
        criticality=VALUES(criticality),
        enabled=VALUES(enabled),
        metadata=VALUES(metadata),
        updated_at=VALUES(updated_at)`,
      [
        id,
        name,
        String(payload.kind || 'service').slice(0, 80),
        String(payload.objective || '').slice(0, 4000),
        String(payload.endpoint || '').slice(0, 1000),
        String(payload.repository || '').slice(0, 300),
        clamp(payload.criticality ?? 0.5),
        payload.enabled === false ? 0 : 1,
        String(payload.state || 'unknown').slice(0, 40),
        String(payload.state_detail || '').slice(0, 4000),
        String(payload.last_observed_at || ''),
        JSON.stringify(payload.metadata || {}).slice(0, 20000),
        stamp,
        stamp,
      ],
    );
    return one('SELECT * FROM aura_command_services WHERE id=?', [id]);
  }

  async observeService(id, payload = {}) {
    const serviceId = String(id || '').trim().slice(0, 80);
    const state = String(payload.state || 'unknown').trim().toLowerCase().slice(0, 40);
    const detail = String(payload.detail || payload.state_detail || '').slice(0, 4000);
    const metadata = JSON.stringify(payload.metadata || {}).slice(0, 20000);
    const stamp = now();
    const result = await query(
      `UPDATE aura_command_services
       SET state=?,state_detail=?,last_observed_at=?,metadata=?,updated_at=?
       WHERE id=?`,
      [state, detail, stamp, metadata, stamp, serviceId],
    );
    if (!Number(result.affectedRows || 0)) throw new Error('service inconnu');
    await query(
      'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(NULL,?,?,?)',
      [
        'service-observation',
        JSON.stringify({ service_id: serviceId, state, detail, metadata: payload.metadata || {} }).slice(0, 30000),
        stamp,
      ],
    );
    return one('SELECT * FROM aura_command_services WHERE id=?', [serviceId]);
  }

  async initiatives(limit = 30, status = '') {
    const max = Math.max(1, Math.min(Number(limit) || 30, 100));
    const normalizedStatus = String(status || '').trim().slice(0, 40);
    const rows = normalizedStatus
      ? await query(
        `SELECT * FROM aura_initiatives WHERE status=? ORDER BY priority DESC,updated_at DESC LIMIT ?`,
        [normalizedStatus, max],
      )
      : await query(
        `SELECT * FROM aura_initiatives ORDER BY updated_at DESC LIMIT ?`,
        [max],
      );
    return rows.map((row) => ({
      ...row,
      priority: Number(row.priority || 0),
      confidence: Number(row.confidence || 0),
      attempts: Number(row.attempts || 0),
      requested_risks: parseJson(row.requested_risks, []),
      result: parseJson(row.result, {}),
    }));
  }

  async countRecentInitiatives() {
    const threshold = new Date(Date.now() - 3600_000).toISOString();
    const row = await one(
      'SELECT COUNT(*) AS total FROM aura_initiatives WHERE created_at>=?',
      [threshold],
    );
    return Number(row?.total || 0);
  }

  async existingInitiative(candidate) {
    const active = await one(
      `SELECT id,status,updated_at FROM aura_initiatives
       WHERE fingerprint=? AND status IN ('queued','running','waiting')
       ORDER BY updated_at DESC LIMIT 1`,
      [candidate.fingerprint],
    );
    if (active) return active;
    const threshold = new Date(Date.now() - config.commandCenterCooldownSeconds * 1000).toISOString();
    return one(
      `SELECT id,status,updated_at FROM aura_initiatives
       WHERE fingerprint=? AND updated_at>=?
       ORDER BY updated_at DESC LIMIT 1`,
      [candidate.fingerprint, threshold],
    );
  }

  candidate(input) {
    const risks = normalizeRisks(input.requested_risks || config.commandCenterAllowedRisks);
    const domain = String(input.domain || 'aura').slice(0, 80);
    const kind = String(input.kind || 'reflection').slice(0, 40);
    const objective = String(input.objective || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
    return {
      ...input,
      domain,
      kind,
      objective,
      title: String(input.title || objective || 'Initiative AURA').slice(0, 240),
      rationale: String(input.rationale || '').slice(0, 5000),
      priority: clamp(input.priority ?? 0.5),
      confidence: clamp(input.confidence ?? 0.5),
      requested_risks: risks,
      fingerprint: fingerprint([domain, kind, input.signature || objective]),
    };
  }

  async buildCandidates() {
    const [intentions, improvements, outcomes, services, bridgeStatus] = await Promise.all([
      this.kernel.intentions(8),
      this.kernel.improvements(8),
      query(
        `SELECT automation_id,event_type,ok,signature,created_at
         FROM aura_outcomes ORDER BY id DESC LIMIT 24`,
      ),
      this.services(),
      this.bridge?.status?.() || Promise.resolve({ enabled: false, worker_online: false }),
    ]);
    const candidates = [];

    for (const service of services) {
      if (!service.enabled || !BAD_SERVICE_STATES.has(String(service.state || '').toLowerCase())) continue;
      candidates.push(this.candidate({
        domain: service.id,
        kind: 'operator',
        title: `Rétablir ${service.name}`,
        objective:
          `Diagnostiquer l’état ${service.state} de ${service.name}. `
          + `Objectif produit: ${service.objective || 'rétablir le service'}. `
          + `Commencer par une vérification réversible. Ne pas effectuer d’action irréversible.`,
        rationale: service.state_detail || `Service déclaré ${service.state}.`,
        priority: Math.min(0.98, 0.66 + Number(service.criticality || 0.5) * 0.30),
        confidence: 0.9,
        signature: `service:${service.id}:${service.state}`,
      }));
    }

    const recentFailures = new Map();
    for (const row of outcomes) {
      if (Boolean(row.ok)) continue;
      const key = `${row.automation_id}:${row.signature}`;
      const current = recentFailures.get(key) || { ...row, count: 0 };
      current.count += 1;
      recentFailures.set(key, current);
    }
    for (const failure of [...recentFailures.values()].filter((item) => item.count >= 2).slice(0, 3)) {
      candidates.push(this.candidate({
        domain: 'aura',
        kind: 'operator',
        title: 'Traiter un échec récurrent',
        objective:
          `Diagnostiquer l’échec récurrent ${failure.automation_id}: ${failure.signature}. `
          + `Chercher la cause, appliquer seulement une correction réversible et vérifier le résultat.`,
        rationale: `${failure.count} occurrences récentes.`,
        priority: Math.min(0.97, 0.72 + failure.count * 0.06),
        confidence: Math.min(0.96, 0.68 + failure.count * 0.07),
        signature: `failure:${failure.automation_id}:${failure.signature}`,
      }));
    }

    const proposal = improvements.find((row) => String(row.status || '') === 'proposed');
    if (proposal) {
      candidates.push(this.candidate({
        domain: 'aura',
        kind: 'evolution',
        title: 'Faire évoluer AURA sur une faiblesse observée',
        objective:
          `Traiter l’amélioration proposée pour ${proposal.target}. `
          + `Diagnostic: ${proposal.diagnosis}. Proposition: ${proposal.proposal}. `
          + `Validation attendue: ${proposal.validation_plan}.`,
        rationale: `Amélioration persistante avec ${Number(proposal.evidence_count || 0)} preuve(s).`,
        priority: Math.min(0.96, 0.70 + Math.min(Number(proposal.evidence_count || 0), 6) * 0.04),
        confidence: Math.min(0.94, 0.65 + Math.min(Number(proposal.evidence_count || 0), 6) * 0.04),
        requested_risks: [],
        signature: `improvement:${proposal.id}`,
      }));
    }

    const topIntention = intentions.find((row) => Number(row.priority || 0) >= 0.55);
    if (topIntention) {
      candidates.push(this.candidate({
        domain: String(parseJson(topIntention.context, {})?.domain || 'aura').slice(0, 80),
        kind: 'operator',
        title: 'Faire avancer une intention active',
        objective:
          `Faire avancer concrètement cette intention AURA: ${topIntention.statement}. `
          + `Choisir une prochaine action courte, réversible, mesurable et compatible avec les capacités réellement disponibles.`,
        rationale: `Intention active priorité=${Number(topIntention.priority || 0).toFixed(2)}.`,
        priority: Math.min(0.92, Math.max(0.58, Number(topIntention.priority || 0.5))),
        confidence: 0.72,
        signature: `intention:${topIntention.id}`,
      }));
    }

    if (!bridgeStatus?.worker_online) {
      candidates.push(this.candidate({
        domain: 'quantic-studio',
        kind: 'reflection',
        title: 'Maintenir l’autonomie malgré le bras local hors ligne',
        objective:
          'Évaluer ce qu’AURA peut continuer à faire côté Cloud sans Quantic Studio, '
          + 'identifier les missions bloquées et préparer leur reprise dès le retour du worker local.',
        rationale: 'Le worker Quantic Studio n’est pas actuellement en ligne.',
        priority: 0.64,
        confidence: 0.98,
        requested_risks: [],
        signature: 'bridge-offline',
      }));
    }

    if (!candidates.length) {
      candidates.push(this.candidate({
        domain: 'quantic-sillage',
        kind: 'reflection',
        title: 'Revue autonome de l’écosystème',
        objective:
          'Passer en revue les intentions, leçons, résultats et travaux récents de Quantic Sillage. '
          + 'Déterminer s’il existe une prochaine action utile; ne rien inventer si aucun signal concret ne le justifie.',
        rationale: 'Aucune urgence ni faiblesse prioritaire détectée.',
        priority: 0.42,
        confidence: 0.78,
        requested_risks: [],
        signature: 'ecosystem-review',
      }));
    }

    return candidates
      .filter((candidate) => candidate.objective && candidate.confidence >= config.commandCenterMinConfidence)
      .sort((a, b) => (b.priority + b.confidence * 0.15) - (a.priority + a.confidence * 0.15));
  }

  async persistInitiative(candidate) {
    const existing = await this.existingInitiative(candidate);
    if (existing) return { created: false, initiative: existing };

    const id = randomUUID();
    const stamp = now();
    await query(
      `INSERT INTO aura_initiatives(
        id,fingerprint,domain,kind,title,objective,rationale,priority,confidence,requested_risks,
        status,execution_mode,result,error,attempts,last_attempt_at,created_at,updated_at
      ) VALUES(?,?,?,?,?,?,?,?,?,?,'queued','','{}','',0,'',?,?)`,
      [
        id,
        candidate.fingerprint,
        candidate.domain,
        candidate.kind,
        candidate.title,
        candidate.objective,
        candidate.rationale,
        candidate.priority,
        candidate.confidence,
        JSON.stringify(candidate.requested_risks || []),
        stamp,
        stamp,
      ],
    );
    await query(
      'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(?,?,?,?)',
      [id, 'initiative-created', JSON.stringify(candidate).slice(0, 30000), stamp],
    );
    return {
      created: true,
      initiative: await one('SELECT * FROM aura_initiatives WHERE id=?', [id]),
    };
  }

  async updateInitiative(id, updates = {}) {
    const allowed = {
      status: String(updates.status || '').slice(0, 40),
      execution_mode: String(updates.execution_mode || '').slice(0, 80),
      result: JSON.stringify(updates.result || {}).slice(0, 100000),
      error: String(updates.error || '').slice(0, 5000),
      last_attempt_at: String(updates.last_attempt_at || now()).slice(0, 40),
    };
    await query(
      `UPDATE aura_initiatives
       SET status=?,execution_mode=?,result=?,error=?,
           attempts=attempts+1,last_attempt_at=?,updated_at=?
       WHERE id=?`,
      [
        allowed.status,
        allowed.execution_mode,
        allowed.result,
        allowed.error,
        allowed.last_attempt_at,
        now(),
        String(id),
      ],
    );
  }

  async executeInitiative(row) {
    const initiative = {
      ...row,
      requested_risks: parseJson(row.requested_risks, []),
    };
    const id = initiative.id;
    const bridgeOnline = this.bridge?.enabled && await this.bridge.workerOnline().catch(() => false);

    if (!config.commandCenterAutoExecute) {
      await this.updateInitiative(id, {
        status: 'waiting',
        execution_mode: 'autonomy-disabled',
        result: { reason: 'AURA_COMMAND_CENTER_AUTO_EXECUTE=false' },
      });
      return { id, status: 'waiting', reason: 'auto execution disabled' };
    }

    if (initiative.kind === 'operator' && !bridgeOnline) {
      await this.updateInitiative(id, {
        status: 'waiting',
        execution_mode: 'waiting-local-worker',
        result: { reason: 'Quantic Studio worker offline' },
      });
      return { id, status: 'waiting', reason: 'worker offline' };
    }

    await query(
      "UPDATE aura_initiatives SET status='running',updated_at=? WHERE id=?",
      [now(), id],
    );

    try {
      let result;
      let executionMode;

      if (initiative.kind === 'evolution') {
        executionMode = bridgeOnline ? 'evolution-hybrid' : 'evolution-cloud';
        result = await this.evolution.dispatchCycle(
          initiative.objective,
          'command-center',
        );
      } else if (initiative.kind === 'operator') {
        executionMode = 'quantic-studio-operator';
        result = await this.kernel.operate(
          initiative.objective,
          initiative.requested_risks,
        );
      } else {
        executionMode = 'native-reflection';
        result = await this.kernel.tick({
          trigger: 'command-center',
          text: initiative.objective,
          force: true,
        });
      }

      const executed = initiative.kind !== 'operator' || Boolean(result?.executed || result?.queued);
      const status = result?.queued ? 'waiting' : 'completed';
      await this.updateInitiative(id, {
        status,
        execution_mode: executionMode,
        result,
      });
      this.lastActionAt = now();
      await query(
        'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(?,?,?,?)',
        [id, 'initiative-result', JSON.stringify({ status, executionMode, result }).slice(0, 30000), now()],
      );
      await this.kernel.recordOutcome({
        automation_id: `command-center:${initiative.domain}`,
        event_type: `aura.initiative.${initiative.kind}`,
        ok: status === 'completed' && executed,
        signature: status === 'completed' && executed ? 'success' : (result?.reason || status),
        report: { initiative_id: id, title: initiative.title, result },
        created_at: now(),
      });
      return { id, status, execution_mode: executionMode, result };
    } catch (error) {
      const message = String(error?.message || error).slice(0, 5000);
      await this.updateInitiative(id, {
        status: 'failed',
        execution_mode: initiative.kind,
        error: message,
        result: {},
      });
      await query(
        'INSERT INTO aura_command_events(initiative_id,kind,payload,created_at) VALUES(?,?,?,?)',
        [id, 'initiative-error', JSON.stringify({ error: message }).slice(0, 30000), now()],
      );
      await this.kernel.recordOutcome({
        automation_id: `command-center:${initiative.domain}`,
        event_type: `aura.initiative.${initiative.kind}`,
        ok: false,
        signature: message,
        report: { initiative_id: id, title: initiative.title, error: message },
        created_at: now(),
      });
      throw error;
    }
  }

  async runCycle(trigger = 'manual') {
    if (!config.commandCenterEnabled) {
      return { ok: false, skipped: true, reason: 'command center disabled' };
    }
    if (this.running) {
      return { ok: true, skipped: true, reason: 'command center cycle already running' };
    }
    this.running = true;
    try {
      if (await this.countRecentInitiatives() >= config.commandCenterMaxInitiativesPerHour) {
        return { ok: true, skipped: true, reason: 'initiative hourly budget reached' };
      }
      const candidates = await this.buildCandidates();
      let selected = null;
      for (const candidate of candidates) {
        const persisted = await this.persistInitiative(candidate);
        if (!persisted.created) continue;
        selected = persisted.initiative;
        break;
      }
      this.lastCycleAt = now();
      if (!selected) {
        return { ok: true, skipped: true, reason: 'all candidates are cooling down', candidates: candidates.length };
      }
      const result = await this.executeInitiative(selected);
      this.lastError = '';
      return {
        ok: true,
        trigger,
        candidate_count: candidates.length,
        initiative: result,
      };
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 1000);
      throw error;
    } finally {
      this.running = false;
    }
  }

  async retryInitiative(id) {
    const row = await one('SELECT * FROM aura_initiatives WHERE id=?', [String(id)]);
    if (!row) throw new Error('initiative inconnue');
    if (ACTIVE_STATUSES.has(String(row.status || '')) && row.status !== 'waiting') {
      throw new Error(`initiative déjà active: ${row.status}`);
    }
    return this.executeInitiative(row);
  }

  async status({ publicView = true } = {}) {
    const [counts, bridgeStatus, services] = await Promise.all([
      one(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued,
          SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) AS running,
          SUM(CASE WHEN status='waiting' THEN 1 ELSE 0 END) AS waiting,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
         FROM aura_initiatives`,
      ),
      this.bridge?.status?.() || Promise.resolve({ enabled: false, worker_online: false }),
      this.services(),
    ]);
    const degraded = services.filter((item) => BAD_SERVICE_STATES.has(String(item.state || '').toLowerCase()));
    const payload = {
      version: CommandCenter.VERSION,
      enabled: config.commandCenterEnabled,
      started: this.started,
      running: this.running,
      auto_execute: config.commandCenterAutoExecute,
      autonomy_mode: 'continuous-native-initiative-with-bounded-execution',
      tick_seconds: config.commandCenterTickSeconds,
      max_initiatives_per_hour: config.commandCenterMaxInitiativesPerHour,
      min_confidence: config.commandCenterMinConfidence,
      local_worker_online: Boolean(bridgeStatus?.worker_online),
      last_cycle_at: this.lastCycleAt,
      last_action_at: this.lastActionAt,
      last_error: this.lastError,
      services: {
        total: services.length,
        degraded: degraded.length,
        observed: services.filter((item) => item.last_observed_at).length,
      },
      counts: {
        total: Number(counts?.total || 0),
        queued: Number(counts?.queued || 0),
        running: Number(counts?.running || 0),
        waiting: Number(counts?.waiting || 0),
        completed: Number(counts?.completed || 0),
        failed: Number(counts?.failed || 0),
      },
    };
    if (!publicView) {
      payload.allowed_risks = [...config.commandCenterAllowedRisks];
      payload.service_registry = services;
    }
    return payload;
  }
}
