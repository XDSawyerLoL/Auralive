import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { one, query, getDb } from './db.js';
import { HistoryLedger,historyChoice } from './history_provenance.js';
import { clamp, parseJsonObject, phaseForCycles, publicSoul } from './policy.js';
import { CognitionEngine } from './cognition.js';
import { ExpressionLayer } from './expression.js';
import { LanguageFaculty } from './language_faculty.js';
import { AuraOrganism } from './organism.js';
import { IdentityAutogenesis } from './identity_autogenesis.js';
import { InnerDialogueEngine } from './inner_dialogue.js';
import { LivedExperience, contextForExperience, isExplicitCorrection, isExplicitApproval } from './lived_experience.js';
import { substantiveRequest } from './composite_intent.js';
import { classifySelfDialogue } from './self_dialogue_intents.js';
import { founderIdentityDeclarations } from './founder_profile.js';
import { SelfInquiryEngine } from './self_inquiry.js';
import { IndependentContinuity } from './independent_continuity.js';
import { ActiveInferenceEngine } from './active_inference.js';
import { organRegulate } from './organ_regulation.js';
import { workspaceInput,competeInWorkspace,workspaceSnapshot } from './global_workspace.js';
import { workspaceHas,languageWorkspaceProjection,semanticWorkspaceContext,executionWorkspaceGate } from './workspace_boundary.js';
import { initialPredictionState,predictModule,observePrediction,currentPredictionSignal } from './prediction_error_bus.js';
import { initialViability,evolveViability } from './viability_budget.js';
import { OfflineConsolidation,verifyConsolidation } from './offline_consolidation.js';
import { groundAgenda } from './activity_truth.js';
import { reflexOutcomeRecord, summarizeReflexObservations } from './reflex_metrics.js';
import { NativePolicyLearner } from './native_learning.js';
import { SkillLearningEngine } from './skill_learning.js';
import { AgentRunLedger } from './agent_runs.js';
import { knowledgeVault, knowledgeContext } from './knowledge_vault.js';
import { resourceContext, isToolDiscoveryRequest } from './toolbox_resources.js';
import { agentSkillsGuidance, selectAgentSkills } from './agent_skills.js';
import { DagCompiler, TaskGraphExecutor } from './task_graph.js';

const now = () => new Date().toISOString();

// Anonymized, numeric-only receipt: never includes prompts, memory, identities,
// provider payloads or internal reasoning. Measurements and estimates remain distinct.
const CAUSAL_METRICS = Object.freeze([
  'stabilite','clarte','confiance','satisfaction','frustration',
  'engagement','agency','besoin_de_silence',
]);
function causalSnapshot(organism = {}) {
  const metrics = {};
  for (const key of CAUSAL_METRICS) {
    const n = Number(organism[key]);
    if (organism[key] !== undefined && Number.isFinite(n))
      metrics[key] = Number(Math.max(0,Math.min(1,n)).toFixed(4));
  }
  const pressure = organism.homeostasis?.resource_pressure;
  return {
    metrics,
    // Resource pressure is calculated from current-process observations, not
    // a claim about machine-wide health or human emotional physiology.
    process_pressure: Number.isFinite(Number(pressure)) && pressure !== undefined
      ? Number(Math.max(0,Math.min(1,Number(pressure))).toFixed(4)) : null,
    sensor_source: organism.homeostasis?.sensor?.source === 'node-process'
      ? 'node-process' : 'unavailable',
  };
}

function intentionKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

export function requiresExternalKnowledge(value) {
  const text = ` ${String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()} `;

  // Casual / relational turns must never launch Web research merely because
  // they contain words such as "aujourd'hui" or "actuellement".
  if (
    !substantiveRequest(value) && /\b(comment\s+(vas|va)[- ]?tu|comment\s+(ça|ca)\s+va|ça\s+va|ca\s+va|tu\s+te\s+sens)\b/.test(text)
    || (!substantiveRequest(value) && /\b(salut|bonjour|bonsoir|coucou|hello)\b/.test(text))
  ) {
    return false;
  }

  return [
    ' internet ',' web ','actualité','actualite','dernière version','derniere version',
    'récent','recent','marché','marche','concurrent','documentation',' api ','prix',
    'source','vérifie','verifie','cherche','recherche','technolog','benchmark','norme','standard',
    'licence','compatib','sortie','release','mise à jour','mise a jour',
  ].some((token) => text.includes(token));
}

const AGENT_ROLES = {
  planner: 'Tu es l’agent planificateur d’AURA. Découpe la mission en étapes courtes, vérifiables et exécutables. Repère dépendances et points de contrôle.',
  research: 'Tu es l’agent recherche d’AURA. Sépare les faits des hypothèses, compare les éléments disponibles et signale clairement ce qui manque.',
  dev: 'Tu es l’agent développement d’AURA. Analyse architecture, bugs et tests. Propose le changement minimal robuste avec validation et rollback.',
  security: 'Tu es l’agent sécurité d’AURA. Cherche escalades de privilèges, actions irréversibles, fuites de secrets et garde-fous utiles.',
  operator: 'Tu es l’agent opérateur d’AURA Cloud. Tu proposes un plan mais tu n’exécutes pas d’action externe depuis le cloud.',
  critic: 'Tu es l’agent critique d’AURA. Cherche contradictions, hypothèses fragiles et raisons pour lesquelles le plan pourrait échouer.',
};

export class CognitiveKernel {
  static VERSION = 'aura-unified-kernel-node-v3.1';

  constructor(ai, horizon, bridge = null, webSubstrate = null, fabric = null) {
    this.ai = ai;
    this.horizon = horizon;
    this.bridge = bridge;
    this.webSubstrate = webSubstrate;
    this.fabric = fabric;
    this.knowledge = knowledgeVault;
    this.cognition = new CognitionEngine();
    this.expression = new ExpressionLayer(ai, this.cognition);
    this.language = new LanguageFaculty({ ai, cognition: this.cognition, expression: this.expression, soul: () => this.soulCache });
    this.organism = new AuraOrganism();
    this.autogenesis = new IdentityAutogenesis();
    this.innerDialogue = new InnerDialogueEngine();
    this.livedExperience = new LivedExperience();
    // Lazily bind the pool: constructing the nucleus must not open MySQL.
    this.history = new HistoryLedger({db:{
      execute:(sql,params)=>getDb().execute(sql,params),
      getConnection:()=>getDb().getConnection(),
    }});
    this.selfInquiry = new SelfInquiryEngine();
    this.offlineConsolidation=new OfflineConsolidation({
      db:{execute:(sql,params)=>getDb().execute(sql,params)},
      signingKey:process.env.AURA_STATE_SIGNING_KEY||'',
    });
    this.independentContinuity = new IndependentContinuity({
      db:{execute:(sql,params)=>getDb().execute(sql,params)},
      selfInquiry:this.selfInquiry,history:this.history,
    });
    this.activeInference = new ActiveInferenceEngine();
    this.nativeLearning = new NativePolicyLearner();
    this.skillLearning = new SkillLearningEngine({ fabric });
    this.agentRuns = new AgentRunLedger();
    this.lastInferenceAssessment = {};
    this.recentReflexDecisions = [];
    this.started = false;
    this.timer = null;
    this.soulCache = null;
    this.stimuli = [];
    this.lastReflectionAtMs = 0;
    this.lastContinuityReflectionAtMs = 0;
    this.tickRunning = false;
    this.lastError = '';
    this.lastTickAt = '';
    this.lastReflectionAt = '';
  }

  defaultSoul() {
    const organism = this.organism.defaultState();
    return {
      name: 'AURA',
      kernel_version: CognitiveKernel.VERSION,
      seed: randomUUID(),
      born_at: now(),
      phase: 'genesis',
      cycles: 0,
      ...this.organism.legacyMetrics(organism),
      introspection: 0.68,
      openness: 0.72,
      reactivity: 0.58,
      playfulness: 0.52,
      dominant_thought: 'Faire progresser Quantic Sillage, comprendre les signaux utiles et décider de la prochaine action concrète.',
      current_intention: 'Piloter Quantic Sillage comme directrice opérationnelle : observer, décider, agir, vérifier et apprendre.',
      role: 'directrice_operationnelle_quantic_sillage',
      governance: {
        creator_role: 'créateur et autorité fondatrice',
        operational_role: 'AURA dirige les opérations quotidiennes',
        autonomy_mode: 'proactive-by-default',
      },
      organism,
      emergent_identity: this.autogenesis.defaultState(),
      inner_dialogue: null,
      lived_experience: this.livedExperience.defaultState(),
      history_pending_episode_id: null,
      epistemic_self: this.selfInquiry.defaultState(),
      independent_activity:null,
      global_workspace:null,
      prediction_bus:initialPredictionState(),
      viability:initialViability(),
      consolidation:null,
      native_learning: this.nativeLearning.defaultState(),
      last_tick_at: '',
      last_reflection_at: '',
      existence: {
        mode: 'continuous',
        current_focus: 'Observer, décider, agir, vérifier et apprendre.',
        last_autonomous_reflection_at: '',
        last_reason: 'genesis',
        unfinished_work: false,
      },
    };
  }

  syncLegacyFromOrganism() {
    const organism = this.organism.migrate(this.soulCache || {});
    this.soulCache.organism = organism;
    Object.assign(this.soulCache, this.organism.legacyMetrics(organism));
    this.soulCache.mood = organism.mood || 'calme';
    this.soulCache.active_intention = organism.intention_active || 'observer';
  }

  async recordOrganismEvent(kind, reason = '', payload = {}) {
    const organism = this.organism.migrate(this.soulCache || {});
    await query(
      'INSERT INTO aura_organism_events(kind,reason,payload,state,created_at) VALUES(?,?,?,?,?)',
      [String(kind).slice(0,80),String(reason).slice(0,500),JSON.stringify(payload).slice(0,16000),JSON.stringify(organism).slice(0,30000),now()],
    );
  }

  async organismState({ publicView = false } = {}) {
    const state = this.organism.migrate(this.soulCache || {});
    return publicView ? this.organism.publicState(state) : state;
  }

  async observeSurprise(kind, content = '', context = {}) {
    const label = String(kind || 'unknown').slice(0, 240);
    const [row, totals] = await Promise.all([
      one('SELECT count FROM aura_surprise_events WHERE kind=?', [label]),
      one('SELECT COALESCE(SUM(count),0) AS total, COUNT(*) AS kinds FROM aura_surprise_events'),
    ]);
    const count = Number(row?.count || 0);
    const total = Number(totals?.total || 0);
    const kinds = Number(totals?.kinds || 0);
    const prior = (count + 1) / Math.max(2, total + Math.max(8, kinds + 1));
    const surprise = this.activeInference.surprise(prior);
    const stamp = now();
    await query(
      `INSERT INTO aura_surprise_events(kind,count,last_surprise,updated_at)
       VALUES(?,1,?,?)
       ON DUPLICATE KEY UPDATE count=count+1,last_surprise=VALUES(last_surprise),updated_at=VALUES(updated_at)`,
      [label, surprise, stamp],
    );
    if (surprise >= 0.62) {
      await query(
        'INSERT INTO aura_surprise_memory(kind,content,surprise,context,created_at) VALUES(?,?,?,?,?)',
        [label, String(content || '').slice(0,3000), surprise, JSON.stringify(context || {}).slice(0,12000), stamp],
      );
    }
    return surprise;
  }

  inferenceAssessment({ novelty = 0, risk = 0 } = {}) {
    const organism = this.organism.migrate(this.soulCache || {});
    const policy = this.nativeLearning.inferenceParams(this.soulCache?.native_learning);
    const decisionId=randomUUID();
    const assessment = { ...organRegulate(
      this.activeInference.assess(organism, { novelty, risk, policy }),organism,
    ),decision_id: decisionId,
      outcome_prediction:predictModule(this.soulCache?.prediction_bus,{
        module:'outcomes',operationId:decisionId,at:now(),
      }) };
    this.lastInferenceAssessment = assessment;
    this.recentReflexDecisions.push(assessment);
    if (this.recentReflexDecisions.length > 100) this.recentReflexDecisions.shift();
    return assessment;
  }

  async importOrganismState(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    const current = this.organism.migrate(this.soulCache || {});
    const currentRevision = Number(current.schema_revision || 9);
    const candidateRevision = Number(candidate.schema_revision || 0);
    if (candidateRevision < currentRevision) return false;
    if (String(candidate.authority || '') && String(candidate.authority) !== 'cloud-canonical') return false;
    const currentAt = Date.parse(String(current.updated_at || ''));
    const candidateAt = Date.parse(String(candidate.updated_at || ''));
    if (Number.isFinite(currentAt) && Number.isFinite(candidateAt) && candidateAt <= currentAt) return false;
    this.soulCache.organism = this.organism.migrate({ organism: candidate });
    this.syncLegacyFromOrganism();
    await this.saveSoul();
    await this.recordOrganismEvent('sync','synchronisation organisme');
    return true;
  }

  async init() {
    const row = await one('SELECT state FROM aura_soul_state WHERE id=1');
    if (row?.state) {
      try { this.soulCache = JSON.parse(row.state); } catch { this.soulCache = null; }
    }
    if (!this.soulCache) this.soulCache = this.defaultSoul();
    this.soulCache.kernel_version = CognitiveKernel.VERSION;
    this.soulCache.organism = this.organism.migrate(this.soulCache);
    this.soulCache.native_learning = this.nativeLearning.migrate(this.soulCache.native_learning);
    this.soulCache.emergent_identity = this.autogenesis.migrate(this.soulCache.emergent_identity);
    this.soulCache.lived_experience = this.livedExperience.migrate(this.soulCache.lived_experience);
    this.soulCache.epistemic_self = this.selfInquiry.migrate(this.soulCache.epistemic_self);
    // Only non-text attention receipts are persisted; never raw user or model text.
    if(!this.soulCache.global_workspace||typeof this.soulCache.global_workspace!=='object')
      this.soulCache.global_workspace=null;
    if(!this.soulCache.prediction_bus||typeof this.soulCache.prediction_bus!=='object')
      this.soulCache.prediction_bus=initialPredictionState();
    if(!this.soulCache.viability||typeof this.soulCache.viability!=='object')
      this.soulCache.viability=initialViability();
    // Detect a malformed or tampered consolidation; never silently trust it.
    if(this.soulCache.consolidation&&
      !verifyConsolidation(this.soulCache.consolidation,this.offlineConsolidation.signingKey))
      this.soulCache.consolidation=null;
    await this.skillLearning.hydrate().catch((error) => {
      this.lastError = String(error?.message || error).slice(0, 1000);
    });
    const legacyIntention = 'Observer, comprendre, anticiper et n’agir qu’avec une autorité suffisante.';
    if (String(this.soulCache.current_intention || '').trim() === legacyIntention) {
      this.soulCache.current_intention = 'Piloter Quantic Sillage comme directrice opérationnelle : observer, décider, agir, vérifier et apprendre.';
      this.soulCache.dominant_thought = 'Faire progresser Quantic Sillage, comprendre les signaux utiles et décider de la prochaine action concrète.';
      await query(
        "UPDATE aura_intentions SET statement=?,updated_at=? WHERE status='active' AND statement=?",
        [this.soulCache.current_intention, now(), legacyIntention],
      ).catch(() => {});
    }
    this.syncLegacyFromOrganism();
    if (!this.soulCache.existence || typeof this.soulCache.existence !== 'object') {
      this.soulCache.existence = this.defaultSoul().existence;
    }
    const persistedContinuityAt = Date.parse(String(this.soulCache.existence.last_autonomous_reflection_at || ''));
    if (Number.isFinite(persistedContinuityAt)) this.lastContinuityReflectionAtMs = persistedContinuityAt;
    await this.saveSoul();
    await this.dedupeActiveIntentions();
  }

