import { randomUUID } from 'node:crypto';

import { config } from './config.js';
import { one, query } from './db.js';
import { clamp } from './policy.js';

const now = () => new Date().toISOString();

const ACTIVE_MISSION_STATUSES = new Set(['planning', 'running', 'waiting']);
const ACTIVE_STEP_STATUSES = new Set(['queued', 'running', 'waiting']);
const ALLOWED_STEP_KINDS = new Set(['reflection', 'research', 'operator', 'evolution']);

function parseJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function parseJsonObject(value) {
  const text = String(value || '').trim()
    .replace(/^\`\`\`json\s*/i, '')
    .replace(/^\`\`\`\s*/i, '')
    .replace(/\`\`\`$/, '')
    .trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeText(value, limit = 8000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function likelyNeedsResearch(value) {
  const text = String(value || '').toLowerCase();
  return [
    'web', 'internet', 'actuel', 'actuelle', 'récent', 'recent', 'marché', 'marche',
    'concurrent', 'documentation', 'version', 'prix', 'source', 'vérifie', 'verifie',
    'cherche', 'recherche', 'technolog', 'benchmark', 'norme', 'standard', 'licence',
  ].some((token) => text.includes(token));
}

function resultLooksSuccessful(kind, storedResult) {
  const result = parseJson(storedResult, {});
  const returnedStatus = String(result?.status || result?.result?.status || '').toLowerCase();
  if (['error', 'failed', 'cancelled', 'canceled', 'no-safe-patch'].includes(returnedStatus)) {
    return false;
  }
  if (returnedStatus.endsWith('-rejected')) return false;
  if (kind === 'operator' && result?.executed === false && !result?.queued) return false;
  if (result?.ok === false) return false;
  return true;
}

export class LongHorizonMissionEngine {
  static VERSION = 'aura-long-horizon-missions-v1';

  constructor(kernel) {
    this.kernel = kernel;
    this.lastError = '';
    this.lastAdvanceAt = '';
  }

  async init() {
    if (!config.longHorizonEnabled) return;
    // A crash must not leave a mission or step permanently "running".
    const interruptedPlans = await query(
      `SELECT id FROM aura_missions WHERE status='planning' ORDER BY updated_at ASC`,
    ).catch(() => []);
    for (const row of interruptedPlans) {
      await this.planMission(row.id, { reason: 'resume-interrupted-plan' }).catch((error) => {
        this.lastError = String(error?.message || error).slice(0, 4000);
      });
    }
    await query(
      `UPDATE aura_mission_steps s
       JOIN aura_initiatives i ON i.id=s.initiative_id
       SET s.status=CASE
         WHEN i.status IN ('queued','running','waiting') THEN i.status
         ELSE s.status
       END,
       s.updated_at=?
       WHERE s.status IN ('queued','running','waiting')`,
      [now()],
    ).catch(() => {});
  }

  async list(limit = 20, status = '') {
    const bounded = Math.max(1, Math.min(Number(limit) || 20, 100));
    const wanted = String(status || '').trim().toLowerCase();
    const rows = wanted
      ? await query(
        `SELECT * FROM aura_missions WHERE status=? ORDER BY priority DESC,updated_at DESC LIMIT ?`,
        [wanted, bounded],
      )
      : await query(
        `SELECT * FROM aura_missions ORDER BY updated_at DESC LIMIT ?`,
        [bounded],
      );
    return rows.map((row) => this.publicMission(row));
  }

  async get(id) {
    const mission = await one('SELECT * FROM aura_missions WHERE id=?', [String(id)]);
    if (!mission) return null;
    const steps = await query(
      `SELECT * FROM aura_mission_steps WHERE mission_id=? ORDER BY position ASC,created_at ASC`,
      [String(id)],
    );
    return {
      ...this.publicMission(mission),
      steps: steps.map((step) => ({
        ...step,
        requested_risks: parseJson(step.requested_risks, []),
        result: parseJson(step.result, {}),
        critique: parseJson(step.critique, {}),
      })),
    };
  }

  publicMission(row) {
    return {
      id: row.id,
      source_intention_id: row.source_intention_id || '',
      title: row.title,
      objective: row.objective,
      success_criteria: parseJson(row.success_criteria, []),
      status: row.status,
      priority: Number(row.priority || 0),
      confidence: Number(row.confidence || 0),
      plan_version: Number(row.plan_version || 1),
      revision_count: Number(row.revision_count || 0),
      max_revisions: Number(row.max_revisions || 0),
      current_step_index: Number(row.current_step_index || 0),
      progress: Number(row.progress || 0),
      state: parseJson(row.state, {}),
      last_error: row.last_error || '',
      started_at: row.started_at || '',
      completed_at: row.completed_at || '',
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async activeMission() {
    return one(
      `SELECT * FROM aura_missions
       WHERE status IN ('planning','running','waiting')
       ORDER BY priority DESC,updated_at ASC LIMIT 1`,
    );
  }

  async createMission(input = {}) {
    if (!config.longHorizonEnabled) throw new Error('Long-horizon autonomy disabled');
    const objective = normalizeText(input.objective || input.statement, 8000);
    if (!objective) throw new Error('Objectif de mission vide');

    const sourceIntentionId = String(input.source_intention_id || '').slice(0, 36);
    const existing = sourceIntentionId
      ? await one(
        `SELECT * FROM aura_missions
         WHERE source_intention_id=? AND status IN ('planning','running','waiting')
         ORDER BY updated_at DESC LIMIT 1`,
        [sourceIntentionId],
      )
      : null;
    if (existing) return this.get(existing.id);

    const id = randomUUID();
    const stamp = now();
    const priority = clamp(input.priority ?? 0.72);
    const confidence = clamp(input.confidence ?? 0.70);
    const title = normalizeText(input.title || objective, 240);
    const successCriteria = Array.isArray(input.success_criteria)
      ? input.success_criteria.map((item) => normalizeText(item, 800)).filter(Boolean).slice(0, 8)
      : [
        'Au moins une action ou conclusion vérifiable est produite.',
        'Chaque étape terminée laisse une trace de résultat.',
        'Les échecs modifient la stratégie au lieu de répéter aveuglément la même action.',
      ];

    await query(
      `INSERT INTO aura_missions(
        id,source_intention_id,title,objective,success_criteria,status,priority,confidence,
        plan_version,revision_count,max_revisions,current_step_index,progress,state,last_error,
        started_at,completed_at,created_at,updated_at
      ) VALUES(?,?,?,?,?,'planning',?,?,0,0,?,0,0,?,'',?,'',?,?)`,
      [
        id,
        sourceIntentionId,
        title,
        objective,
        JSON.stringify(successCriteria),
        priority,
        confidence,
        config.longHorizonMaxRevisions,
        JSON.stringify({ trigger: String(input.trigger || 'autonomous').slice(0, 120) }),
        stamp,
        stamp,
        stamp,
      ],
    );

    try {
      await this.planMission(id, { reason: 'initial-plan' });
    } catch (error) {
      const message = String(error?.message || error).slice(0, 4000);
      this.lastError = message;
      await query(
        `UPDATE aura_missions SET status='failed',last_error=?,updated_at=? WHERE id=?`,
        [message, now(), id],
      );
      throw error;
    }
    return this.get(id);
  }

  async planMission(id, { reason = 'replan', history = [] } = {}) {
    const mission = await one('SELECT * FROM aura_missions WHERE id=?', [String(id)]);
    if (!mission) throw new Error('Mission inconnue');

    const targetPlanVersion = Number(mission.plan_version || 0) + 1;
    const lessons = await this.kernel.lessons(8).catch(() => []);
    const prompt = [
      'Construis un plan de mission AURA longue durée.',
      'Retourne UNIQUEMENT un objet JSON avec "steps".',
      `Maximum ${config.longHorizonMaxSteps} étapes.`,
      'Chaque étape: title, objective, kind, requested_risks, expected_signal.',
      'kind doit être reflection, research, operator ou evolution.',
      'Une étape doit être courte, vérifiable et apporter un signal observable.',
      'Ne demande aucune action irréversible ni secret.',
      'Utilise research avant operator si des faits externes actuels sont nécessaires.',
      '',
      `OBJECTIF: ${mission.objective}`,
      `CRITÈRES: ${mission.success_criteria}`,
      `RAISON: ${reason}`,
      `HISTORIQUE: ${JSON.stringify(history).slice(0, 7000)}`,
      `LEÇONS: ${JSON.stringify(lessons).slice(0, 5000)}`,
    ].join('\n');

    let parsed = {};
    try {
      const answer = await this.kernel.runAgent('planner', prompt);
      parsed = parseJsonObject(answer?.answer);
    } catch {
      parsed = {};
    }

    let steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    if (!steps.length) {
      const researchFirst = likelyNeedsResearch(mission.objective);
      steps = [
        ...(researchFirst ? [{
          title: 'Établir les faits',
          objective: `Rassembler les faits vérifiables nécessaires pour décider comment atteindre: ${mission.objective}`,
          kind: 'research',
          requested_risks: [],
          expected_signal: 'Des preuves ou contraintes vérifiables sont disponibles.',
        }] : []),
        {
          title: 'Choisir et exécuter la prochaine action',
          objective: `Agir de façon bornée et réversible pour faire progresser: ${mission.objective}`,
          kind: 'operator',
          requested_risks: ['safe', 'ai', 'network', 'browser-control'],
          expected_signal: 'Une action concrète produit un résultat observable.',
        },
        {
          title: 'Vérifier et apprendre',
          objective: `Évaluer le résultat obtenu, les écarts et la prochaine décision pour: ${mission.objective}`,
          kind: 'reflection',
          requested_risks: [],
          expected_signal: 'Le résultat est évalué et une leçon exploitable est produite.',
        },
      ];
    }

    const sanitized = [];
    for (const [index, raw] of steps.slice(0, config.longHorizonMaxSteps).entries()) {
      const kind = ALLOWED_STEP_KINDS.has(String(raw?.kind || '').toLowerCase())
        ? String(raw.kind).toLowerCase()
        : 'reflection';
      const objective = normalizeText(raw?.objective || raw?.title, 6000);
      if (!objective) continue;
      const requestedRisks = Array.isArray(raw?.requested_risks)
        ? raw.requested_risks
          .map((item) => String(item).trim().toLowerCase())
          .filter((risk) => config.commandCenterAllowedRisks.has(risk))
          .slice(0, 12)
        : [];
      sanitized.push({
        position: index,
        title: normalizeText(raw?.title || objective, 240),
        objective,
        kind,
        requested_risks: requestedRisks,
        expected_signal: normalizeText(raw?.expected_signal || 'Résultat observable produit.', 1600),
      });
    }
    if (!sanitized.length) throw new Error('Le planificateur n’a produit aucune étape exploitable');

    const stamp = now();
    // Old pending work belongs to a strategy being replaced. Keep it as history,
    // but never let it count as part of the new plan.
    await query(
      `UPDATE aura_mission_steps
       SET status='superseded',updated_at=?
       WHERE mission_id=? AND plan_version=? AND status='pending'`,
      [stamp, mission.id, Number(mission.plan_version || 0)],
    );
    // If a previous planning attempt crashed midway, rebuild the same target
    // plan version from scratch before publishing it as active.
    await query(
      `DELETE FROM aura_mission_steps
       WHERE mission_id=? AND plan_version=?`,
      [mission.id, targetPlanVersion],
    );
    const lastPosition = await one(
      'SELECT COALESCE(MAX(position),-1) AS position FROM aura_mission_steps WHERE mission_id=?',
      [mission.id],
    );
    let position = Number(lastPosition?.position ?? -1) + 1;
    for (const step of sanitized) {
      await query(
        `INSERT INTO aura_mission_steps(
          id,mission_id,position,plan_version,title,objective,kind,requested_risks,status,initiative_id,
          attempts,max_attempts,expected_signal,result,critique,started_at,completed_at,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,'pending','',0,?,?,'{}','{}','','',?,?)`,
        [
          randomUUID(),
          mission.id,
          position,
          targetPlanVersion,
          step.title,
          step.objective,
          step.kind,
          JSON.stringify(step.requested_risks),
          config.longHorizonStepMaxAttempts,
          step.expected_signal,
          stamp,
          stamp,
        ],
      );
      position += 1;
    }

    await query(
      `UPDATE aura_missions
       SET status='running',plan_version=?,last_error='',
           state=?,updated_at=?
       WHERE id=?`,
      [
        targetPlanVersion,
        JSON.stringify({
          last_plan_reason: reason,
          planner: parsed.steps ? 'aura-planner-agent' : 'deterministic-fallback',
          planned_steps: sanitized.length,
          plan_version: targetPlanVersion,
        }),
        stamp,
        mission.id,
      ],
    );
    return this.get(mission.id);
  }

  async ensureAutonomousMission() {
    const active = await this.activeMission();
    if (active) return active;
    if (!config.longHorizonAutoSeed) return null;

    const intentions = await this.kernel.intentions(12);
    const threshold = Number(config.longHorizonMinPriority || 0.72);
    for (const intention of intentions) {
      if (Number(intention.priority || 0) < threshold) continue;
      const recent = await one(
        `SELECT id,status,updated_at FROM aura_missions
         WHERE source_intention_id=?
         ORDER BY updated_at DESC LIMIT 1`,
        [String(intention.id)],
      );
      if (recent) {
        const age = Date.now() - Date.parse(String(recent.updated_at || ''));
        if (Number.isFinite(age) && age < config.longHorizonReseedHours * 3600_000) continue;
      }
      const created = await this.createMission({
        source_intention_id: intention.id,
        title: normalizeText(intention.statement, 240),
        objective: intention.statement,
        priority: intention.priority,
        confidence: Math.max(0.62, Number(intention.priority || 0.5)),
        trigger: 'active-intention',
      });
      return one('SELECT * FROM aura_missions WHERE id=?', [created.id]);
    }
    return null;
  }

  async critiqueStep(mission, step, initiative) {
    const result = parseJson(initiative?.result, {});
    const deterministicSuccess = initiative?.status === 'completed'
      && resultLooksSuccessful(step.kind, result);
    let critic = {
      verdict: deterministicSuccess ? 'continue' : 'retry',
      confidence: deterministicSuccess ? 0.78 : 0.72,
      reason: deterministicSuccess
        ? 'Étape terminée sans signal d’échec déterministe.'
        : 'Étape non concluante ou en échec.',
    };
    try {
      const response = await this.kernel.runAgent(
        'critic',
        [
          'Évalue ce résultat de mission. Retourne JSON verdict, confidence, reason.',
          'verdict: continue, retry, replan ou complete.',
          'Ne marque complete que si l’objectif global est réellement satisfait par les éléments fournis.',
          `MISSION=${mission.objective}`,
          `CRITERES=${mission.success_criteria}`,
          `ETAPE=${JSON.stringify({
            title: step.title,
            objective: step.objective,
            expected_signal: step.expected_signal,
            attempts: step.attempts,
          })}`,
          `INITIATIVE=${JSON.stringify({
            status: initiative?.status,
            error: initiative?.error,
            result,
          }).slice(0, 9000)}`,
        ].join('\n'),
      );
      const parsed = parseJsonObject(response?.answer);
      const verdict = String(parsed.verdict || '').toLowerCase();
      if (['continue', 'retry', 'replan', 'complete'].includes(verdict)) {
        critic = {
          verdict,
          confidence: clamp(parsed.confidence ?? critic.confidence),
          reason: normalizeText(parsed.reason || critic.reason, 3000),
        };
      }
    } catch {}
    if (!deterministicSuccess && critic.verdict === 'continue') critic.verdict = 'retry';
    return critic;
  }

  async updateProgress(missionId) {
    const mission = await one('SELECT plan_version FROM aura_missions WHERE id=?', [missionId]);
    const planVersion = Number(mission?.plan_version || 0);
    const counts = await one(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed
       FROM aura_mission_steps
       WHERE mission_id=? AND plan_version=?
         AND status NOT IN ('failed','superseded','cancelled')`,
      [missionId, planVersion],
    );
    const total = Number(counts?.total || 0);
    const completed = Number(counts?.completed || 0);
    const progress = total ? Math.min(1, completed / total) : 0;
    await query(
      'UPDATE aura_missions SET progress=?,current_step_index=?,updated_at=? WHERE id=?',
      [progress, completed, now(), missionId],
    );
    return { total, completed, progress };
  }

  async finishMission(mission, { success, reason = '' } = {}) {
    const status = success ? 'completed' : 'failed';
    const stamp = now();
    await query(
      `UPDATE aura_missions
       SET status=?,progress=?,last_error=?,completed_at=?,updated_at=?
       WHERE id=?`,
      [status, success ? 1 : Number(mission.progress || 0), success ? '' : normalizeText(reason, 4000), stamp, stamp, mission.id],
    );
    await this.kernel.learn({
      lessonKey: `mission:${mission.id}:${status}`,
      content: success
        ? `Mission longue durée terminée: ${mission.objective}. La stratégie a atteint ses étapes vérifiées.`
        : `Mission longue durée arrêtée: ${mission.objective}. Cause: ${normalizeText(reason || 'révisions épuisées', 1800)}`,
      confidence: success ? 0.82 : 0.76,
      source: 'long-horizon-mission',
    }).catch(() => {});
    return this.get(mission.id);
  }

  async replanMission(mission, failedStep, critique, initiative) {
    const revisions = Number(mission.revision_count || 0);
    if (revisions >= Number(mission.max_revisions || config.longHorizonMaxRevisions)) {
      return this.finishMission(mission, {
        success: false,
        reason: `Limite de révisions atteinte après ${failedStep.title}: ${critique.reason}`,
      });
    }
    const historyRows = await query(
      `SELECT position,title,objective,kind,status,attempts,result,critique
       FROM aura_mission_steps WHERE mission_id=? ORDER BY position ASC`,
      [mission.id],
    );
    await query(
      `UPDATE aura_missions
       SET revision_count=revision_count+1,status='planning',last_error=?,updated_at=?
       WHERE id=?`,
      [normalizeText(critique.reason, 4000), now(), mission.id],
    );
    await this.kernel.learn({
      lessonKey: `mission-replan:${mission.id}:${Number(mission.revision_count || 0) + 1}`,
      content: `La stratégie de mission doit changer après l'étape « ${failedStep.title} ». ${critique.reason}`,
      confidence: Math.max(0.6, Number(critique.confidence || 0.6)),
      source: 'long-horizon-critic',
    }).catch(() => {});
    return this.planMission(mission.id, {
      reason: `critic-${critique.verdict}`,
      history: historyRows.map((row) => ({
        ...row,
        result: parseJson(row.result, {}),
        critique: parseJson(row.critique, {}),
      })).concat([{
        failed_initiative: initiative?.id || '',
        error: initiative?.error || '',
      }]),
    });
  }

  async reconcileActiveStep(mission) {
    const step = await one(
      `SELECT * FROM aura_mission_steps
       WHERE mission_id=? AND initiative_id<>''
         AND status IN ('queued','running','waiting')
       ORDER BY position ASC LIMIT 1`,
      [mission.id],
    );
    if (!step) return null;

    const initiative = await one('SELECT * FROM aura_initiatives WHERE id=?', [step.initiative_id]);
    if (!initiative) {
      await query(
        `UPDATE aura_mission_steps
         SET status='pending',initiative_id='',updated_at=?
         WHERE id=?`,
        [now(), step.id],
      );
      return { reconciled: true, state: 'initiative-missing' };
    }

    if (ACTIVE_STEP_STATUSES.has(String(initiative.status || ''))) {
      if (step.status !== initiative.status) {
        await query(
          'UPDATE aura_mission_steps SET status=?,updated_at=? WHERE id=?',
          [initiative.status, now(), step.id],
        );
      }
      return { reconciled: false, state: initiative.status, initiative_id: initiative.id };
    }

    const critique = await this.critiqueStep(mission, step, initiative);
    const successful = initiative.status === 'completed'
      && resultLooksSuccessful(step.kind, initiative.result)
      && !['retry', 'replan'].includes(critique.verdict);

    if (successful) {
      await query(
        `UPDATE aura_mission_steps
         SET status='completed',result=?,critique=?,completed_at=?,updated_at=?
         WHERE id=?`,
        [
          String(initiative.result || '{}').slice(0, 100000),
          JSON.stringify(critique).slice(0, 12000),
          now(),
          now(),
          step.id,
        ],
      );
      const progress = await this.updateProgress(mission.id);
      if (critique.verdict === 'complete' || (progress.total > 0 && progress.completed >= progress.total)) {
        await this.finishMission(await one('SELECT * FROM aura_missions WHERE id=?', [mission.id]), {
          success: true,
          reason: critique.reason,
        });
        return { reconciled: true, state: 'mission-completed', initiative_id: initiative.id };
      }
      return { reconciled: true, state: 'step-completed', initiative_id: initiative.id };
    }

    const attempts = Number(step.attempts || 0) + 1;
    await query(
      `UPDATE aura_mission_steps
       SET status='failed',attempts=?,result=?,critique=?,completed_at=?,updated_at=?
       WHERE id=?`,
      [
        attempts,
        String(initiative.result || '{}').slice(0, 100000),
        JSON.stringify(critique).slice(0, 12000),
        now(),
        now(),
        step.id,
      ],
    );

    if (critique.verdict === 'retry' && attempts < Number(step.max_attempts || config.longHorizonStepMaxAttempts)) {
      const newStepId = randomUUID();
      await query(
        `INSERT INTO aura_mission_steps(
          id,mission_id,position,plan_version,title,objective,kind,requested_risks,status,initiative_id,
          attempts,max_attempts,expected_signal,result,critique,started_at,completed_at,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,'pending','',?, ?,?,'{}','{}','','',?,?)`,
        [
          newStepId,
          mission.id,
          Number(step.position) + 0.01,
          Number(step.plan_version || mission.plan_version || 1),
          `${step.title} · nouvelle tentative`,
          `${step.objective}\nÉvite de répéter la cause précédente: ${critique.reason}`,
          step.kind,
          step.requested_risks,
          attempts,
          step.max_attempts,
          step.expected_signal,
          now(),
          now(),
        ],
      );
      return { reconciled: true, state: 'step-retry', initiative_id: initiative.id };
    }

    await this.replanMission(
      await one('SELECT * FROM aura_missions WHERE id=?', [mission.id]),
      step,
      critique,
      initiative,
    );
    return { reconciled: true, state: 'mission-replanned', initiative_id: initiative.id };
  }

  async nextCandidate() {
    if (!config.longHorizonEnabled) return { enabled: false };
    let mission = await this.ensureAutonomousMission();
    if (!mission) return { enabled: true, idle: true, reason: 'no mission candidate' };

    if (String(mission.status || '') === 'planning') {
      await this.planMission(mission.id, { reason: 'resume-planning-state' });
      mission = await one('SELECT * FROM aura_missions WHERE id=?', [mission.id]);
    }

    const reconciliation = await this.reconcileActiveStep(mission);
    mission = await one('SELECT * FROM aura_missions WHERE id=?', [mission.id]);
    if (!mission || !ACTIVE_MISSION_STATUSES.has(String(mission.status || ''))) {
      return { enabled: true, mission: mission ? this.publicMission(mission) : null, reconciliation };
    }

    const active = await one(
      `SELECT id,status,initiative_id FROM aura_mission_steps
       WHERE mission_id=? AND status IN ('queued','running','waiting')
       ORDER BY position ASC LIMIT 1`,
      [mission.id],
    );
    if (active) {
      return {
        enabled: true,
        mission: this.publicMission(mission),
        waiting: true,
        step: active,
        reconciliation,
      };
    }

    const step = await one(
      `SELECT * FROM aura_mission_steps
       WHERE mission_id=? AND status='pending'
       ORDER BY position ASC,created_at ASC LIMIT 1`,
      [mission.id],
    );
    if (!step) {
      const progress = await this.updateProgress(mission.id);
      if (progress.total > 0 && progress.completed >= progress.total) {
        const finished = await this.finishMission(mission, { success: true });
        return { enabled: true, mission: finished, completed: true };
      }
      return { enabled: true, mission: this.publicMission(mission), idle: true, reason: 'no pending step' };
    }

    const requestedRisks = parseJson(step.requested_risks, [])
      .filter((risk) => config.commandCenterAllowedRisks.has(String(risk)));
    this.lastAdvanceAt = now();
    return {
      enabled: true,
      mission: this.publicMission(mission),
      step: {
        id: step.id,
        position: Number(step.position),
        title: step.title,
        objective: step.objective,
        kind: step.kind,
        requested_risks: requestedRisks,
        expected_signal: step.expected_signal,
      },
      candidate: {
        domain: 'aura',
        kind: step.kind,
        title: `Mission · ${step.title}`,
        objective: [
          step.objective,
          `Signal attendu: ${step.expected_signal}`,
          `Mission globale: ${mission.objective}`,
        ].join('\n'),
        rationale: `Étape persistante ${Number(step.position) + 1} de la mission longue durée ${mission.id}.`,
        priority: Math.max(0.62, Number(mission.priority || 0.72)),
        confidence: Math.max(0.58, Number(mission.confidence || 0.70)),
        requested_risks: requestedRisks,
        action_payload: {
          long_horizon_mission_id: mission.id,
          long_horizon_step_id: step.id,
        },
        signature: `mission:${mission.id}:step:${step.id}`,
      },
      reconciliation,
    };
  }

  async bindInitiative(stepId, initiativeId) {
    const step = await one('SELECT * FROM aura_mission_steps WHERE id=?', [String(stepId)]);
    if (!step) throw new Error('Étape de mission inconnue');
    if (step.initiative_id) return step;
    await query(
      `UPDATE aura_mission_steps
       SET initiative_id=?,status='queued',started_at=IF(started_at='',?,started_at),updated_at=?
       WHERE id=?`,
      [String(initiativeId), now(), now(), step.id],
    );
    await query(
      `UPDATE aura_missions SET status='running',updated_at=? WHERE id=?`,
      [now(), step.mission_id],
    );
    return one('SELECT * FROM aura_mission_steps WHERE id=?', [step.id]);
  }

  async control(id, action) {
    const mission = await one('SELECT * FROM aura_missions WHERE id=?', [String(id)]);
    if (!mission) throw new Error('Mission inconnue');
    const command = String(action || '').toLowerCase();
    if (command === 'pause') {
      await query(
        `UPDATE aura_missions SET status='paused',updated_at=? WHERE id=?`,
        [now(), mission.id],
      );
    } else if (command === 'resume') {
      await query(
        `UPDATE aura_missions SET status='running',updated_at=? WHERE id=? AND status='paused'`,
        [now(), mission.id],
      );
    } else if (command === 'cancel') {
      await query(
        `UPDATE aura_missions SET status='cancelled',completed_at=?,updated_at=? WHERE id=?`,
        [now(), now(), mission.id],
      );
    } else {
      throw new Error('Action de mission inconnue');
    }
    return this.get(mission.id);
  }

  async status() {
    const [active, counts] = await Promise.all([
      this.activeMission(),
      one(
        `SELECT COUNT(*) AS total,
          SUM(CASE WHEN status IN ('planning','running','waiting') THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
          SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
         FROM aura_missions`,
      ),
    ]);
    return {
      version: LongHorizonMissionEngine.VERSION,
      enabled: config.longHorizonEnabled,
      auto_seed: config.longHorizonAutoSeed,
      active: active ? this.publicMission(active) : null,
      counts: {
        total: Number(counts?.total || 0),
        active: Number(counts?.active || 0),
        completed: Number(counts?.completed || 0),
        failed: Number(counts?.failed || 0),
      },
      max_steps: config.longHorizonMaxSteps,
      max_revisions: config.longHorizonMaxRevisions,
      last_advance_at: this.lastAdvanceAt,
      last_error: this.lastError,
    };
  }
}
