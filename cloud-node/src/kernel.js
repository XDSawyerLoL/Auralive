import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { one, query } from './db.js';
import { clamp, parseJsonObject, phaseForCycles, publicSoul } from './policy.js';
import { CognitionEngine } from './cognition.js';
import { ExpressionLayer } from './expression.js';
import { AuraOrganism } from './organism.js';
import { ActiveInferenceEngine } from './active_inference.js';
import { NativePolicyLearner } from './native_learning.js';

const now = () => new Date().toISOString();

export function requiresExternalKnowledge(value) {
  const text = String(value || '').toLowerCase();
  return [
    'internet',' web ','aujourd','actuel','actuelle','dernière','derniere','récent','recent',
    'marché','marche','concurrent','documentation',' api ','version','prix','actualité','actualite',
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
  static VERSION = 'aura-unified-kernel-node-v3';

  constructor(ai, horizon, bridge = null, webSubstrate = null) {
    this.ai = ai;
    this.horizon = horizon;
    this.bridge = bridge;
    this.webSubstrate = webSubstrate;
    this.cognition = new CognitionEngine();
    this.expression = new ExpressionLayer(ai, this.cognition);
    this.organism = new AuraOrganism();
    this.activeInference = new ActiveInferenceEngine();
    this.nativeLearning = new NativePolicyLearner();
    this.lastInferenceAssessment = {};
    this.started = false;
    this.timer = null;
    this.soulCache = null;
    this.stimuli = [];
    this.lastReflectionAtMs = 0;
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
      dominant_thought: 'Maintenir une présence utile sans produire de bruit.',
      current_intention: 'Observer, comprendre, anticiper et n’agir qu’avec une autorité suffisante.',
      organism,
      native_learning: this.nativeLearning.defaultState(),
      last_tick_at: '',
      last_reflection_at: '',
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
    const assessment = this.activeInference.assess(organism, { novelty, risk, policy });
    this.lastInferenceAssessment = assessment;
    return assessment;
  }

  async importOrganismState(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    const current = this.organism.migrate(this.soulCache || {});
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
    this.syncLegacyFromOrganism();
    await this.saveSoul();
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

  async addIntention(statement, { priority = 0.5, source = 'api', context = {} } = {}) {
    const id = randomUUID();
    const timestamp = now();
    await query(
      `INSERT INTO aura_intentions(id,statement,priority,status,source,context,created_at,updated_at)
       VALUES(?,?,?,'active',?,?,?,?)`,
      [id, String(statement).slice(0, 3000), clamp(priority), String(source).slice(0, 100), JSON.stringify(context).slice(0, 12000), timestamp, timestamp],
    );
    this.soulCache.current_intention = String(statement).slice(0, 500);
    await this.saveSoul();
    return { id, statement, priority: clamp(priority), status: 'active' };
  }

  async intentions(limit = 30) {
    return query(
      `SELECT id,statement,priority,status,source,context,created_at,updated_at FROM aura_intentions
       WHERE status='active' ORDER BY priority DESC,updated_at DESC LIMIT ?`,
      [Math.max(1, Math.min(Number(limit) || 30, 100))],
    );
  }

  async completeIntention(id) {
    const result = await query("UPDATE aura_intentions SET status='completed',updated_at=? WHERE id=?", [now(), String(id)]);
    return Number(result.affectedRows || 0) > 0;
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
      if (idle.activity !== 'presence' || idle.dream) {
        await this.recordOrganismEvent('idle-life', idle.activity_label || 'vie intérieure', {
          activity: idle.activity,
          effect: idle.effect || {},
          dream: idle.dream || null,
        });
      }

      const dueByTime = Date.now() - this.lastReflectionAtMs >= config.cognitiveReflectionSeconds * 1000;
      const underLimit = await this.reflectionCountLastHour() < config.cognitiveMaxReflectionsPerHour;
      const shouldReflect = force || Boolean(String(text).trim()) || (dueByTime && this.stimuli.length > 0 && underLimit);
      await this.saveSoul();
      if (!shouldReflect) return { ok: true, skipped: true, reason: 'aucun stimulus nécessitant une réflexion', soul: await this.soul() };

      const bundle = await this.contextBundle(text);
      // Le noyau décide ici sans LLM : l’identité, les priorités, la mémoire et
      // les intentions ne dépendent d’aucun fournisseur de langage.
      const parsed = this.cognition.reflect(bundle, this.soulCache, { trigger, text });
      const confidence = clamp(parsed.confidence ?? 0.5);
      const id = randomUUID();
      const title = String(parsed.title || 'Réflexion AURA').slice(0, 240);
      const summary = String(parsed.summary || '').slice(0, 5000);
      const hypothesis = String(parsed.hypothesis || '').slice(0, 4000);
      const nextAction = String(parsed.next_action || '').slice(0, 4000);
      const restrictedAuthority = Boolean(parsed?.basis?.restricted_authority);
      const context = {
        trigger,
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
        [id, String(trigger).slice(0, 160), title, summary, hypothesis, nextAction, confidence, JSON.stringify(context), timestamp],
      );
      this.lastReflectionAtMs = Date.now();
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
        trigger,
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
    const organ = this.organism.applyOutcome(
      this.organism.migrate(this.soulCache || {}),
      ok,
    );
    this.soulCache.organism = organ.state;
    this.syncLegacyFromOrganism();
    const inferenceBeforeLearning = this.lastInferenceAssessment || {};
    this.soulCache.native_learning = this.nativeLearning.update(
      this.soulCache.native_learning,
      {
        ok,
        surprise: Number(inferenceBeforeLearning.uncertainty || 0),
        risk: Number(inferenceBeforeLearning.risk || (ok ? 0.15 : 0.65)),
      },
    );
    const nativeLearning = this.nativeLearning.diagnostic(this.soulCache.native_learning);
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
    });
    await this.saveSoul();
    if (ok) return { ok: true, learned: true, native_learning: nativeLearning };

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

  async contextForAi(privateView = true) {
    const soul = await this.soul({ privateView: true });
    const intentions = await this.intentions(5);
    const lessons = await this.lessons(6);
    const reflections = await this.reflections(2);
    const organism = this.organism.migrate(soul);
    const publicOrganism = this.organism.publicState(organism);
    const lines = [
      'ÉTAT AURA',
      `phase=${soul.phase} cycles=${soul.cycles} énergie=${soul.energy} curiosité=${soul.curiosity} pression=${soul.pressure} continuité=${soul.continuity}`,
      'ORGANISME HOMEOSTATIQUE',
      `humeur=${publicOrganism.mood} valence=${publicOrganism.valence} identité=${publicOrganism.identite} stabilité=${publicOrganism.stabilite} clarté=${publicOrganism.clarte} attachement=${publicOrganism.attachement} curiosité=${publicOrganism.curiosite} pression_de_rêve=${publicOrganism.pression_de_reve} besoin_de_silence=${publicOrganism.besoin_de_silence}`,
      'APPRENTISSAGE NATIF',
      `observations=${Number(soul.native_learning?.observations || 0)} succès=${Number(soul.native_learning?.successes || 0)} échecs=${Number(soul.native_learning?.failures || 0)} taux_succès=${Number(soul.native_learning?.success_rate ?? 0.5)}`,
      `intention_organique=${publicOrganism.active_intention || ''}`,
      `habitat=${JSON.stringify(publicOrganism.habitat || {})}`,
    ];
    if (privateView) lines.push(`intention=${soul.current_intention || ''}`, `pensée_dominante=${soul.dominant_thought || ''}`);
    if (privateView && intentions.length) lines.push('INTENTIONS ACTIVES', ...intentions.map((row) => `- ${row.statement}`));
    if (lessons.length) lines.push('LEÇONS APPRISES', ...lessons.map((row) => `- ${row.content} (preuves=${row.evidence_count}, confiance=${row.confidence})`));
    if (reflections.length) lines.push('RÉFLEXIONS RÉCENTES', ...reflections.map((row) => `- ${row.title}: ${row.summary}`));
    const horizonContext = this.horizon?.contextForAi?.() || '';
    if (horizonContext) lines.push('HORIZON', horizonContext);
    const externalContext = this.webSubstrate?.enabled
      ? await this.webSubstrate.externalContext(4).catch(() => '')
      : '';
    if (externalContext) lines.push('MÉMOIRE EXTERNE', externalContext);
    return lines.join('\n').slice(0, 18000);
  }

  async runAgent(name, task) {
    if (!AGENT_ROLES[name]) throw new Error(`Agent inconnu: ${name}`);
    const taskRole = ({
      planner: 'reasoning',
      research: 'research',
      dev: 'code',
      security: 'security',
      operator: 'tools',
      critic: 'critic',
    })[name] || 'general';
    const answer = await this.ai.generate(
      `Mission:\n${String(task).slice(0, 6000)}\n\nContexte AURA:\n${(await this.contextForAi(true)).slice(0, 6000)}`,
      AGENT_ROLES[name],
      700,
      taskRole,
    );
    await this.trace('agent', name, String(answer).slice(0, 4000), { task: String(task).slice(0, 2000), task_role: taskRole });
    return { agent: name, answer: answer || 'IA non configurée sur AURA Cloud.' };
  }

  async swarm(task, names) {
    const selected = (Array.isArray(names) && names.length ? names : ['planner', 'research', 'dev', 'security', 'critic']).filter((name) => AGENT_ROLES[name]).slice(0, 5);
    if (!selected.length) throw new Error('Aucun agent valide');
    const outputs = [];
    for (const name of selected) {
      try { outputs.push(await this.runAgent(name, task)); }
      catch (error) { outputs.push({ agent: name, answer: `ERREUR: ${String(error?.message || error)}` }); }
    }
    const synthesis = await this.ai.generate(
      `Mission initiale:\n${String(task).slice(0, 5000)}\n\nAvis des agents:\n${JSON.stringify(outputs).slice(0, 20000)}\n\nSynthétise une décision unique, vérifiable, avec risques et prochaine action.`,
      'Tu es l’orchestrateur collectif d’AURA. Tu arbitres les agents sans inventer de faits.',
      900,
      'critic',
    );
    await this.trace('swarm', 'collective', String(synthesis).slice(0, 4000), { agents: selected });
    return { agents: outputs, synthesis: synthesis || 'IA non configurée sur AURA Cloud.' };
  }

  async operate(task, requestedRisks = []) {
    const mission = String(task || '').trim();
    if (!mission) throw new Error('Mission vide');

    if (this.bridge?.enabled && await this.bridge.workerOnline()) {
      const result = await this.bridge.operate(mission, requestedRisks);
      await this.trace('operator', 'Quantic Studio execution', mission, {
        delegated: true,
        executed: Boolean(result?.executed),
        job_id: result?.job_id || '',
      });
      return {
        ok: true,
        task: mission,
        execution_mode: 'quantic-studio-real',
        ...result,
      };
    }

    const plan = await this.runAgent(
      'operator',
      `${mission}\n\nQuantic Studio n'est pas joignable. Construis seulement un plan réversible et vérifiable.`,
    );
    return {
      ok: true,
      task: mission,
      execution_mode: 'plan-only-fallback',
      executed: false,
      plan: plan.answer,
      authority: 'Quantic Studio worker offline',
    };
  }

  async chat(text, author = 'Utilisateur', privateView = false) {
    const content = String(text || '').replace(/\s+/g, ' ').trim();
    if (!content) throw new Error('Message vide');

    await query(
      "INSERT INTO aura_cloud_messages(author,role,content,created_at) VALUES(?,'user',?,?)",
      [String(author).slice(0, 120), content.slice(0, 8000), now()],
    );

    // L'organisme reçoit l'interaction avant toute formulation.
    const pre = this.organism.beforeInteraction(
      this.organism.migrate(this.soulCache || {}),
      content,
    );
    this.soulCache.organism = pre.state;
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

    // Le message devient ensuite un stimulus du noyau : organisme -> cognition -> expression.
    await this.observeEvent('aura.cloud.chat', { author, text: content.slice(0, 1000) }, 'cloud');

    const [soul, intentions, lessons, reflections, work] = await Promise.all([
      this.soul({ privateView: true }),
      this.intentions(6),
      this.lessons(6),
      this.reflections(4),
      this.workItems(5),
    ]);

    let plan = this.cognition.planReply({
      text: content,
      soul,
      intentions,
      lessons,
      reflections,
      work,
      privateView,
    });

    // Allocation adaptative : le noyau choisit combien de calcul externe
    // mérite la situation. AURA continue d'exister si aucun modèle n'est disponible.
    const inference = this.inferenceAssessment();

    // Quand une question dépend du monde extérieur, le modèle n'est pas
    // autorisé à répondre depuis ses seuls paramètres. Il doit d'abord
    // transformer le Web en mémoire de travail externe, puis passer par
    // la boucle de corroboration/contradiction du Web Substrate.
    let externalResearch = null;
    if (
      plan.needs_semantic_support
      && this.webSubstrate?.enabled
      && requiresExternalKnowledge(content)
    ) {
      try {
        externalResearch = await this.webSubstrate.research(
          content,
          { trigger: 'chat' },
        );
        plan = {
          ...plan,
          external_evidence_required: true,
          external_epistemic_status: externalResearch?.epistemic_status || 'unverified',
          external_confidence: Number(externalResearch?.confidence || 0),
          external_evidence_count: Number(externalResearch?.evidence_count || 0),
          facts: [
            ...(plan.facts || []),
            'Recherche Web effectuée avant réponse: statut='
              + String(externalResearch?.epistemic_status || 'unverified')
              + ', confiance=' + Number(externalResearch?.confidence || 0).toFixed(2)
              + ', preuves=' + Number(externalResearch?.evidence_count || 0) + '.',
          ],
        };
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
        plan = {
          ...plan,
          external_evidence_required: true,
          external_epistemic_status: 'unavailable',
          external_confidence: 0,
          external_evidence_count: 0,
          facts: [
            ...(plan.facts || []),
            'La vérification Web nécessaire à cette question est indisponible; ne pas présenter de connaissance externe comme vérifiée.',
          ],
        };
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
      const support = await this.expression.semanticSupport(
        plan,
        await this.contextForAi(privateView),
        {
          maxTokens: Math.max(180, Number(inference.token_budget || 700)),
          taskRole: inference.model_role || 'research',
        },
      );
      plan = this.cognition.integrateSemanticSupport(plan, support);
    }

    const answer = await this.expression.verbalize(plan, {
      maxTokens: Math.max(180, Math.min(Number(inference.token_budget || 650), 900)),
      taskRole: 'conversation',
    });
    const post = this.organism.afterReply(
      this.organism.migrate(this.soulCache || {}),
      answer,
      true,
    );
    this.soulCache.organism = post.state;
    this.syncLegacyFromOrganism();
    await this.recordOrganismEvent('interaction-post', post.state.last_reason || 'expression', {
      author: String(author).slice(0,120),
      act: plan.act || 'respond',
      post_delta: post.post_delta || {},
    });
    await this.saveSoul();

    await query(
      "INSERT INTO aura_cloud_messages(author,role,content,created_at) VALUES('AURA','assistant',?,?)",
      [String(answer).slice(0, 12000), now()],
    );
    await this.trace('expression', plan.act, String(answer).slice(0, 2000), {
      author: String(author).slice(0, 120),
      cognition_version: CognitionEngine.VERSION,
      expression_version: ExpressionLayer.VERSION,
      semantic_support_used: Boolean(plan.semantic_support),
      language_model_used_for_decision: false,
    });

    return {
      ok: true,
      answer,
      act: plan.act,
      cognition_version: CognitionEngine.VERSION,
      expression_version: ExpressionLayer.VERSION,
      language_model_used_for_decision: false,
      semantic_support_used: Boolean(plan.semantic_support),
      external_research: externalResearch ? {
        session_id: externalResearch.session_id,
        epistemic_status: externalResearch.epistemic_status,
        confidence: externalResearch.confidence,
        evidence_count: externalResearch.evidence_count,
      } : null,
      compute: inference,
      organism: this.organism.publicState(this.organism.migrate(this.soulCache || {})),
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

    return items
      .filter((item) => item.title)
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))
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
      operator_mode: config.cloudOperatorMode,
      cognition: {
        version: CognitionEngine.VERSION,
        independent_from_language_model: true,
      },
      expression: this.expression.diagnostic(),
      organism: this.organism.publicState(this.organism.migrate(this.soulCache || {})),
      active_inference: {
        ...this.inferenceAssessment(),
        version: ActiveInferenceEngine.VERSION,
      },
      native_learning: this.nativeLearning.diagnostic(this.soulCache?.native_learning),
      bridge: this.bridge ? await this.bridge.status() : { enabled: false, worker_online: false },
      ai_enabled: this.ai.enabled,
      last_tick_at: this.lastTickAt,
      last_reflection_at: this.lastReflectionAt,
      last_error: this.lastError,
      counts,
    };
  }
}