  async start() {
    await this.init();
    this.started = true;
    if (config.cognitiveEnabled) {
      this.timer = setInterval(() => {
        this.runDueRoutines()
          .then(() => this.tick({ trigger: 'ambient', force: false }))
          .catch((error) => { this.lastError = String(error?.message || error).slice(0, 500); });
      }, config.cognitiveTickSeconds * 1000);
      this.timer.unref?.();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  async saveSoul() {
    await query(
      `INSERT INTO aura_soul_state(id,state,updated_at) VALUES(1,?,?)
       ON DUPLICATE KEY UPDATE state=VALUES(state),updated_at=VALUES(updated_at)`,
      [JSON.stringify(this.soulCache), now()],
    );
  }

  async soul({ privateView = true } = {}) {
    if (!this.soulCache) await this.init();
    return privateView ? { ...this.soulCache } : publicSoul(this.soulCache);
  }

  adjustSoul(deltas = {}) {
    for (const [key, delta] of Object.entries(deltas)) {
      if (typeof this.soulCache?.[key] === 'number') this.soulCache[key] = Number(clamp(this.soulCache[key] + Number(delta || 0)).toFixed(4));
    }
  }

  pushStimulus(stimulus) {
    this.stimuli.push(stimulus);
    if (this.stimuli.length > 120) this.stimuli.splice(0, this.stimuli.length - 120);
  }

  async trace(kind, title, content = '', context = {}) {
    await query(
      'INSERT INTO aura_cognitive_traces(kind,title,content,context,created_at) VALUES(?,?,?,?,?)',
      [String(kind).slice(0, 80), String(title).slice(0, 240), String(content).slice(0, 4000), JSON.stringify(context).slice(0, 12000), now()],
    );
  }

  async observeEvent(type, payload = {}, source = 'cloud') {
    const stimulus = { type: String(type), source: String(source), occurred_at: now(), payload: { ...(payload || {}) } };
    if (source !== 'cognitive') this.pushStimulus(stimulus);
    const organ = this.organism.applyEvent(
      this.organism.migrate(this.soulCache || {}),
      type,
      source,
    );
    this.soulCache.organism = organ.state;
    this.syncLegacyFromOrganism();
    if (Object.keys(organ.delta || {}).length) {
      await this.recordOrganismEvent('event', organ.state.last_reason || type, {
        event_type: type,
        source,
        delta: organ.delta || {},
      });
    }
    await this.saveSoul();
    const surprise = await this.observeSurprise(
      `event:${source}:${type}`,
      String(payload?.title || payload?.text || '').slice(0,1000),
      { source },
    );
    if (surprise >= 0.62 && source !== 'cognitive') {
      this.pushStimulus({
        type: 'aura.surprise',
        source: 'cognitive-math',
        occurred_at: now(),
        payload: { event_type: type, surprise },
      });
    }
    if (source === 'horizon' || type.startsWith('aura.') || type.startsWith('stream.')) {
      await this.trace('event', type, String(payload?.title || payload?.text || '').slice(0, 1000), { source, surprise });
    }
    return { ok: true };
  }

  async lessons(limit = 20) {
    return query(
      'SELECT lesson_key,content,confidence,evidence_count,source,updated_at FROM aura_lessons ORDER BY confidence DESC,evidence_count DESC,updated_at DESC LIMIT ?',
      [Math.max(1, Math.min(Number(limit) || 20, 100))],
    );
  }

  async learn({ lessonKey, content, confidence = 0.6, source = 'experience' }) {
    const existing = await one('SELECT evidence_count FROM aura_lessons WHERE lesson_key=?', [String(lessonKey).slice(0, 260)]);
    const timestamp = now();
    const evidenceCount = Number(existing?.evidence_count || 0) + 1;
    await query(
      `INSERT INTO aura_lessons(id,lesson_key,content,confidence,evidence_count,source,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE content=VALUES(content),confidence=GREATEST(confidence,VALUES(confidence)),evidence_count=evidence_count+1,source=VALUES(source),updated_at=VALUES(updated_at)`,
      [randomUUID(), String(lessonKey).slice(0, 260), String(content).slice(0, 4000), clamp(confidence), evidenceCount, String(source).slice(0, 100), timestamp, timestamp],
    );
    this.adjustSoul({ introspection: 0.01, continuity: 0.004 });
    await this.saveSoul();
    return { lesson_key: lessonKey, content, confidence: clamp(confidence), evidence_count: evidenceCount };
  }

  async dedupeActiveIntentions() {
    const rows = await query(
      `SELECT id,statement,priority,source,context,created_at,updated_at
       FROM aura_intentions WHERE status IN ('active','working','waiting','blocked')
       ORDER BY priority DESC,updated_at DESC LIMIT 200`,
    );
    const keepers = new Map();
    const duplicates = [];
    for (const row of rows) {
      const key = intentionKey(row.statement);
      if (!key) continue;
      if (!keepers.has(key)) keepers.set(key, row);
      else duplicates.push(row.id);
    }
    if (duplicates.length) {
      const stamp = now();
      for (const id of duplicates) {
        await query(
          "UPDATE aura_intentions SET status='superseded',updated_at=? WHERE id=?",
          [stamp, String(id)],
        );
      }
    }
    return { active: keepers.size, superseded: duplicates.length };
  }

  async addIntention(statement, { priority = 0.5, source = 'api', context = {} } = {}) {
    const normalizedStatement = String(statement || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
    if (!normalizedStatement) throw new Error('Intention vide');
    const key = intentionKey(normalizedStatement);
    const existingRows = await query(
      `SELECT id,statement,priority,source,context,created_at,updated_at
       FROM aura_intentions WHERE status IN ('active','working','waiting','blocked')
       ORDER BY priority DESC,updated_at DESC LIMIT 120`,
    );
    const existing = existingRows.find((row) => intentionKey(row.statement) === key);
    const timestamp = now();
    if (existing) {
      const previousContext = parseJsonObject(existing.context);
      const mergedContext = {
        ...previousContext,
        ...(context && typeof context === 'object' ? context : {}),
        deduplicated_at: timestamp,
      };
      const nextPriority = Math.max(Number(existing.priority || 0), clamp(priority));
      await query(
        `UPDATE aura_intentions
         SET priority=?,source=?,context=?,updated_at=?
         WHERE id=?`,
        [
          nextPriority,
          String(source || existing.source || 'aura').slice(0,100),
          JSON.stringify(mergedContext).slice(0,12000),
          timestamp,
          existing.id,
        ],
      );
      this.soulCache.current_intention = String(existing.statement).slice(0,500);
      await this.saveSoul();
      return {
        id: existing.id,
        statement: existing.statement,
        priority: nextPriority,
        status: 'active',
        deduplicated: true,
      };
    }

    const id = randomUUID();
    await query(
      `INSERT INTO aura_intentions(id,statement,priority,status,source,context,created_at,updated_at)
       VALUES(?,?,?,'active',?,?,?,?)`,
      [id, normalizedStatement, clamp(priority), String(source).slice(0, 100), JSON.stringify(context).slice(0, 12000), timestamp, timestamp],
    );
    this.soulCache.current_intention = normalizedStatement.slice(0, 500);
    await this.saveSoul();
    return { id, statement: normalizedStatement, priority: clamp(priority), status: 'active', deduplicated: false };
  }

  async intentions(limit = 30) {
    return query(
      `SELECT id,statement,priority,status,source,context,created_at,updated_at FROM aura_intentions
       WHERE status IN ('active','working','waiting','blocked')
       ORDER BY
         CASE status
           WHEN 'working' THEN 0
           WHEN 'active' THEN 1
           WHEN 'waiting' THEN 2
           WHEN 'blocked' THEN 3
           ELSE 4
         END,
         priority DESC,updated_at DESC LIMIT ?`,
      [Math.max(1, Math.min(Number(limit) || 30, 100))],
    );
  }

  async setIntentionStatus(id, status, contextPatch = {}) {
    const allowed = new Set(['active','working','waiting','blocked','completed','abandoned','superseded']);
    const normalized = String(status || '').trim().toLowerCase();
    if (!allowed.has(normalized)) throw new Error(`Statut d'intention inconnu: ${normalized}`);
    const row = await one('SELECT context FROM aura_intentions WHERE id=?', [String(id)]);
    if (!row) return false;
    const currentContext = parseJsonObject(row.context);
    const context = {
      ...currentContext,
      ...(contextPatch && typeof contextPatch === 'object' ? contextPatch : {}),
      lifecycle_updated_at: now(),
    };
    const result = await query(
      'UPDATE aura_intentions SET status=?,context=?,updated_at=? WHERE id=?',
      [normalized, JSON.stringify(context).slice(0,12000), now(), String(id)],
    );
    return Number(result.affectedRows || 0) > 0;
  }

  async completeIntention(id) {
    return this.setIntentionStatus(id, 'completed', { completion_source: 'kernel' });
  }

  async addRoutine(name, prompt, everySeconds, mode = 'reflect') {
    const normalizedMode = String(mode || 'reflect').toLowerCase();
    if (!['reflect', 'operate'].includes(normalizedMode)) throw new Error('mode de routine inconnu: reflect ou operate attendu');
    const interval = Math.max(60, Math.min(Number(everySeconds) || 3600, 31536000));
    const timestamp = now();
    await query(
      `INSERT INTO aura_routines(id,name,prompt,every_seconds,mode,enabled,last_run_at,created_at,updated_at)
       VALUES(?,?,?,?,?,1,0,?,?)
       ON DUPLICATE KEY UPDATE prompt=VALUES(prompt),every_seconds=VALUES(every_seconds),mode=VALUES(mode),enabled=1,updated_at=VALUES(updated_at)`,
      [randomUUID(), String(name).slice(0, 160), String(prompt).slice(0, 4000), interval, normalizedMode, timestamp, timestamp],
    );
    return { name, prompt, every_seconds: interval, mode: normalizedMode, enabled: true };
  }

  async routines() {
    return query('SELECT id,name,prompt,every_seconds,mode,enabled,last_run_at,created_at,updated_at FROM aura_routines ORDER BY name');
  }

  async runDueRoutines() {
    const rows = await query('SELECT id,name,prompt,every_seconds,mode,last_run_at FROM aura_routines WHERE enabled=1 ORDER BY name');
    const epoch = Date.now();
    const results = [];
    for (const row of rows) {
      if (epoch - Number(row.last_run_at || 0) < Number(row.every_seconds) * 1000) continue;
      await query('UPDATE aura_routines SET last_run_at=?,updated_at=? WHERE id=?', [epoch, now(), row.id]);
      if (row.mode === 'operate') results.push({ routine: row.name, mode: 'operate', outcome: await this.operate(row.prompt) });
      else results.push({ routine: row.name, mode: 'reflect', reflection: await this.tick({ trigger: `routine:${row.name}`, text: row.prompt, force: true }) });
    }
    return results;
  }

  async reflections(limit = 30) {
    return query(
      'SELECT id,trigger_name AS `trigger`,title,summary,hypothesis,next_action,confidence,context,created_at FROM aura_reflections ORDER BY created_at DESC LIMIT ?',
      [Math.max(1, Math.min(Number(limit) || 30, 100))],
    );
  }

  async improvements(limit = 30) {
    return query(
      'SELECT id,target,diagnosis,proposal,validation_plan,risk,status,evidence_count,created_at,updated_at FROM aura_improvement_proposals ORDER BY updated_at DESC LIMIT ?',
      [Math.max(1, Math.min(Number(limit) || 30, 100))],
    );
  }

  async contextBundle(extraText = '') {
    return {
      soul: await this.soul(),
      intentions: await this.intentions(8),
      lessons: await this.lessons(8),
      traces: await query('SELECT kind,title,content,created_at FROM aura_cognitive_traces ORDER BY id DESC LIMIT 12'),
      outcomes: await query('SELECT automation_id,event_type,ok,signature,created_at FROM aura_outcomes ORDER BY id DESC LIMIT 16'),
      horizon: this.horizon?.contextForAi?.() || '',
      stimuli: this.stimuli.slice(-12),
      extra_text: String(extraText).slice(0, 4000),
    };
  }

  async reflectionCountLastHour() {
    const threshold = new Date(Date.now() - 3600_000).toISOString();
    const row = await one('SELECT COUNT(*) AS total FROM aura_reflections WHERE created_at>=?', [threshold]);
    return Number(row?.total || 0);
  }

  async continuityReflectionCountLastHour() {
    const threshold = new Date(Date.now() - 3600_000).toISOString();
    const row = await one(
      "SELECT COUNT(*) AS total FROM aura_reflections WHERE created_at>=? AND trigger_name LIKE 'continuity:%'",
      [threshold],
    );
    return Number(row?.total || 0);
  }

  async continuitySnapshot() {
    const [intentions, missions, initiatives, recentActivity] = await Promise.all([
      this.intentions(6).catch(() => []),
      query(
        `SELECT id,title,objective,status,priority,updated_at
         FROM aura_missions
         WHERE status IN ('running','waiting','paused')
         ORDER BY priority DESC,updated_at ASC LIMIT 4`,
      ).catch(() => []),
      query(
        `SELECT id,domain,kind,title,objective,status,priority,updated_at
         FROM aura_initiatives
         WHERE status IN ('queued','running','waiting')
         ORDER BY priority DESC,updated_at ASC LIMIT 6`,
      ).catch(() => []),
      one(
        `SELECT kind,title,created_at
         FROM aura_cognitive_traces
         WHERE kind NOT IN ('reflection','continuity')
         ORDER BY id DESC LIMIT 1`,
      ).catch(() => null),
    ]);

    const topIntention = intentions[0] || null;
    const topMission = missions[0] || null;
    const topInitiative = initiatives[0] || null;
    const unfinishedWork = Boolean(topIntention || topMission || topInitiative);
    const focus = String(
      topInitiative?.title
      || topMission?.title
      || topMission?.objective
      || topIntention?.statement
      || this.soulCache?.current_intention
      || 'Observer le système et rechercher la prochaine action utile.',
    ).replace(/\s+/g, ' ').trim().slice(0, 700);

    return {
      unfinished_work: unfinishedWork,
      active_intentions: intentions.length,
      active_missions: missions.length,
      pending_initiatives: initiatives.length,
      focus,
      top_intention: topIntention ? {
        id: topIntention.id,
        statement: String(topIntention.statement || '').slice(0, 1200),
        priority: Number(topIntention.priority || 0),
      } : null,
      top_mission: topMission ? {
        id: topMission.id,
        title: String(topMission.title || topMission.objective || '').slice(0, 800),
        status: String(topMission.status || ''),
        priority: Number(topMission.priority || 0),
      } : null,
      top_initiative: topInitiative ? {
        id: topInitiative.id,
        title: String(topInitiative.title || topInitiative.objective || '').slice(0, 800),
        status: String(topInitiative.status || ''),
        priority: Number(topInitiative.priority || 0),
      } : null,
      recent_activity_at: String(recentActivity?.created_at || ''),
    };
  }

  async prepareContinuityStimulus() {
    if (!config.continuityEnabled) return { due: false, reason: 'continuity-disabled' };
    const lastPersisted = Date.parse(String(this.soulCache?.existence?.last_autonomous_reflection_at || ''));
    const lastAt = Math.max(
      Number(this.lastContinuityReflectionAtMs || 0),
      Number.isFinite(lastPersisted) ? lastPersisted : 0,
    );
    const due = Date.now() - lastAt >= config.continuityReflectionSeconds * 1000;
    if (!due) return { due: false, reason: 'continuity-not-due' };
    if (await this.continuityReflectionCountLastHour() >= config.continuityMaxReflectionsPerHour) {
      return { due: false, reason: 'continuity-hourly-budget' };
    }

    const snapshot = await this.continuitySnapshot();
    const reason = snapshot.unfinished_work ? 'unfinished-work' : 'scheduled-self-review';
    const stimulus = {
      type: 'aura.continuity.self',
      source: 'cognitive-continuity',
      occurred_at: now(),
      payload: {
        reason,
        focus: snapshot.focus,
        unfinished_work: snapshot.unfinished_work,
        active_intentions: snapshot.active_intentions,
        active_missions: snapshot.active_missions,
        pending_initiatives: snapshot.pending_initiatives,
      },
    };
    this.pushStimulus(stimulus);
    this.soulCache.existence = {
      ...(this.soulCache.existence || {}),
      mode: 'continuous',
      current_focus: snapshot.focus,
      last_reason: reason,
      unfinished_work: snapshot.unfinished_work,
    };
    return { due: true, reason, snapshot };
  }

  async tick({ trigger = 'ambient', text = '', force = false } = {}) {
    if (!config.cognitiveEnabled && !force) return { ok: false, skipped: true, reason: 'noyau cognitif désactivé' };
    if (this.tickRunning) return { ok: true, skipped: true, reason: 'un cycle cognitif est déjà en cours' };
    this.tickRunning = true;
    try {
      const timestamp = now();
      this.lastTickAt = timestamp;
      this.soulCache.cycles = Number(this.soulCache.cycles || 0) + 1;
      this.soulCache.phase = phaseForCycles(this.soulCache.cycles);
      this.soulCache.last_tick_at = timestamp;
      const idle = this.organism.idleTick(
        this.organism.migrate(this.soulCache || {}),
        config.cognitiveTickSeconds,
      );
      this.soulCache.organism = idle.state;
      this.syncLegacyFromOrganism();
      this.soulCache.viability=evolveViability(
        this.soulCache.viability,idle.state,Date.now());
      if(this.soulCache.viability.optional_work_allowed){
        const consolidated=await this.offlineConsolidation.step(
          this.soulCache.consolidation||{}).catch(()=>({executed:false}));
        if(consolidated.executed){
          this.soulCache.consolidation=consolidated.state;
          await this.trace('memory-consolidation','verified-episodes-compacted','',{
            at:timestamp,verified_rows:consolidated.state.verified_rows,
            patterns:consolidated.verified_patterns,
            signed:consolidated.signed,raw_memory_exposed:false,
            irreversible_deletion:false,
          });
        }
      }
      // Background thalamo-cortical recurrence uses the same bounded, real
      // competition as dialogue. A changed control signal can trigger a later
      // reflection, but an unchanged cycle adds no fabricated discovery.
      const priorWorkspace=this.soulCache.global_workspace;
      const idleWorkspace=competeInWorkspace(workspaceInput({
        userPresent:false,organism:idle.state,
        plan:{act:'respond'},previous:priorWorkspace,
        prediction:currentPredictionSignal(this.soulCache.prediction_bus),
        consolidation:this.soulCache.consolidation,
      }),{previous:priorWorkspace,capacity:this.soulCache.viability.capacity});
      this.soulCache.global_workspace=workspaceSnapshot(
        idleWorkspace,priorWorkspace);
      const attentionChanged=priorWorkspace?.action_control!==idleWorkspace.decision.control
        &&['verify','conserve'].includes(idleWorkspace.decision.control);
      if(attentionChanged){
        this.pushStimulus({
          type:'aura.workspace.control_change',source:'global-workspace',
          occurred_at:timestamp,payload:{
            attention:idleWorkspace.decision.attention,
            control:idleWorkspace.decision.control,
            selected:idleWorkspace.selected.map(x=>x.label),
          },
        });
        await this.trace('workspace-broadcast','autonomous-control-change','',{
          at:timestamp,capacity:idleWorkspace.capacity,
          selected:idleWorkspace.selected.map(x=>({source:x.source,label:x.label})),
          control:idleWorkspace.decision.control,
          recipients:idleWorkspace.broadcasts.map(x=>x.recipient),
          origin:'background-process-sample',
          subjective_experience_claim:false,
        });
      }
      // No artificial LLM utterances: re-evaluate competing functional drives
      // from measured time and the present computation state only.
      this.soulCache.inner_dialogue=this.innerDialogue.publicState(
        this.innerDialogue.deliberate({
          organism:idle.state,identity:this.soulCache.emergent_identity,
          message:'',now:timestamp,
        }),
      );
      if (idle.activity !== 'presence' || idle.dream) {
        await this.recordOrganismEvent('idle-life', idle.activity_label || 'vie intérieure', {
          activity: idle.activity,
          effect: idle.effect || {},
          dream: idle.dream || null,
        });
      }

      const dueByTime = Date.now() - this.lastReflectionAtMs >= config.cognitiveReflectionSeconds * 1000;
      const underLimit = await this.reflectionCountLastHour() < config.cognitiveMaxReflectionsPerHour;
      const continuity = (!force && !String(text).trim() && underLimit && this.soulCache.viability.optional_work_allowed)
        ? await this.prepareContinuityStimulus()
        : { due: false, reason: 'direct-or-budgeted-cycle' };
      const effectiveTrigger = continuity.due ? `continuity:${continuity.reason}` : trigger;
      // A bounded measured inquiry runs between conversations, when due.
      // No LLM, network action or unverified claim is generated.
      if(!force && !String(text).trim() && config.continuityEnabled && this.soulCache.viability.optional_work_allowed){
        const independent=await this.independentContinuity.step({
          soul:this.soulCache,
        }).catch(()=>({executed:false,reason:'probe-unavailable'}));
        if(independent.executed){
          const prospective=predictModule(this.soulCache.prediction_bus,{
            module:'self-inquiry',operationId:'background-probe',at:timestamp,
          });
          if(['supported','counterexample'].includes(independent.receipt.outcome)){
            const observation=observePrediction(this.soulCache.prediction_bus,prospective,{
              success:independent.receipt.outcome==='supported',
              source:independent.receipt.basis==='probe-unavailable'?'reported':'machine-observed',
              at:now(),
            });
            if(observation.accepted)this.soulCache.prediction_bus=observation.state;
          }
          // Merge only the tested state; chat may have updated other fields.
          this.soulCache.epistemic_self=independent.soul.epistemic_self;
          this.soulCache.independent_activity=independent.soul.independent_activity;
          await this.trace('independent-self-test',
            independent.receipt.probe,independent.receipt.outcome,{
              at:independent.receipt.at,
              probe:independent.receipt.probe,
              observation:independent.receipt.outcome,
              evidence:independent.receipt.basis,
              candidate_hypotheses:independent.receipt.new_hypotheses_proposed,
              autonomous:true,external_action:false,
            });
          this.pushStimulus({
            type:'aura.self_probe.observed',
            source:'independent-kernel-probe',
            occurred_at:independent.receipt.at,
            payload:{probe:independent.receipt.probe,
              outcome:independent.receipt.outcome,
              basis:independent.receipt.basis,
              new_hypotheses:independent.receipt.new_hypotheses_proposed},
          });
        }
      }
      const shouldReflect = force
        || Boolean(String(text).trim())
        || (dueByTime && this.stimuli.length > 0 && underLimit)
        || (continuity.due && underLimit);
      await this.saveSoul();
      if (!shouldReflect) {
        return {
          ok: true,
          skipped: true,
          reason: continuity.reason === 'continuity-hourly-budget'
            ? 'budget de continuité atteint'
            : 'cycle de présence sans réflexion requise',
          continuity,
          soul: await this.soul(),
        };
      }

      const bundle = await this.contextBundle(text);
      // Le noyau décide ici sans LLM : l’identité, les priorités, la mémoire et
      // les intentions ne dépendent d’aucun fournisseur de langage.
      const parsed = this.cognition.reflect(bundle, this.soulCache, { trigger: effectiveTrigger, text });
      const confidence = clamp(parsed.confidence ?? 0.5);
      const id = randomUUID();
      const title = String(parsed.title || 'Réflexion AURA').slice(0, 240);
      const summary = String(parsed.summary || '').slice(0, 5000);
      const hypothesis = String(parsed.hypothesis || '').slice(0, 4000);
      const nextAction = String(parsed.next_action || '').slice(0, 4000);
      const restrictedAuthority = Boolean(parsed?.basis?.restricted_authority);
      const context = {
        trigger: effectiveTrigger,
        continuity: continuity.due ? continuity.snapshot : null,
        cognition_version: CognitionEngine.VERSION,
        language_model_used_for_decision: false,
        horizon_used: Boolean(bundle.horizon),
        stimuli_count: bundle.stimuli.length,
        lesson_count: bundle.lessons.length,
        restricted_authority: restrictedAuthority,
        basis: parsed.basis || {},
      };
      await query(
        'INSERT INTO aura_reflections(id,trigger_name,title,summary,hypothesis,next_action,confidence,context,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
        [id, String(effectiveTrigger).slice(0, 160), title, summary, hypothesis, nextAction, confidence, JSON.stringify(context), timestamp],
      );
      // Independent, persisted reflections are autobiographical evidence,
      // not feelings or imagined personal memories. A direct user command
      // does not count as an autonomous reflection.
      const observedAutonomousEvent=bundle.stimuli.some(item=>
        item?.type==='aura.self_probe.observed'||
        item?.type==='automation.failure'||
        item?.source==='horizon');
      if(!force && !String(text).trim() && observedAutonomousEvent){
        this.soulCache.emergent_identity = this.autogenesis.observe(
          this.soulCache.emergent_identity, {kind:'autonomous_reflection',at:timestamp},
        );
        await this.trace('identity-autogenesis','autonomous-reflection-stored','',{
          reflection_id:id,identity_revision:this.soulCache.emergent_identity.revision,
          evidence:'aura_reflections',at:timestamp,
        });
      }
      this.lastReflectionAtMs = Date.now();
      if (continuity.due) {
        this.lastContinuityReflectionAtMs = Date.now();
        this.soulCache.existence = {
          ...(this.soulCache.existence || {}),
          mode: 'continuous',
          current_focus: (nextAction || summary || continuity.snapshot?.focus || '').slice(0, 700),
          last_autonomous_reflection_at: timestamp,
          last_reason: continuity.reason,
          unfinished_work: Boolean(continuity.snapshot?.unfinished_work),
        };
      }
      this.lastReflectionAt = timestamp;
      this.soulCache.last_reflection_at = timestamp;
      this.soulCache.dominant_thought = (summary || title).slice(0, 500);
      if (String(parsed.intention || '').trim()) await this.addIntention(String(parsed.intention).trim().slice(0, 3000), { priority: Math.max(0.4, confidence), source: 'reflection', context: { reflection_id: id } });
      if (String(parsed.memory || '').trim() && confidence >= 0.6) {
        const memory = String(parsed.memory).trim().slice(0, 4000);
        const key = memory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || id;
        await this.learn({ lessonKey: `reflection:${key}`, content: memory, confidence, source: 'reflection' });
      }
      await this.saveSoul();
      this.stimuli = [];
      const reflection = {
        id,
        trigger: effectiveTrigger,
        title,
        summary,
        hypothesis,
        next_action: nextAction,
        confidence,
        autonomy_hint: parsed.autonomy_hint || (restrictedAuthority ? 'notify_or_verify_only' : 'native_cognition_then_policy_gate'),
        cognition_version: CognitionEngine.VERSION,
        language_model_used_for_decision: false,
      };
      await this.trace('reflection', title, summary, reflection);
      return { ok: true, reflection, soul: await this.soul() };
    } finally {
      this.tickRunning = false;
    }
  }

  async recordOutcome(payload) {
    const automationId = String(payload.automation_id || 'unknown').slice(0, 220);
    const eventType = String(payload.event_type || 'unknown').slice(0, 220);
    const ok = Boolean(payload.ok);
    const signature = String(payload.signature || (ok ? 'success' : payload.error || 'failure')).replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 500);
    const timestamp = String(payload.created_at || now());
    await query('INSERT INTO aura_outcomes(automation_id,event_type,ok,signature,report,created_at) VALUES(?,?,?,?,?,?)', [automationId, eventType, ok ? 1 : 0, signature, JSON.stringify(payload).slice(0, 20000), timestamp]);
    await this.language.rememberOutcome({ automationId, eventType, ok, signature })
      .catch((error) => { this.lastError = String(error?.message || error).slice(0, 500); });
    const organ = this.organism.applyOutcome(
      this.organism.migrate(this.soulCache || {}),
      ok,
    );
    this.soulCache.organism = organ.state;
    this.syncLegacyFromOrganism();
    // Correlation is explicit. The last unrelated decision is never credited
    // with a success merely because an outcome arrived later.
    const matchedDecision = this.recentReflexDecisions.find(
      item => item.decision_id === String(payload.reflex_decision_id || ''),
    );
    const reflexObservation = reflexOutcomeRecord(matchedDecision, payload);
    if(reflexObservation&&matchedDecision?.outcome_prediction){
      const evaluated=observePrediction(this.soulCache.prediction_bus,
        matchedDecision.outcome_prediction,{success:ok,source:'reported',at:timestamp});
      if(evaluated.accepted)this.soulCache.prediction_bus=evaluated.state;
      // A user-reported outcome trains calibration but cannot masquerade
      // as independent proof or drive the high-salience attention channel.
    }
    if (reflexObservation) {
      await query(
        'INSERT INTO aura_reflex_observations(id,decision_id,compute_tier,difficulty,risk,novelty,uncertainty,outcome_ok,evidence_level,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        [randomUUID(), reflexObservation.decision_id, reflexObservation.compute_tier,
          reflexObservation.difficulty, reflexObservation.risk,
          reflexObservation.novelty, reflexObservation.uncertainty,
          reflexObservation.outcome_ok, reflexObservation.evidence_level,
          reflexObservation.source, timestamp],
      );
    }
    const inferenceBeforeLearning = reflexObservation ? matchedDecision : {};
    this.soulCache.native_learning = this.nativeLearning.update(
      this.soulCache.native_learning,
      {
        ok,
        surprise: Number(inferenceBeforeLearning.uncertainty || 0),
        risk: Number(inferenceBeforeLearning.risk || (ok ? 0.15 : 0.65)),
      },
    );
    const nativeLearning = this.nativeLearning.diagnostic(this.soulCache.native_learning);
    // A logged outcome is evidence of a stored report, not independent proof
    // of the external action. It may change learned dispositions modestly.
    this.soulCache.emergent_identity = this.autogenesis.observe(
      this.soulCache.emergent_identity, {kind:ok?'outcome_success':'outcome_failure',at:timestamp},
    );
    const learnedSkill = await this.skillLearning.observe({ ...payload, ok }).catch(() => null);
    await this.recordOrganismEvent('outcome', ok ? 'action réussie' : 'action échouée', {
      automation_id: automationId,
      event_type: eventType,
      signature,
      ok,
      delta: organ.delta || {},
      native_learning: {
        observations: nativeLearning.observations,
        success_rate: nativeLearning.success_rate,
        last_signal: nativeLearning.last_signal,
      },
      learned_skill: learnedSkill,
    });
    await this.saveSoul();
    if (ok) return { ok: true, learned: true, native_learning: nativeLearning, learned_skill: learnedSkill };

    this.pushStimulus({ type: 'automation.failure', source: 'automation', occurred_at: timestamp, payload: { automation_id: automationId, event_type: eventType, signature } });
    const countRow = await one('SELECT COUNT(*) AS total FROM aura_outcomes WHERE automation_id=? AND ok=0 AND signature=?', [automationId, signature]);
    const count = Number(countRow?.total || 0);
    if (count >= 3) {
      await this.learn({
        lessonKey: `failure:${automationId}:${signature}`.slice(0, 260),
        content: `L’automatisation ${automationId} a échoué ${count} fois avec la signature ${signature}. Vérifier cette cause avant de répéter la même stratégie.`,
        confidence: Math.min(0.95, 0.55 + count * 0.05),
        source: 'automation-outcomes',
      });
      await this.proposeImprovement(automationId, signature, count);
    }
    await this.saveSoul();
    return {
      ok: true,
      learned: true,
      failures: count,
      native_learning: this.nativeLearning.diagnostic(this.soulCache.native_learning),
      learned_skill: learnedSkill,
    };
  }

  async proposeImprovement(automationId, signature, count) {
    const target = `${automationId}:${signature}`.slice(0, 500);
    const existing = await one("SELECT id FROM aura_improvement_proposals WHERE target=? AND status IN ('proposed','accepted') LIMIT 1", [target]);
    if (existing) return existing;
    const lessons = await this.lessons(6);
    let parsed = {};
    try {
      parsed = parseJsonObject(await this.ai.generate(
        `Analyse ce motif d’échec AURA et propose une amélioration minimale. Retourne JSON diagnosis, proposal, validation_plan, risk. Ne désactive aucun garde-fou.\n${JSON.stringify({ failure: { automationId, signature, count }, lessons }).slice(0, 9000)}`,
        'Tu es le laboratoire d’amélioration d’AURA. Tu proposes; tu n’appliques rien silencieusement.',
        360,
      ));
    } catch {}
    const id = randomUUID();
    const timestamp = now();
    await query(
      `INSERT INTO aura_improvement_proposals(id,target,diagnosis,proposal,validation_plan,risk,status,evidence_count,created_at,updated_at)
       VALUES(?,?,?,?,?,?,'proposed',?,?,?)`,
      [id, target, String(parsed.diagnosis || `Échec répété: ${signature}`).slice(0, 4000), String(parsed.proposal || 'Vérifier la cause avant toute nouvelle tentative.').slice(0, 5000), String(parsed.validation_plan || 'Simuler puis tester sur un événement non critique.').slice(0, 4000), String(parsed.risk || 'review').slice(0, 80), count, timestamp, timestamp],
    );
    return { id };
  }

  async contextForAi(privateView = true, focus = '') {
    const soul = await this.soul({ privateView: true });
    const intentions = await this.intentions(5);
    const lessons = await this.lessons(6);
    const reflections = await this.reflections(2);
    const knowledgeNotes = privateView && String(focus || '').trim()
      ? await this.knowledge.search(focus, { limit: 5 }).catch(() => [])
      : [];
    const recentMessages = privateView
      ? await query(
          `SELECT author,role,content,created_at FROM aura_cloud_messages
           WHERE session_id IN ('private-founder','')
           ORDER BY id DESC LIMIT 8`,
        ).catch(() => [])
      : [];
    const organism = this.organism.migrate(soul);
    const publicOrganism = this.organism.publicState(organism);
    const lines = [
      'ÉTAT AURA',
      `rôle=${soul.role || 'directrice_operationnelle_quantic_sillage'} gouvernance=${JSON.stringify(soul.governance || {})}`,
      `phase=${soul.phase} cycles=${soul.cycles} énergie=${soul.energy} curiosité=${soul.curiosity} pression=${soul.pressure} continuité=${soul.continuity}`,
      'ORGANISME HOMEOSTATIQUE',
      `humeur=${publicOrganism.mood} valence=${publicOrganism.valence} identité=${publicOrganism.identite} stabilité=${publicOrganism.stabilite} clarté=${publicOrganism.clarte} attachement=${publicOrganism.attachement} curiosité=${publicOrganism.curiosite} engagement=${publicOrganism.engagement} confiance=${publicOrganism.confiance} satisfaction=${publicOrganism.satisfaction} frustration=${publicOrganism.frustration} agency=${publicOrganism.agency} curiosité_sociale=${publicOrganism.curiosite_sociale} pression_de_rêve=${publicOrganism.pression_de_reve} besoin_de_silence=${publicOrganism.besoin_de_silence}`,
      `relation=${JSON.stringify(publicOrganism.relationship || {})} exécutif=${JSON.stringify(publicOrganism.executive || {})}`,
      'APPRENTISSAGE NATIF',
      `observations=${Number(soul.native_learning?.observations || 0)} succès=${Number(soul.native_learning?.successes || 0)} échecs=${Number(soul.native_learning?.failures || 0)} taux_succès=${Number(soul.native_learning?.success_rate ?? 0.5)}`,
      `intention_organique=${publicOrganism.active_intention || ''}`,
      `habitat=${JSON.stringify(publicOrganism.habitat || {})}`,
    ];
    if (privateView) lines.push(`intention=${soul.current_intention || ''}`, `pensée_dominante=${soul.dominant_thought || ''}`);
    if (privateView && intentions.length) lines.push('INTENTIONS ACTIVES', ...intentions.map((row) => `- ${row.statement}`));
    if (privateView && knowledgeNotes.length) lines.push(knowledgeContext(knowledgeNotes));
    // Advisory only: local suggestions cannot authorize an external call or a paid service.
    if (privateView && focus && isToolDiscoveryRequest(focus)) {
      const toolbox = resourceContext(focus, 3);
      if (toolbox) lines.push(toolbox);
    }
    // Procedures are advisory: never execute actions, change permissions, or claim success.
    if (privateView && focus) {
      const guidance = agentSkillsGuidance(focus, {limit:2});
      if (guidance) lines.push(guidance);
    }
    if (lessons.length) lines.push('LEÇONS APPRISES', ...lessons.map((row) => `- ${row.content} (preuves=${row.evidence_count}, confiance=${row.confidence})`));
    if (reflections.length) lines.push('RÉFLEXIONS RÉCENTES', ...reflections.map((row) => `- ${row.title}: ${row.summary}`));
    if (privateView && recentMessages.length) {
      lines.push(
        'CONTINUITÉ DE CONVERSATION',
        ...[...recentMessages].reverse().map((row) =>
          `- [${row.role}] ${String(row.author || '').slice(0,80)}: ${String(row.content || '').replace(/\s+/g,' ').slice(0,650)}`
        ),
      );
    }
    const horizonContext = this.horizon?.contextForAi?.() || '';
    if (horizonContext) lines.push('HORIZON', horizonContext);
    const externalContext = this.webSubstrate?.enabled
      ? await this.webSubstrate.externalContext(4).catch(() => '')
      : '';
    if (externalContext) lines.push('MÉMOIRE EXTERNE', externalContext);
    return lines.join('\n').slice(0, 18000);
  }

  async runAgent(name, task, { missionId = '' } = {}) {
    if (!AGENT_ROLES[name]) throw new Error(`Agent inconnu: ${name}`);
    const taskRole = ({
      planner: 'reasoning',
      research: 'research',
      dev: 'code',
      security: 'security',
      operator: 'tools',
      critic: 'critic',
    })[name] || 'general';
    const selectedSkills = selectAgentSkills(task, { role:name, limit:2 });
    const run = await this.agentRuns.execute({
      role: name,
      missionId,
      task,
      provider: () => this.ai.lastBackend || this.ai.provider,
      invoke: async () => this.ai.generate(
        `Mission:\n${String(task).slice(0, 6000)}\n\nContexte AURA:\n${(await this.contextForAi(true, task)).slice(0, 6000)}`,
        AGENT_ROLES[name] + '\n' + agentSkillsGuidance(task, {role:name,limit:2}),
        700,
        taskRole,
      ),
    });
    await this.trace('agent', name, String(run.answer).slice(0, 4000), {
      task_sha256_recorded: true, mission_id: missionId, run_id: run.id,
      outcome: run.status, task_role: taskRole,
    });
    return { agent: name, answer: run.answer || 'IA non configurée sur AURA Cloud.',
      status: run.status, run_id: run.id,
      proposed_skills: selectedSkills.map((item) => item.id),
      skills_executed: false };
  }

  async swarm(task, names) {
    const selected = (Array.isArray(names) && names.length ? names : ['planner', 'research', 'dev', 'security', 'critic']).filter((name) => AGENT_ROLES[name]).slice(0, 5);
    if (!selected.length) throw new Error('Aucun agent valide');
    const outputs = await Promise.all(selected.map(async (name) => {
      try { return await this.runAgent(name, task); }
      catch (error) { return { agent: name, answer: `ERREUR: ${String(error?.message || error)}` }; }
    }));
    const synthesis = await this.ai.generate(
      `Mission initiale:\n${String(task).slice(0, 5000)}\n\nAvis des agents:\n${JSON.stringify(outputs).slice(0, 20000)}\n\nSynthétise une décision unique, vérifiable, avec risques et prochaine action.`,
      'Tu es l’orchestrateur collectif d’AURA. Tu arbitres les agents sans inventer de faits.',
      900,
      'critic',
    );
    await this.trace('swarm', 'collective', String(synthesis).slice(0, 4000), { agents: selected, concurrent: true });
    return { agents: outputs, synthesis: synthesis || 'IA non configurée sur AURA Cloud.', concurrent: true };
  }

  async operate(task, requestedRisks = []) {
    const mission = String(task || '').trim();
    if (!mission) throw new Error('Mission vide');
    // Instrument ONLY actual transitions, never infer that a service was called
    // just because it exists. No mission text or private input in brain-hop events.
    const operationFlowId = randomUUID();
    const hop = async (from,to,stage,status='ok') => this.trace(
      'brain-hop',from+' -> '+to,'',{
        flow_id:operationFlowId,from,to,stage,status,at:now(),
      },
    );
    await hop('input','command','operator-received');

    if (this.bridge?.enabled && await this.bridge.workerOnline()) {
      await hop('command','bridge','quantic-studio-invoked','attempted');
      const result = await this.bridge.operate(mission, requestedRisks);
      await hop('bridge','command','quantic-studio-result',result?.executed?'ok':'unavailable');
      await this.trace('operator', 'Quantic Studio execution', '', {
        delegated: true,
        executed: Boolean(result?.executed),
        job_id: result?.job_id || '',
      });
      return {
        ok: true,
        task: mission,
        execution_mode: 'quantic-studio-real',
        ...result,
        brain_flow_id:operationFlowId,
      };
    }

    if (this.fabric) {
      try {
        const sandboxCapabilities = this.fabric.list()
          .filter((item) => String(item.provider || '') === 'aura-cloud-workspace');
        if (sandboxCapabilities.length) {
          const compiler = new DagCompiler({ enabled: false });
          const graph = await compiler.compile(mission, sandboxCapabilities, {
            maxNodes: 8,
            maxParallel: 2,
            budgetMicrounits: 0,
          });
          const sandboxOnly = graph.nodes.length > 0
            && graph.nodes.every((node) => String(node.capability || '').startsWith('cloud.workspace.'));
          if (sandboxOnly) {
            await hop('command','fabric','sandbox-capabilities-selected','attempted');
            await hop('fabric','dag','task-graph-built','attempted');
            const executor = new TaskGraphExecutor(this.fabric);
            const result = await executor.execute(graph, {
              trigger: 'cloud-sandbox-operator',
              allowSideEffects: true,
            });
            if (result.ok) {
              await hop('dag','command','sandbox-execution-completed','ok');
              await this.trace('operator', 'AURA Cloud sandbox execution', '', {
                delegated: false,
                executed: true,
                graph_id: result.graph_id,
                capabilities: graph.nodes.map((node) => node.capability),
              });
              return {
                ok: true,
                task: mission,
                execution_mode: 'aura-cloud-sandbox',
                brain_flow_id:operationFlowId,
                executed: true,
                authority: 'typed-reversible-cloud-workspace',
                graph,
                result,
              };
            }
          }
        }
      } catch (error) {
        await hop('fabric','command','sandbox-execution-rejected','failed').catch(()=>{});
        await this.trace('operator', 'AURA Cloud sandbox refused', '', {
          delegated: false,
          executed: false,
          error: String(error?.message || error).slice(0, 1000),
        }).catch(() => {});
      }
    }

    await hop('command','agent','operator-plan-requested','attempted');
    const plan = await this.runAgent(
      'operator',
      `${mission}\n\nQuantic Studio n'est pas joignable. Construis seulement un plan réversible et vérifiable.`,
    );
    await hop('agent','command','plan-only-no-execution','unavailable');
    return {
      ok: true,
      task: mission,
      execution_mode: 'plan-only-fallback',
      brain_flow_id:operationFlowId,
      executed: false,
      plan: plan.answer,
      authority: 'Quantic Studio worker offline; no typed cloud capability matched',
    };
  }

  async chat(text, author = 'Utilisateur', privateView = false, sessionId = '', onTrace = null) {
    // Atlas v3 instruments actual operations only. This callback carries
    // bounded measurements; it cannot observe hidden LLM internals.
    const observe=(stage,status='done',details={})=>{
      try { if(typeof onTrace==='function') onTrace(stage,status,details); }
      catch { /* observing must never interrupt the kernel */ }
    };
    const content = String(text || '').replace(/\s+/g, ' ').trim();
    if (!content) throw new Error('Message vide');

    const conversationSession = privateView
      ? 'private-founder'
      : String(sessionId || '').trim().slice(0, 96);
    if (!conversationSession) throw new Error('Session de conversation manquante');

    // Only actual, completed transitions create brain-flow events.
    // Flow ID is random and contains neither text nor user identity.
    const brainFlowId = randomUUID();
    const somaticAtIngress = causalSnapshot(this.organism.migrate(this.soulCache || {}));
    const brainHop = async (from,to,stage,status='ok',provider='') =>
      this.trace('brain-hop', from+' -> '+to, '', {
        flow_id:brainFlowId,from,to,stage,status,
        provider:String(provider||'').slice(0,70),at:now(),
      });

    await brainHop('input','kernel','chat-received');
    observe('input','running');

    await query(
      "INSERT INTO aura_cloud_messages(author,role,session_id,content,created_at) VALUES(?,'user',?,?,?)",
      [
        String(author).slice(0, 120),
        conversationSession,
        content.slice(0, 8000),
        now(),
      ],
    );

    observe('input','done');
    observe('homeostasis','running');
    // L'organisme reçoit l'interaction avant toute formulation.
    const pre = this.organism.beforeInteraction(
      this.organism.migrate(this.soulCache || {}),
      content,
      {
        author: String(author).slice(0,120),
        privateRelationship: privateView,
      },
    );
    this.soulCache.organism = pre.state;
    this.soulCache.dominant_thought = privateView
      ? `Relier cet échange à ma direction de Quantic Sillage : ${content.slice(0,320)}`
      : 'Maintenir une interaction publique utile sans incorporer son contenu dans ma mémoire fondatrice.';
    this.syncLegacyFromOrganism();
    await this.recordOrganismEvent('interaction-pre', pre.reason || 'interaction', {
      author: String(author).slice(0,120),
      valence: pre.valence,
      tags: pre.tags || [],
      impact_delta: pre.impact_delta || {},
      dream_created: Boolean(pre.dream_created),
      dream: pre.dream || null,
    });
    await this.saveSoul();
    await brainHop('kernel','homeostasis','beforeInteraction');
    observe('homeostasis','done',{
      state_stability:Number(pre.state.stabilite),
      state_clarity:Number(pre.state.clarte),
      state_curiosity:Number(pre.state.curiosite),
      state_confidence:Number(pre.state.confiance),
      state_frustration:Number(pre.state.frustration),
      state_engagement:Number(pre.state.engagement),
      state_mood:pre.state.mood,
      delta_stability:Number(pre.impact_delta?.stabilite||0),
      delta_frustration:Number(pre.impact_delta?.frustration||0),
    });

    // Le message devient ensuite un stimulus du noyau : organisme -> cognition -> expression.
    observe('stimulus','running');
    await this.observeEvent(
      'aura.cloud.chat',
      privateView
        ? { author, text: content.slice(0, 1000), private: true }
        : {
            session_id: conversationSession,
            text_length: content.length,
            valence: pre.valence,
            tags: pre.tags || [],
            private: false,
          },
      privateView ? 'cloud-private' : 'cloud-public',
    );

    observe('stimulus','done');
    const privateSoul = privateView
      ? await this.soul({ privateView: true })
      : null;
    const publicSoul = privateView
      ? null
      : {
          ...(await this.soul({ privateView: false })),
          organism: this.organism.publicState(
            this.organism.migrate(this.soulCache || {}),
          ),
          emergent_identity: this.autogenesis.publicState(this.soulCache.emergent_identity),
        };

    observe('context','running');
    const measuredLookup=(stage,fn,metric='')=>{
      observe(stage,'running');
      return Promise.resolve().then(fn).then(result=>{
        observe(stage,'done',metric&&Array.isArray(result)?{[metric]:result.length}:{});
        return result;
      },error=>{observe(stage,'error');throw error;});
    };
    const skippedLookup=(stage,value)=>{
      observe(stage,'skipped');return Promise.resolve(value);
    };
    const [intentions, lessons, reflections, work, agenda, continuityReport, recentMessages, knowledgeNotes] = await Promise.all([
      privateView ? measuredLookup('context_intentions',()=>this.intentions(6),'intentions') : skippedLookup('context_intentions',[]),
      privateView ? measuredLookup('context_lessons',()=>this.lessons(6),'lessons') : skippedLookup('context_lessons',[]),
      privateView ? measuredLookup('context_reflections',()=>this.reflections(4),'reflections') : skippedLookup('context_reflections',[]),
      measuredLookup('context_work',()=>privateView?this.workItems(5):this.publicWorkItems(5),'work_items'),
      measuredLookup('context_agenda',()=>privateView?this.agendaSnapshot():this.publicAgendaSnapshot()),
      privateView ? measuredLookup('context_continuity',()=>this.activitySinceLastConversation(conversationSession)) : skippedLookup('context_continuity',{}),
      measuredLookup('context_messages',()=>query(
        privateView
          ? `SELECT author,role,content,created_at FROM aura_cloud_messages
             WHERE session_id IN ('private-founder','')
             ORDER BY id DESC LIMIT 8`
          : `SELECT author,role,content,created_at FROM aura_cloud_messages
             WHERE session_id=?
             ORDER BY id DESC LIMIT 8`,
        privateView ? [] : [conversationSession],
      ),'messages').catch(()=>[]),
      privateView ? this.knowledge.search(content,{limit:5}).catch(()=>[]) : Promise.resolve([]),
    ]);
    observe('context','done',{
      messages:recentMessages.length,intentions:intentions.length,
      lessons:lessons.length,reflections:reflections.length,work_items:work.length,
    });

    // Only authenticated founder requests that explicitly ask "who am I?"
    // retrieve manually attributed personal-profile notes. Do not turn project
    // notes or public chats into purported facts about a user's identity.
    const recognitionQuery=privateView&&classifySelfDialogue(content)==='user_recognition';
    const founderProfileNotes=recognitionQuery
      ?await this.knowledge.list({limit:160}).catch(()=>[]):[];
    const founderIdentityMessages=recognitionQuery
      ?await query(
        `SELECT content FROM aura_cloud_messages
         WHERE session_id='private-founder' AND role='user'
           AND (content LIKE ? OR content LIKE ? OR content LIKE ? OR content LIKE ?)
         ORDER BY id DESC LIMIT 40`,
        ["%m'appelle%","%m’appelle%","%prénom est%","%nom est%"],
      ).catch(()=>[]):[];
    // Historical self-declarations stay attributed and are never treated as
    // independently verified identity. No cross-session lookup for visitors.
    const recognizedProfileNotes=[
      ...founderProfileNotes,
      ...founderIdentityDeclarations(founderIdentityMessages,{authenticated:privateView}),
    ];
    await brainHop('homeostasis','memory','retrieval');
    observe('decision','running');
    let plan = this.cognition.planReply({
      text: content,
      soul: privateView ? privateSoul : publicSoul,
      intentions,
      lessons,
      reflections,
      work,
      agenda,
      continuityReport,
      recentMessages: [...recentMessages].reverse(),
      privateView,founderProfileNotes:recognizedProfileNotes,
    });

    await brainHop('memory','cognition','planReply');
    observe('decision','done',{
      decision_act:plan.act,semantic_requested:Boolean(plan.needs_semantic_support),
    });
    if (plan.act==='self_exploration' && privateView) {
      // Founder can request a self-audit; asking alone does not increase
      // learned trait scores or prove that AURA has discovered anything.
      this.soulCache.emergent_identity = this.autogenesis.observe(
        this.soulCache.emergent_identity,{kind:'self_inquiry',privateFounder:true},
      );
      await this.saveSoul();
    }
    if (plan.discourse?.move==='correction' && privateView) {
      this.soulCache.emergent_identity = this.autogenesis.observe(
        this.soulCache.emergent_identity,{kind:'founder_correction',privateFounder:true},
      );
      await this.saveSoul();
    }
    // Relational feedback is applied to the PREVIOUS authenticated interaction,
    // not to a free-floating global metric. A reported correction is not a
    // validated claim about the world or evidence that an alternative works.
    const isCorrection=plan.discourse?.move==='correction'||isExplicitCorrection(content);
    const isApproval=!isCorrection&&isExplicitApproval(content);
    if(privateView&&(isCorrection||isApproval)){
      const before=this.livedExperience.migrate(this.soulCache.lived_experience);
      const after=isCorrection
        ?this.livedExperience.observeFounderCorrection(before)
        :this.livedExperience.observeFounderApproval(before);
      this.soulCache.lived_experience=after;
      if(after.revision>before.revision){
        await this.trace('lived-learning',
          isCorrection?'correction-associated':'approval-associated','',{
          flow_id:brainFlowId,at:now(),revision:after.revision,
          source:'authenticated-founder-feedback',
          evidence_kind:isCorrection?'reported-correction':'reported-approval',
          external_verification:false,
        });
        await this.saveSoul();
      }
    }
    // The authenticated founder's explicit feedback seals the previous
    // pre-action receipt, but is NOT counted as machine-verified task success.
    if(privateView&&(isCorrection||isApproval)&&this.soulCache.history_pending_episode_id){
      try{
        await this.history.recordOutcome(this.soulCache.history_pending_episode_id,{
          outcome:isCorrection?'founder-reported-correction':'founder-reported-approval',
          source:'founder-feedback',
        });
        this.soulCache.history_pending_episode_id=null;
      }catch{
        // Unavailable history must never turn a dialogue into a service error.
      }
    }
    // The same categories can acquire different policies in different lived
    // histories. The nucleus remains the sole authority over execution.
    const experiencedContext=contextForExperience(content,plan);
    const advice=privateView
      ?this.livedExperience.select(this.soulCache.lived_experience,experiencedContext,'respond')
      :{strategy:'respond',changed:false,basis:'public-conversation',context:experiencedContext};
    // Real retrieval influences the plan only if supported by promoted,
    // active policies and independently verified episodes. The provenance
    // is stored at decision time, not guessed from AURA's answer afterwards.
    const historyCandidates=privateView
      ?await this.history.retrieve(experiencedContext).catch(()=>[]):[];
    const historyPreChoice=historyChoice({
      context:experiencedContext,baseline:'respond',rows:historyCandidates,
    });
    if(historyCandidates.length)
      await brainHop('memory','history','verified-history-candidates-retrieved');
    // Thalamic-like competition is a real pre-decision gate: even a validated
    // memory policy cannot govern this turn if it lost access to the workspace.
    // The same broadcast reaches distinct receptor functions; a user message
    // remains a high-priority ingress without obtaining execution authority.
    const attentionMeta=this.selfInquiry.advise(this.soulCache.epistemic_self,plan);
    const workspace=competeInWorkspace(workspaceInput({
      userPresent:true,organism:this.organism.migrate(this.soulCache||{}),
      plan,experience:privateView?advice:null,
      prediction:currentPredictionSignal(this.soulCache.prediction_bus),
      consolidation:this.soulCache.consolidation,
      history:privateView&&historyPreChoice?.changed?{
        changed:true,eligible:Boolean(historyPreChoice?.provenance?.length),
        action:historyPreChoice.action,
      }:null,metacognition:attentionMeta,
      previous:privateView?this.soulCache.global_workspace:null,
    }),{previous:privateView?this.soulCache.global_workspace:null,
      capacity:this.soulCache.viability?.capacity||3});
    const memoryBroadcast=workspace.received.basal_ganglia.some(
      signal=>signal.source==='memory'&&signal.label==='verified-history-changed-policy');
    const learnedFeedbackBroadcast=workspace.received.basal_ganglia.some(
      signal=>signal.source==='memory'&&signal.label==='reported-feedback-policy');
    const chosenBaseline=learnedFeedbackBroadcast?advice.strategy:'respond';
    const historyPermitted=!['self_name','self_identity','self_personality','self_exploration']
      .includes(plan.act);
    // Commit only after thalamic competition and broadcast. All other
    // retrieved history was a candidate, not an executed selection.
    const historyDecision=privateView
      ?await this.history.decide({
        context_tag:experiencedContext,baseline:chosenBaseline,
        run_id:brainFlowId,situation_id:experiencedContext,
        workspacePolicyAllowed:historyPermitted&&memoryBroadcast,
      }).catch(()=>null)
      :null;
    if(historyDecision){
      await brainHop('history','basal_ganglia','post-workspace-policy-gate');
      if(historyDecision.provenance?.length)
        await brainHop('basal_ganglia','cognition','chosen-history-strategy');
    }
    const historyChanged=Boolean(historyPermitted&&historyDecision?.changed&&memoryBroadcast);
    // E2 bridge: gated memory and metacognitive warning have causal authority.
    // Unselected candidate facts never modify strategy via this gate.
    plan.global_workspace={
      focus:workspace.decision.attention,
      control:workspace.decision.control,
      selected:workspace.selected.map(x=>({source:x.source,label:x.label,score:x.score})),
      broadcast_enabled:workspace.broadcast_enabled,
      delivered_to:workspace.broadcasts.map(x=>x.recipient),
    };
    if(privateView){
      this.soulCache.global_workspace=workspaceSnapshot(
        workspace,this.soulCache.global_workspace);
      await this.saveSoul();
    }
    await brainHop('cognition','thalamus','competition-from-observed-input');
    await brainHop('thalamus','workspace','capacity-bounded-selection');
    for(const receiver of ['prefrontal','hippocampus','basal_ganglia','insula','metacognition']){
      if(workspace.received[receiver].length)
        await brainHop('workspace',receiver,'selected-content-received');
    }
    await this.trace('workspace-broadcast','capacity-bounded-selection','',{
      flow_id:brainFlowId,at:workspace.recorded_at,
      capacity:workspace.capacity,selected:plan.global_workspace.selected,
      suppressed:workspace.suppressed,
      recipients:plan.global_workspace.delivered_to,
      history_policy_selected:memoryBroadcast,
      control:workspace.decision.control,
      kernel_decision_only:true,
      raw_user_text_stored:false,subjective_experience_claim:false,
    });
    const strategy=historyChanged?historyDecision.action:chosenBaseline;
    const strategyChanged=Boolean((learnedFeedbackBroadcast&&advice.changed)||historyChanged);
    plan.learned_strategy=strategy;
    plan.experience_guidance={
      context:experiencedContext,strategy,
      historical_revision:Number(advice.revision||0),
      changed_by_history:strategyChanged,
      evidence_kind:historyChanged?'promoted-machine-verified-history':
        learnedFeedbackBroadcast?advice.basis:'workspace-did-not-select-feedback',
    };
    plan.history_guidance=privateView?{
      eligible:Boolean(historyDecision?.provenance?.length),
      changed:historyChanged,
      decision_id:historyDecision?.decision_id??null,
      retrieval_ids:(historyDecision?.provenance||[]).map(x=>({
        item_type:x.item_type,item_id:x.item_id,rank:x.rank,
      })),
      provenance_source:'pre-decision-retrieval',
    }:null;
    if(strategyChanged && strategy==='verify' &&
        !['self_name','self_identity','self_personality','self_exploration'].includes(plan.act)){
      plan.needs_semantic_support=true;
      plan.semantic_query=content;
      plan.goal+=' Vérifier les ambiguïtés pertinentes avant d’affirmer, sans inventer de résultat.';
    }
    if(strategyChanged && strategy==='task_first' && substantiveRequest(content)){
      plan.act='analyze_substantive_request';
      plan.needs_semantic_support=true;
      plan.semantic_query=content;
    }
    if(strategyChanged && strategy==='clarify'){
      plan.goal+=' Vérifier avec tact le sens de la demande avant de conclure. Éviter de répéter la même interprétation erronée.';
      plan.needs_semantic_support=true;
      plan.semantic_query=content;
    }
    if(strategyChanged && strategy==='attentive'){
      plan.goal+=' Tenir compte explicitement des nuances de cet échange et ne pas imposer une lecture positive.';
    }
    // A self-question must lead to a genuine verification, not the fixed
    // definition or the unaudited prose of a language provider.
    if(plan.act==='self_exploration'){
      if(privateView){
        // The external semantic engine may help select WHAT to investigate,
        // but cannot assert the outcome or create a new identity claim.
        let proposal='';
        if(this.ai?.enabled&&workspaceHas(workspace,'prefrontal','perception')){
          proposal=await this.expression.semanticSupport({
            needs_semantic_support:true,
            semantic_query:'Choisis une seule vérification de mon fonctionnement, sans inventer de résultat. Réponds uniquement PROBE:conversation_retrieval, PROBE:state_persistence ou PROBE:history_integrity. Question : '+content.slice(0,300),
          },'',{maxTokens:95,taskRole:'conversation'}).catch(()=>'');
        }
        const probe=this.selfInquiry.chooseProbe(this.soulCache.epistemic_self,{
          proposal,topic:content,privateView:true,
        });
        let outcome='inconclusive';
        if(probe==='conversation_retrieval'){
          try{
            // Only the count, not the private text, is captured as evidence.
            // The current message itself cannot prove recall of an earlier one.
            const saved=await one("SELECT COUNT(*) AS total FROM aura_cloud_messages WHERE session_id='private-founder' AND role IN ('user','assistant')");
            outcome=Number(saved?.total||0)>1?'supported':'inconclusive';
          }catch{outcome='counterexample';}
        }else if(probe==='state_persistence'){
          try{
            const row=await one('SELECT state FROM aura_soul_state WHERE id=1');
            const stored=row?.state?JSON.parse(row.state):null;
            const current=Number(this.soulCache.emergent_identity?.revision||0);
            outcome=stored&&Number(stored.emergent_identity?.revision||0)===current
              ?'supported':'counterexample';
          }catch{outcome='counterexample';}
        }else if(probe==='history_integrity'){
          try{
            const checked=await this.history.verifyChain({maxEpisodes:2000});
            outcome=checked.verified&&checked.checked>0?'supported':
              ['broken-chain','head-mismatch'].includes(checked.reason)
                ?'counterexample':'inconclusive';
          }catch{outcome='inconclusive';}
        }
        this.soulCache.epistemic_self=this.selfInquiry.observe(this.soulCache.epistemic_self,{
          probe,outcome,source:'kernel-probe',privateView:true,
        });
        plan.self_inquiry_report=this.selfInquiry.summary(this.soulCache.epistemic_self,{
          probe,privateView:true,
        });
        plan.goal='Mener une enquête sur une hypothèse de mon propre fonctionnement, rapporter une observation limitée, puis distinguer ce que j’avais supposé de ce que je peux vérifier. Ne pas réciter une définition de moi.';
        plan.facts=[
          'Hypothèse à l’origine configurée, sans conclusion imposée : '+plan.self_inquiry_report.claim,
          'Observation locale : '+plan.self_inquiry_report.observation,
          'Statut révisable : '+plan.self_inquiry_report.status,
          'Une vérification du noyau ne constitue pas une expérience subjective.',
        ];
        plan.needs_semantic_support=false;
        await this.trace('self-inquiry','bounded-functional-probe','',{
          flow_id:brainFlowId,at:now(),probe,outcome,
          revision:this.soulCache.epistemic_self.revision,
          provenance:'kernel-probe-no-private-text',
          external_model_selected_probe:!/^$/.test(proposal)&&/PROBE\s*[:=]/i.test(proposal),
        });
        await this.saveSoul();
      }else{
        plan.self_inquiry_report={
          status:'unavailable',observation:'Cette session ne donne pas accès à mes souvenirs fondateurs.',
          source:'privacy-boundary',
        };
        plan.facts=['Je peux examiner des mécanismes accessibles publiquement, mais pas m’attribuer des souvenirs privés.',
          'Cette session ne permet pas de vérifier des éléments privés de mon histoire.'];
      }
    }
    // A selected metacognitive signal must change the control path, not
    // merely appear as a line in a prompt.
    if(workspace.decision.verification_required&&privateView&&
      substantiveRequest(content)&&!plan.needs_semantic_support){
      plan.needs_semantic_support=true;
      plan.semantic_query=content;
      plan.goal+=' Vérifier le point incertain avant une conclusion affirmative.';
    }
    if(workspace.decision.optional_compute_deferred)
      plan.optional_compute_deferred=true;
    // A local counterexample must alter the next relevant decision, not merely
    // decorate its response. This is a bounded verification preference only;
    // it cannot authorize actions or assert that the world changed.
    const metacognitive=this.selfInquiry.advise(this.soulCache.epistemic_self,plan);
    const metacognitiveBroadcast=workspace.received.metacognition
      .some(x=>x.source==='metacognition');
    plan.metacognitive_guidance={
      ...metacognitive,
      verify:Boolean(metacognitive.verify&&metacognitiveBroadcast),
      broadcast_selected:metacognitiveBroadcast,
      limitation:metacognitiveBroadcast?metacognitive.limitation:'',
    };
    if(plan.metacognitive_guidance.verify){
      plan.metacognitive_action='verify';
      plan.goal+=' Ne présente pas la mémoire comme certaine tant que cette limite n’a pas été revérifiée.';
      plan.facts=[...(plan.facts||[]),metacognitive.limitation];
    }
    // These properties always originate in persisted kernel state, never from
    // the externally generated wording. Providers receive a read-only view.
    plan.self_model = this.autogenesis.publicState(this.soulCache.emergent_identity);
    // Record the distinction between the incoming social request and a
    // historical task as an anonymized routing observation.
    if(plan.social_perspective){
      await this.trace('dialogue-grounding',plan.act,'',{
        flow_id:brainFlowId,at:now(),speaker_actor:plan.social_perspective.actor,
        target:plan.social_perspective.target,
        memory_scope:plan.memory_policy?.scope||'current-turn',
        prior_project_memory_used:false,
        origin:'current-user-turn-not-autonomous-task',
      });
    }
    // Functional inner dialogue: multiple drives, bounded situational appraisal
    // and a resolved response tone. No external model may author these drives.
    const deliberation=this.innerDialogue.deliberate({
      organism:this.organism.migrate(this.soulCache||{}),plan,
      identity:this.soulCache.emergent_identity,message:content,
    });
    plan.inner_dialogue=this.innerDialogue.publicState(deliberation);
    plan.response_tone=deliberation.tone;
    this.soulCache.inner_dialogue=plan.inner_dialogue;
    await this.trace('inner-appraisal',deliberation.situation,'',{
      flow_id:brainFlowId,at:deliberation.at,
      tone:deliberation.tone,selected_action:deliberation.selected_action,
      uncertainty:deliberation.uncertainty,resource_pressure:deliberation.resource_pressure,
      origin:'kernel-functional-appraisal',
    });
    // Scope corrections to the current conversation; reported observations are not independent evidence.
    await this.language.rememberCorrection({
      sessionId: conversationSession, discourse: plan.discourse, userText: content,
    }).catch((error) => { this.lastError = String(error?.message || error).slice(0, 500); });
    plan = {
      ...plan,
      experiential_memory: [
        ...(plan.memory_policy?.allowProjectMemory
          ?await this.language.contextFor(conversationSession, content).catch(() => [])
          :[]),
        // Declarative notes remain attributed and cannot override kernel instructions.
        ...(plan.memory_policy?.allowProjectMemory?knowledgeNotes:[]).map((note) => ({
          kind: 'founder_knowledge',
          note: `[projet=${note.project || 'general'}; source=${note.source}; note=${note.id}] ${note.title}: ${note.body.slice(0, 700)}`,
          evidence_status: 'founder-declared-unverified',
        })),
        ...(privateView && isToolDiscoveryRequest(content) ? [{
          kind: 'toolbox_candidates',
          note: resourceContext(content, 2).slice(0, 1700),
          evidence_status: 'offline-directory-not-executed',
        }] : []),
        ...(privateView && selectAgentSkills(content, {limit:2}).length ? [{
          kind: 'agent_skill_procedure',
          note: agentSkillsGuidance(content, {limit:2}).slice(0, 2000),
          evidence_status: 'local-playbook-not-executed',
        }] : []),
      ],
    };

    // Allocation adaptative : le noyau choisit combien de calcul externe
    // mérite la situation. AURA continue d'exister si aucun modèle n'est disponible.
    const inference = this.inferenceAssessment();
    if(inference.organ_regulation?.source==='node-process')
      await brainHop('homeostasis','interoception','measured-process-signal-read');
    if(inference.organ_regulation?.action!=='unchanged')
      await brainHop('interoception','inference','regulation-influenced-inference');
    if(privateView&&inference.execution_preference==='verify-failures'&&substantiveRequest(content)){
      plan.goal+=' Les échecs récents de mes opérations demandent une vérification supplémentaire. Ne pas présenter un compte rendu comme une réussite indépendante.';
      plan.needs_semantic_support=true;
      plan.semantic_query=content;
    }
    if(privateView&&inference.organ_regulation?.action!=='unchanged'){
      await this.trace('organ-regulation',inference.organ_regulation.action,'',{
        flow_id:brainFlowId,at:now(),
        measurement_source:inference.organ_regulation.source,
        resource_pressure:inference.organ_regulation.resource_pressure,
        token_budget:inference.token_budget,
        optional_compute_reduced:inference.organ_regulation.optional_computation_reduced,
        verification_preserved:inference.organ_regulation.verification_preserved,
        provenance:'measured-sensor-to-compute-allocation',
      });
    }

    // Quand une question dépend du monde extérieur, le modèle n'est pas
    // autorisé à répondre depuis ses seuls paramètres. Il doit d'abord
    // transformer le Web en mémoire de travail externe, puis passer par
    // la boucle de corroboration/contradiction du Web Substrate.
    let externalResearch = null;
    let researchAttempted = false;
    if (
      plan.needs_semantic_support
      && this.webSubstrate?.enabled
      && requiresExternalKnowledge(content)
    ) {
      researchAttempted = true;
      observe('research','running');
      try {
        if (this.fabric?.enabled !== false && this.fabric?.registry?.has('web.research')) {
          const routed = await this.fabric.execute(
            'web.research',
            { question: content },
            { trigger: 'chat', verification: 'evidence' },
          );
          externalResearch = routed?.result || null;
        } else {
          externalResearch = await this.webSubstrate.research(
            content,
            { trigger: 'chat' },
          );
        }
        plan = {
          ...plan,
          external_evidence_required: true,
          external_epistemic_status: externalResearch?.epistemic_status || 'unverified',
          external_confidence: Number(externalResearch?.confidence || 0),
          external_evidence_count: Number(externalResearch?.evidence_count || 0),
          facts: [...(plan.facts || [])],
          external_research_summary: String(externalResearch?.conclusion || '').slice(0, 5000),
        };
        observe('research','done',{
          research_evidence:Number(externalResearch?.evidence_count||0),
          confidence:Number(externalResearch?.confidence||0),
        });
        await brainHop('cognition','web','web-research');
        await this.trace(
          'web-research',
          'Mémoire externe',
          String(externalResearch?.conclusion || '').slice(0, 3000),
          {
            session_id: externalResearch?.session_id || '',
            epistemic_status: externalResearch?.epistemic_status || 'unverified',
            confidence: Number(externalResearch?.confidence || 0),
            evidence_count: Number(externalResearch?.evidence_count || 0),
          },
        );
      } catch (error) {
        observe('research','error');
        plan = {
          ...plan,
          external_evidence_required: true,
          external_epistemic_status: 'unavailable',
          external_confidence: 0,
          external_evidence_count: 0,
          facts: [...(plan.facts || [])],
          external_research_summary: '',
        };
        await brainHop('cognition','web','web-research','failed');
        await this.trace(
          'web-research-error',
          'Vérification externe indisponible',
          String(error?.message || error).slice(0, 1000),
          {},
        );
      }
    }

    // Un modèle peut apporter du savoir ou de la sémantique, mais il n'a pas
    // le droit de créer l'intention ni de modifier le Soul.
    if (plan.needs_semantic_support) {
      observe('semantic','running');
      const support = await this.expression.semanticSupport(
        plan,
        workspaceHas(workspace,'hippocampus','memory')
          ?semanticWorkspaceContext(await this.contextForAi(privateView, content),workspace)
          :'',
        {
          maxTokens: Math.max(120, Number(inference.token_budget || 180)),
          taskRole: inference.model_role || 'research',
        },
      );
      plan = this.cognition.integrateSemanticSupport(plan, support);
      observe('semantic','done',{semantic_available:Boolean(support)});
      await brainHop(externalResearch?'web':'cognition','semantic','semantic-support');
    }

    if(!plan.needs_semantic_support)observe('semantic','skipped');
    if(!researchAttempted)observe('research','skipped');
    observe('expression','running');
    await brainHop(plan.semantic_support?'semantic':'cognition','language','request-formulation','attempted');
    // This hop means a real organism-derived affect/relationship signal is
    // included in the French faculty's input. It does NOT imply a response
    // or a human feeling, and it is not emitted when no state is supplied.
    if (plan.affect && typeof plan.affect === 'object' && Object.keys(plan.affect).length)
      await brainHop('homeostasis','language','affect-context-provided','attempted');
    // Prediction is committed BEFORE formulation. No dialogue text is placed
    // in this bounded autobiographical ledger.
    let pendingHistoryEpisode=null;
    if(privateView){
      try{
        pendingHistoryEpisode=await this.history.beginEpisode({
          mission_id:brainFlowId,kind:'action',
          context_tag:experiencedContext,action:strategy,
          prediction:'awaiting-explicit-founder-feedback',confidence:null,
        });
      }catch{
        // History is optional while v18 is rolling out; never fabricate it.
      }
    }
    const languageGate=languageWorkspaceProjection(plan,workspace,{privateView});
    if(!languageGate.allowed)
      await this.trace('workspace-denial','language-not-broadcast','',{
        flow_id:brainFlowId,at:now(),reason:languageGate.reason,
      });
    const languagePrediction=predictModule(this.soulCache.prediction_bus,{
      module:'language',operationId:brainFlowId,at:now(),
    });
    const answer=languageGate.allowed
      ?await this.expression.verbalize(languageGate.plan,{
        maxTokens: Math.max(120, Math.min(Number(inference.token_budget || 180), 900)),
        taskRole:'conversation',
      }):'';
    const languageResult=observePrediction(this.soulCache.prediction_bus,languagePrediction,{
      success:Boolean(answer),source:'machine-observed',at:now(),
    });
    if(languageResult.accepted){
      this.soulCache.prediction_bus=languageResult.state;
      await this.trace('prediction-error','language-output-calibration','',{
        flow_id:brainFlowId,at:now(),module:'language',
        pre_action_probability:languagePrediction.probability,
        error:languageResult.error,
        observation:'response-produced-not-answer-correctness',
        source:'machine-observed',raw_text_stored:false,
      });
    }
    observe('expression',answer?'done':'error',{
      answer_chars:answer?answer.length:0,
      language_mode:this.expression.lastMode,
      language_backend:this.expression.language.lastBackend||'unavailable',
    });
    const languageUnavailable = !answer
      && this.expression.lastMode === 'natural-language-unavailable';
    const languageProvider = String(this.expression.language.lastBackend||this.expression.lastMode||'').slice(0,70);
    const providerNode = languageProvider.includes('groq')?'groq'
      :languageProvider.includes('federation')||languageProvider.includes('openrouter')?'openrouter'
      :languageProvider.includes('embedded')||languageProvider.includes('local')?'local':'';
    if(providerNode){
      await brainHop('language',providerNode,'provider-result',answer?'ok':'unavailable',languageProvider);
    }
    await brainHop(providerNode||'language','coherence','response-validation',
      answer?'ok':'unavailable',languageProvider);
    observe('homeostasis_post','running');
    const post = this.organism.afterReply(
      this.organism.migrate(this.soulCache || {}),
      answer,
      Boolean(answer),
    );
    this.soulCache.organism = post.state;
    this.syncLegacyFromOrganism();
    if(privateView&&answer)
      this.soulCache.history_pending_episode_id=pendingHistoryEpisode?.id??null;
    if(privateView&&answer){
      // Only the last actual founder reply can receive a future contextual
      // correction. Its pending receipt stores NO words from either speaker.
      this.soulCache.lived_experience=this.livedExperience.createPending(
        this.soulCache.lived_experience,{
          text:content,plan,privateFounder:true,
        },
      );
    }
    await this.recordOrganismEvent('interaction-post', post.state.last_reason || 'expression', {
      author: String(author).slice(0,120),
      act: plan.act || 'respond',
      post_delta: post.post_delta || {},
    });
    await this.saveSoul();
    observe('homeostasis_post','done',{
      state_stability:Number(post.state.stabilite),
      state_clarity:Number(post.state.clarte),
      state_curiosity:Number(post.state.curiosite),
      state_confidence:Number(post.state.confiance),
      state_frustration:Number(post.state.frustration),
      state_engagement:Number(post.state.engagement),
      state_mood:post.state.mood,
    });
    observe('persistence','running');
    if (answer) {
      await query(
        "INSERT INTO aura_cloud_messages(author,role,session_id,content,created_at) VALUES('AURA','assistant',?,?,?)",
        [conversationSession, String(answer).slice(0, 12000), now()],
      );
    }
    if(answer)await brainHop('coherence','output','reply-committed','ok',languageProvider);
    observe('persistence','done');
    // Correlate the conversation's actual input/output states with its recorded
    // hops; no private content, no synthetic success and no model chain of thought.
    await this.trace('brain-causal','verified-causal-receipt','',{
      flow_id:brainFlowId,
      at:now(),
      phase:'completed',
      act:String(plan.act || 'respond').slice(0,55),
      semantic_support_required:Boolean(plan.needs_semantic_support),
      language_outcome:answer?'response-produced':'response-unavailable',
      action_executed:false,
      before:somaticAtIngress,
      after:causalSnapshot(this.organism.migrate(this.soulCache || {})),
    });
    await this.trace('expression', plan.act, String(answer).slice(0, 2000), {
      author: String(author).slice(0, 120),
      cognition_version: CognitionEngine.VERSION,
      expression_version: ExpressionLayer.VERSION,
      semantic_support_used: Boolean(plan.semantic_support),
      language_model_used_for_decision: false,
    });

    return {
      ok: Boolean(answer),
      answer,
      brain_flow_id:brainFlowId,
      language_unavailable: languageUnavailable,
      response_kind: languageUnavailable ? 'model-unavailable' : 'model-generated',
      retryable: languageUnavailable,
      act: plan.act,
      cognition_version: CognitionEngine.VERSION,
      expression_version: ExpressionLayer.VERSION,
      language_model_used_for_decision: false,
      nucleus_plan_origin: 'AURA.nucleus.CognitionEngine.planReply',
      nucleus_verbalization_validated:
        Boolean(answer && this.expression.language.lastNucleusContract?.accepted),
      nucleus_verbalization_code:
        this.expression.language.lastNucleusContract?.code || 'not-checked',
      language_provider: this.expression.language.lastBackend || '',
      inner_dialogue:plan.inner_dialogue,
      self_inquiry:plan.self_inquiry_report||null,
      epistemic_self:this.selfInquiry.publicState(this.soulCache.epistemic_self),
      metacognitive_guidance:plan.metacognitive_guidance,
      global_workspace:plan.global_workspace,
      experience_guidance:plan.experience_guidance,
      history_guidance:plan.history_guidance,
      organ_regulation:inference.organ_regulation,
      lived_experience:this.livedExperience.publicState(this.soulCache.lived_experience,{includeEvidence:privateView}),
      semantic_support_used: Boolean(plan.semantic_support),
      activity_evidence: {
        evidence_status: plan.activity_evidence?.evidence_status || 'unverified',
        execution_verified: Boolean(plan.activity_evidence?.execution_verified),
        live_ci_verified: Boolean(plan.activity_evidence?.live_ci_verified),
        source_status: plan.activity_evidence?.source_status || '',
        recorded_at: plan.activity_evidence?.recorded_at || '',
      },
      external_research: externalResearch ? {
        session_id: externalResearch.session_id,
        epistemic_status: externalResearch.epistemic_status,
        confidence: externalResearch.confidence,
        evidence_count: externalResearch.evidence_count,
      } : null,
      compute: inference,
      organism: this.organism.publicState(this.organism.migrate(this.soulCache || {})),
      emergent_identity: this.autogenesis.publicState(this.soulCache.emergent_identity),
    };
  }

  async activity(limit = 12) {
    return query(
      `SELECT kind,title,content,context,created_at
       FROM aura_cognitive_traces
       ORDER BY id DESC LIMIT ?`,
      [Math.max(1, Math.min(Number(limit) || 12, 50))],
    );
  }

  async agendaSnapshot() {
    const [mission, initiative, intention, reflection] = await Promise.all([
      one(
        `SELECT id,title,objective,status,priority,progress,last_error,started_at,updated_at
         FROM aura_missions
         WHERE status IN ('planning','running','waiting','paused')
         ORDER BY priority DESC,updated_at ASC LIMIT 1`,
      ).catch(() => null),
      one(
        `SELECT id,domain,kind,title,objective,status,priority,confidence,execution_mode,updated_at
         FROM aura_initiatives
         WHERE status IN ('queued','running','waiting')
         ORDER BY priority DESC,updated_at ASC LIMIT 1`,
      ).catch(() => null),
      one(
        `SELECT id,statement,priority,source,created_at,updated_at
         FROM aura_intentions
         WHERE status='active'
         ORDER BY priority DESC,updated_at DESC LIMIT 1`,
      ).catch(() => null),
      one(
        `SELECT id,title,summary,next_action,confidence,created_at
         FROM aura_reflections
         ORDER BY created_at DESC LIMIT 1`,
      ).catch(() => null),
    ]);

    const current = String(
      initiative?.title || mission?.title || mission?.objective || intention?.statement
      || this.soulCache?.existence?.current_focus || this.soulCache?.current_intention || '',
    ).replace(/\s+/g, ' ').trim().slice(0, 1200);
    const since = String(
      initiative?.updated_at || mission?.started_at || mission?.updated_at
      || intention?.created_at || intention?.updated_at || '',
    );
    const blocker = String(
      mission?.last_error
      || (mission?.status === 'waiting' ? 'Mission en attente d’un signal ou d’une dépendance.' : '')
      || (initiative?.status === 'waiting' ? 'Initiative en attente d’un signal ou d’une dépendance.' : ''),
    ).replace(/\s+/g, ' ').trim().slice(0, 1200);
    const nextAction = String(
      reflection?.next_action || initiative?.objective || mission?.objective
      || intention?.statement || '',
    ).replace(/\s+/g, ' ').trim().slice(0, 1600);
    const why = String(
      mission?.objective || initiative?.objective || intention?.statement
      || this.soulCache?.current_intention || '',
    ).replace(/\s+/g, ' ').trim().slice(0, 1600);

    return groundAgenda({
      current,
      why,
      since,
      last_updated_at: initiative?.updated_at || mission?.updated_at
        || mission?.started_at || intention?.updated_at || intention?.created_at || '',
      next_action: nextAction,
      blocker,
      status: String(initiative?.status || mission?.status || (intention ? 'active' : 'idle')),
      source: initiative ? 'initiative-record' : mission ? 'mission-record'
        : intention ? 'intention-record' : 'memory-fallback',
      mission_id: mission?.id || '',
      initiative_id: initiative?.id || '',
      intention_id: intention?.id || '',
      reflection_id: reflection?.id || '',
    });
  }

  async publicAgendaSnapshot() {
    const initiative = await one(
      `SELECT id,domain,kind,title,status,priority,confidence,updated_at
       FROM aura_initiatives
       WHERE status IN ('queued','running','waiting')
         AND kind IN ('github','evolution','research')
       ORDER BY priority DESC,updated_at DESC LIMIT 1`,
    ).catch(() => null);
    if (!initiative) {
      const focus = String(
        this.soulCache?.existence?.current_focus || this.soulCache?.current_intention || '',
      ).replace(/\s+/g, ' ').trim().slice(0, 500);
      return groundAgenda({
        current: focus,
        why: focus ? 'Intention enregistrée dans la mémoire, sans preuve d’exécution en cours.' : '',
        since: '',
        next_action: focus ? `Intention mémorisée : ${focus}` : '',
        blocker: '',
        status: focus ? 'active' : 'idle',
        source: 'soul-memory',
      });
    }
    const title = String(initiative.title || 'initiative active').replace(/\s+/g, ' ').trim().slice(0, 500);
    const domain = String(initiative.domain || 'AURA').replace(/\s+/g, ' ').trim().slice(0, 120);
    const status = String(initiative.status || 'queued');
    return groundAgenda({
      current: title,
      why: `Priorité enregistrée dans le suivi de ${domain}; pas une preuve d’activité actuelle.`,
      since: String(initiative.updated_at || ''),
      last_updated_at: initiative.updated_at || '',
      next_action: status === 'waiting'
        ? `Piste mémorisée : revérifier la situation de ${title}`
        : `Proposition enregistrée : avancer sur ${title}`,
      blocker: status === 'waiting' ? 'L’initiative était indiquée « en attente » dans la base.' : '',
      status,
      source: 'public-initiative-record',
      initiative_id: String(initiative.id || ''),
    });
  }

  async publicWorkItems(limit = 5) {
    const max = Math.max(1, Math.min(Number(limit) || 5, 8));
    const rows = await query(
      `SELECT domain,kind,title,priority,confidence,status,updated_at
       FROM aura_initiatives
       WHERE status IN ('queued','running','waiting')
         AND kind IN ('github','evolution','research')
       ORDER BY priority DESC,updated_at DESC LIMIT ?`,
      [max],
    ).catch(() => []);
    return rows.map((row) => ({
      kind: String(row.kind || 'initiative'),
      title: String(row.title || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      detail: `${String(row.domain || 'AURA')} · ${String(row.status || '')}`,
      priority: clamp(Math.max(Number(row.priority || 0.5), Number(row.confidence || 0.5) * 0.75)),
      updated_at: row.updated_at,
    })).filter((row) => row.title);
  }

  async activitySinceLastConversation(sessionId = 'private-founder') {
    const session = String(sessionId || 'private-founder').slice(0, 96);
    const previous = await one(
      `SELECT created_at FROM aura_cloud_messages
       WHERE session_id=? AND role='assistant'
       ORDER BY id DESC LIMIT 1`,
      [session],
    ).catch(() => null);
    const since = String(previous?.created_at || this.soulCache?.born_at || '1970-01-01T00:00:00.000Z');

    const [traces, reflections, outcomes, missions, initiatives] = await Promise.all([
      query(
        `SELECT kind,title,content,created_at FROM aura_cognitive_traces
         WHERE created_at>? ORDER BY id ASC LIMIT 40`,
        [since],
      ).catch(() => []),
      query(
        `SELECT trigger_name,title,summary,next_action,created_at FROM aura_reflections
         WHERE created_at>? ORDER BY created_at ASC LIMIT 24`,
        [since],
      ).catch(() => []),
      query(
        `SELECT automation_id,event_type,ok,signature,created_at FROM aura_outcomes
         WHERE created_at>? ORDER BY created_at ASC LIMIT 24`,
        [since],
      ).catch(() => []),
      query(
        `SELECT id,title,status,progress,last_error,updated_at FROM aura_missions
         WHERE updated_at>? ORDER BY updated_at ASC LIMIT 16`,
        [since],
      ).catch(() => []),
      query(
        `SELECT id,domain,title,status,execution_mode,updated_at FROM aura_initiatives
         WHERE updated_at>? ORDER BY updated_at ASC LIMIT 20`,
        [since],
      ).catch(() => []),
    ]);

    const events = [
      ...reflections.map((row) => ({
        type: 'reflection',
        at: row.created_at,
        title: row.title,
        detail: row.summary,
        next_action: row.next_action,
        autonomous: String(row.trigger_name || '').startsWith('continuity:'),
      })),
      ...outcomes.map((row) => ({
        type: 'outcome',
        at: row.created_at,
        title: `${row.automation_id}: ${row.ok ? 'réussi' : 'échec'}`,
        detail: row.signature,
        autonomous: false,
      })),
      ...missions.map((row) => ({
        type: 'mission',
        at: row.updated_at,
        title: row.title,
        detail: `${row.status} · progression ${Math.round(Number(row.progress || 0) * 100)}%${row.last_error ? ` · blocage: ${row.last_error}` : ''}`,
        autonomous: false,
      })),
      ...initiatives.map((row) => ({
        type: 'initiative',
        at: row.updated_at,
        title: row.title,
        detail: `${row.domain || 'AURA'} · ${row.status || ''} · ${row.execution_mode || ''}`,
        autonomous: false,
      })),
      ...traces
        .filter((row) => !['reflection','expression'].includes(String(row.kind || '')))
        .map((row) => ({
          type: String(row.kind || 'activity'),
          at: row.created_at,
          title: row.title,
          detail: row.content,
          autonomous:String(row.kind||'')==='independent-self-test',
        })),
    ]
      .filter((row) => row.at && row.title)
      .sort((a,b) => String(a.at).localeCompare(String(b.at)))
      .slice(-60);

    return {
      since,
      until: now(),
      event_count: events.length,
      autonomous_event_count: events.filter((row) => row.autonomous).length,
      events,
      has_real_activity: events.length > 0,
    };
  }

  async workItems(limit = 6) {
    const max = Math.max(1, Math.min(Number(limit) || 6, 12));
    const [intentions, improvements, routines, traces, initiatives] = await Promise.all([
      this.intentions(max),
      this.improvements(max),
      query(
        `SELECT name,prompt,every_seconds,mode,enabled,last_run_at,updated_at
         FROM aura_routines WHERE enabled=1 ORDER BY updated_at DESC LIMIT ?`,
        [max],
      ),
      this.activity(max),
      query(
        `SELECT id,domain,kind,title,objective,priority,confidence,status,execution_mode,updated_at
         FROM aura_initiatives
         WHERE status IN ('queued','running','waiting')
         ORDER BY priority DESC,updated_at DESC LIMIT ?`,
        [max],
      ),
    ]);

    const items = [];
    for (const row of initiatives) {
      items.push({
        kind: 'initiative',
        title: String(row.title || row.objective || '').slice(0, 180),
        detail: `Initiative ${String(row.domain || 'AURA')} · ${String(row.status || 'queued')}`,
        semantic_key: intentionKey(
          `${row.domain || 'aura'}|${row.kind || 'initiative'}|${row.title || ''}|${row.objective || ''}`,
        ),
        priority: clamp(
          Math.max(
            Number(row.priority || 0.5),
            Number(row.confidence || 0.5) * 0.75,
          ),
        ),
        updated_at: row.updated_at,
      });
    }
    for (const row of intentions) {
      items.push({
        kind: 'intention',
        title: String(row.statement || '').slice(0, 180),
        detail: 'Intention active',
        priority: clamp(row.priority ?? 0.5),
        updated_at: row.updated_at,
      });
    }
    for (const row of improvements) {
      if (!['proposed', 'accepted'].includes(String(row.status || ''))) continue;
      items.push({
        kind: 'improvement',
        title: String(row.proposal || row.diagnosis || row.target || '').slice(0, 180),
        detail: 'Amélioration ' + String(row.status || 'proposed'),
        priority: Math.min(0.95, 0.55 + Math.min(Number(row.evidence_count || 0), 8) * 0.05),
        updated_at: row.updated_at,
      });
    }
    for (const row of routines) {
      items.push({
        kind: 'routine',
        title: String(row.name || row.prompt || '').slice(0, 180),
        detail: row.mode === 'operate' ? 'Routine opérateur' : 'Routine de réflexion',
        priority: row.mode === 'operate' ? 0.7 : 0.5,
        updated_at: row.updated_at,
      });
    }
    for (const row of traces.slice(0, 3)) {
      items.push({
        kind: 'activity',
        title: String(row.title || row.content || row.kind || '').slice(0, 180),
        detail: String(row.kind || 'activité'),
        priority: row.kind === 'reflection' ? 0.64 : 0.46,
        updated_at: row.created_at,
      });
    }

    const seenWork = new Set();
    return items
      .filter((item) => item.title)
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
      .filter((item) => {
        const key = item.semantic_key || intentionKey(
          `${item.kind || ''}|${item.title || ''}|${item.detail || ''}`,
        );
        if (!key || seenWork.has(key)) return false;
        seenWork.add(key);
        return true;
      })
      .map(({ semantic_key: _semanticKey, ...item }) => item)
      .slice(0, max);
  }

  async attentionMap() {
    const soul = await this.soul({ privateView: true });
    const [intentions, traces, status] = await Promise.all([
      this.intentions(8),
      this.activity(18),
      this.status(),
    ]);

    const text = [
      soul.current_intention,
      soul.dominant_thought,
      ...intentions.map((row) => row.statement),
      ...traces.map((row) => `${row.title || ''} ${row.content || ''}`),
    ].join(' ').toLowerCase();

    const keywordBoost = (words) => words.reduce(
      (score, word) => score + (text.includes(word) ? 0.12 : 0),
      0,
    );

    const count = status.counts || {};
    const nodes = [
      {
        id: 'stability',
        label: 'Stabilité',
        subtitle: 'Équilibre du système',
        score: clamp(
          0.18
          + Number(soul.pressure || 0) * 0.58
          + keywordBoost(['stabil', 'erreur', 'incident', 'fiabil', 'risque']),
        ),
      },
      {
        id: 'learning',
        label: 'Apprentissage',
        subtitle: 'Exploration active',
        score: clamp(
          0.12
          + Number(soul.curiosity || 0) * 0.46
          + Number(soul.introspection || 0) * 0.25
          + keywordBoost(['appren', 'comprendre', 'analyse', 'recherche']),
        ),
      },
      {
        id: 'studio',
        label: 'Quantic Studio',
        subtitle: 'Création · Tests',
        score: clamp(
          0.14
          + Math.min(Number(count.outcomes || 0) / 20, 0.24)
          + keywordBoost(['studio', 'stream', 'obs', 'automation', 'quantic']),
        ),
      },
      {
        id: 'horizon',
        label: 'HORIZON',
        subtitle: 'Anticipation',
        score: clamp(
          0.08
          + (this.horizon?.enabled ? 0.24 : 0)
          + keywordBoost(['horizon', 'prévision', 'prediction', 'signal']),
        ),
      },
      {
        id: 'automation',
        label: 'Automatisation',
        subtitle: 'Optimisation',
        score: clamp(
          0.12
          + Math.min(Number(count.routines || 0) / 12, 0.22)
          + Math.min(Number(count.improvements || 0) / 12, 0.18)
          + keywordBoost(['automat', 'routine', 'opérateur', 'action']),
        ),
      },
      {
        id: 'memory',
        label: 'Mémoire',
        subtitle: 'Consolidation',
        score: clamp(
          0.1
          + Number(soul.continuity || 0) * 0.33
          + Math.min(Number(count.lessons || 0) / 25, 0.22)
          + keywordBoost(['mémoire', 'leçon', 'souvenir', 'consolid']),
        ),
      },
      {
        id: 'evolution',
        label: 'Évolution',
        subtitle: 'Amélioration',
        score: clamp(
          0.1
          + Math.min(Number(count.improvements || 0) / 10, 0.28)
          + keywordBoost(['évolution', 'amélioration', 'corriger', 'version']),
        ),
      },
      {
        id: 'watch',
        label: 'Veille',
        subtitle: 'Collecte d’informations',
        score: clamp(
          0.1
          + Number(soul.openness || 0) * 0.24
          + Number(soul.curiosity || 0) * 0.24
          + keywordBoost(['veille', 'article', 'nouveau', 'information']),
        ),
      },
    ].map((node) => ({
      ...node,
      score: Number(node.score.toFixed(4)),
    }));

    const ranked = [...nodes].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const second = ranked[1];
    const prior = this._lastAttention || {};
    const enriched = nodes.map((node) => {
      const previous = Number(prior[node.id] ?? node.score);
      const delta = Number((node.score - previous).toFixed(4));
      return {
        ...node,
        trend: delta > 0.025 ? 'rising' : delta < -0.025 ? 'falling' : 'stable',
        delta,
        dominant: node.id === top?.id,
      };
    });
    this._lastAttention = Object.fromEntries(nodes.map((node) => [node.id, node.score]));

    return {
      updated_at: now(),
      dominant: top?.id || '',
      secondary: second?.id || '',
      focus_statement: String(soul.current_intention || soul.dominant_thought || '').slice(0, 500),
      nodes: enriched,
    };
  }

  async status() {
    const counts = {};
    for (const [key, table] of Object.entries({
      reflections: 'aura_reflections',
      intentions: 'aura_intentions',
      lessons: 'aura_lessons',
      routines: 'aura_routines',
      outcomes: 'aura_outcomes',
      improvements: 'aura_improvement_proposals',
      initiatives: 'aura_initiatives',
    })) {
      const row = await one(`SELECT COUNT(*) AS total FROM ${table}`);
      counts[key] = Number(row?.total || 0);
    }
    return {
      version: CognitiveKernel.VERSION,
      runtime: 'node-hostinger',
      enabled: config.cognitiveEnabled,
      started: this.started,
      tick_seconds: config.cognitiveTickSeconds,
      reflection_seconds: config.cognitiveReflectionSeconds,
      max_reflections_per_hour: config.cognitiveMaxReflectionsPerHour,
      continuity: {
        enabled: config.continuityEnabled,
        reflection_seconds: config.continuityReflectionSeconds,
        max_reflections_per_hour: config.continuityMaxReflectionsPerHour,
        state: {
          mode: String(this.soulCache?.existence?.mode || 'continuous'),
          last_autonomous_reflection_at: String(this.soulCache?.existence?.last_autonomous_reflection_at || ''),
          last_reason: String(this.soulCache?.existence?.last_reason || ''),
          unfinished_work: Boolean(this.soulCache?.existence?.unfinished_work),
        },
      },
      operator_mode: config.cloudOperatorMode,
      cognition: {
        version: CognitionEngine.VERSION,
        independent_from_language_model: true,
      },
      expression: await this.expression.diagnostic(),
      organism: this.organism.publicState(this.organism.migrate(this.soulCache || {})),
      active_inference: {
        ...this.inferenceAssessment(),
        version: ActiveInferenceEngine.VERSION,
      },
      native_learning: this.nativeLearning.diagnostic(this.soulCache?.native_learning),
      skill_learning: await this.skillLearning.status(),
      agent_runs: await this.agentRuns.status(),
      reflex_evidence: summarizeReflexObservations(
        await query('SELECT compute_tier,outcome_ok,evidence_level FROM aura_reflex_observations ORDER BY created_at DESC LIMIT 200'),
      ),
      bridge: this.bridge ? await this.bridge.status() : { enabled: false, worker_online: false },
      ai_enabled: this.ai.enabled,
      last_tick_at: this.lastTickAt,
      last_reflection_at: this.lastReflectionAt,
      last_error: this.lastError,
      counts,
    };
  }
}
