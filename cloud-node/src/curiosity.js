import { config } from './config.js';
import { one, query } from './db.js';

const now = () => new Date().toISOString();

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '');
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeQuestion(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return /[?？]$/.test(text) ? text.slice(0, 1000) : (text.slice(0, 999) + '?');
}

function requiresFreshWeb(question) {
  const text = String(question || '').toLowerCase();
  return [
    'récent','recent','nouveau','nouvelle','aujourd','actuel','actuelle','internet','web',
    'concurrent','technologie','standard','norme','version','release','marché','marche',
    'source','benchmark','documentation','tendance','sécurité','securite',
  ].some((token) => text.includes(token));
}

function ageMs(iso) {
  const ms = Date.parse(String(iso || ''));
  return Number.isFinite(ms) ? Date.now() - ms : Infinity;
}

function explicitUserIntent(text) {
  return /\b(je veux|je souhaite|j'aimerais|j’aimerais|je trouve|je pense|mon objectif|ma priorité|important|doit|devrait|il faut)\b/i
    .test(String(text || ''));
}

export class CuriosityEngine {
  static VERSION = 'aura-curiosity-engine-v1';

  constructor({ kernel, webSubstrate, commandCenter, ai }) {
    this.kernel = kernel;
    this.webSubstrate = webSubstrate;
    this.commandCenter = commandCenter;
    this.ai = ai;
    this.started = false;
    this.timer = null;
    this.warmupTimer = null;
    this.running = false;
    this.lastRunAt = '';
    this.lastResearchAt = '';
    this.lastQuestionAt = '';
    this.lastError = '';
    this.totalQuestions = 0;
    this.totalResearch = 0;
  }

  async start() {
    this.started = true;
    if (!config.curiosityEnabled) return;
    const run = () => this.runCycle('ambient')
      .catch((error) => { this.lastError = String(error?.message || error).slice(0, 800); });
    this.warmupTimer = setTimeout(run, config.curiosityWarmupSeconds * 1000);
    this.timer = setInterval(run, config.curiosityTickSeconds * 1000);
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

  async recentQuestions(limit = 30, target = '') {
    const max = Math.max(1, Math.min(Number(limit) || 30, 100));
    const rows = target
      ? await query(
        `SELECT id,title,content,context,created_at FROM aura_cognitive_traces
         WHERE kind='curiosity-question' AND JSON_UNQUOTE(JSON_EXTRACT(context,'$.target'))=?
         ORDER BY id DESC LIMIT ?`,
        [String(target).slice(0, 40), max],
      ).catch(() => [])
      : await query(
        `SELECT id,title,content,context,created_at FROM aura_cognitive_traces
         WHERE kind='curiosity-question' ORDER BY id DESC LIMIT ?`,
        [max],
      );
    return rows.map((row) => ({
      ...row,
      context: parseJson(row.context, {}),
    }));
  }

  async countQuestionsLastHour(target = '') {
    const threshold = new Date(Date.now() - 3600_000).toISOString();
    if (!target) {
      const row = await one(
        `SELECT COUNT(*) AS total FROM aura_cognitive_traces
         WHERE kind='curiosity-question' AND created_at>=?`,
        [threshold],
      );
      return Number(row?.total || 0);
    }
    const rows = await this.recentQuestions(100, target);
    return rows.filter((row) => String(row.created_at || '') >= threshold).length;
  }

  async seenRecently(question, hours = 24) {
    const threshold = new Date(Date.now() - hours * 3600_000).toISOString();
    return Boolean(await one(
      `SELECT id FROM aura_cognitive_traces
       WHERE kind='curiosity-question' AND content=? AND created_at>=? LIMIT 1`,
      [normalizeQuestion(question), threshold],
    ));
  }

  async persistQuestion(question, {
    target = 'system',
    domain = 'aura',
    priority = 0.5,
    reason = '',
    source = 'curiosity',
    autoResearch = false,
  } = {}) {
    const normalized = normalizeQuestion(question);
    if (!normalized || await this.seenRecently(normalized)) return null;
    const context = {
      target: String(target).slice(0, 40),
      domain: String(domain).slice(0, 80),
      priority: clamp(priority),
      reason: String(reason || '').slice(0, 1200),
      source: String(source || 'curiosity').slice(0, 80),
      auto_research: Boolean(autoResearch),
      engine: CuriosityEngine.VERSION,
    };
    await this.kernel.trace(
      'curiosity-question',
      `Curiosité · ${context.target} · ${context.domain}`,
      normalized,
      context,
    );
    this.lastQuestionAt = now();
    this.totalQuestions += 1;
    return { question: normalized, ...context };
  }

  async generateInterlocutorQuestion(userText) {
    const content = String(userText || '').replace(/\s+/g, ' ').trim().slice(0, 5000);
    if (!content || !explicitUserIntent(content)) return '';
    if (await this.countQuestionsLastHour('interlocutor') >= config.curiosityMaxInterlocutorQuestionsPerHour) return '';

    if (this.ai?.enabled) {
      try {
        const answer = await this.ai.generate(
          `Message explicite de l'interlocuteur:\n${content}\n\nFormule UNE question de curiosité courte, naturelle et utile en français. Elle doit uniquement approfondir ce que l'interlocuteur a explicitement dit. N'infère aucune information sensible. Ne pose pas une question si le message est déjà totalement opérationnel. Retourne uniquement la question ou une chaîne vide.`,
          'Tu es le moteur de curiosité d’AURA. Tu aides AURA à comprendre son interlocuteur sans l’interroger inutilement ni inférer de données sensibles.',
          120,
          'conversation',
        );
        const candidate = normalizeQuestion(answer);
        if (candidate && candidate.length <= 360) return candidate;
      } catch {}
    }

    if (/\b(objectif|priorité|priorite|important|doit|devrait|il faut)\b/i.test(content)) {
      return 'Quel résultat concret veux-tu qu’AURA utilise comme critère de réussite sur ce point ?';
    }
    return 'Qu’est-ce que tu veux qu’AURA observe ou mesure pour savoir qu’elle progresse réellement sur ce point ?';
  }

  async questionForInteraction(userText) {
    const question = await this.generateInterlocutorQuestion(userText);
    if (!question) return null;
    return this.persistQuestion(question, {
      target: 'interlocutor',
      domain: 'conversation',
      priority: 0.72,
      reason: 'Approfondir une intention explicitement formulée par l’interlocuteur.',
      source: 'interaction',
    });
  }

  async buildCandidates() {
    const [services, intentions, recentMessages, surprises] = await Promise.all([
      this.commandCenter.services(),
      this.kernel.intentions(10),
      query(
        `SELECT author,content,created_at FROM aura_cloud_messages
         WHERE role='user' ORDER BY id DESC LIMIT 8`,
      ).catch(() => []),
      query(
        `SELECT kind,content,surprise,created_at FROM aura_surprise_memory
         ORDER BY id DESC LIMIT 8`,
      ).catch(() => []),
    ]);

    const candidates = [];

    for (const service of services) {
      if (!service.enabled) continue;
      const state = String(service.state || 'unknown').toLowerCase();
      const stale = ageMs(service.last_observed_at) > config.curiosityProductStaleSeconds * 1000;
      if (['error','failed','degraded','offline','stale','blocked'].includes(state)) {
        candidates.push({
          question: `Pourquoi ${service.name} est dans l'état ${state}, quelle cause mesurable l'explique et quelle vérification réversible permet de le confirmer`,
          target: 'system',
          domain: service.id,
          priority: Math.min(0.98, 0.74 + Number(service.criticality || 0.5) * 0.20),
          reason: service.state_detail || 'État produit dégradé.',
        });
      } else if (stale) {
        candidates.push({
          question: `Quel est l'état réel actuel de ${service.name}, quelles capacités expose-t-il à AURA et quelles capacités restent inutilisées`,
          target: 'system',
          domain: service.id,
          priority: 0.68,
          reason: 'Observation produit absente ou ancienne.',
        });
      } else {
        candidates.push({
          question: `Quelles capacités de ${service.name} AURA pourrait-elle exploiter ou améliorer sans dupliquer une fonction déjà présente ailleurs dans Quantic`,
          target: 'system',
          domain: service.id,
          priority: 0.54,
          reason: 'Recherche d’intégration inter-produit.',
        });
      }
    }

    const topIntention = intentions[0];
    if (topIntention) {
      candidates.push({
        question: `Quelles informations récentes, sources indépendantes ou nouvelles techniques pourraient invalider, améliorer ou accélérer cette intention : ${String(topIntention.statement || '').slice(0, 500)}`,
        target: 'web',
        domain: String(parseJson(topIntention.context, {})?.domain || 'aura'),
        priority: Math.min(0.92, Math.max(0.66, Number(topIntention.priority || 0.5) + 0.08)),
        reason: 'Une intention active doit être confrontée au monde extérieur.',
        autoResearch: true,
      });
    }

    const surprise = surprises.find((row) => Number(row.surprise || 0) >= 0.62);
    if (surprise) {
      candidates.push({
        question: `Qu'est-ce qui explique ce signal surprenant dans AURA et quelle hypothèse simple permettrait de le tester : ${String(surprise.content || surprise.kind || '').slice(0, 420)}`,
        target: 'system',
        domain: 'aura',
        priority: Math.min(0.9, 0.58 + Number(surprise.surprise || 0) * 0.25),
        reason: 'Événement à forte surprise mathématique.',
      });
    }

    const lastMessage = recentMessages[0]?.content || '';
    if (explicitUserIntent(lastMessage)) {
      const q = await this.generateInterlocutorQuestion(lastMessage);
      if (q) {
        candidates.push({
          question: q,
          target: 'interlocutor',
          domain: 'conversation',
          priority: 0.70,
          reason: 'Une intention explicite mérite parfois une question de clarification.',
        });
      }
    }

    candidates.push({
      question: 'Quelles évolutions techniques récentes pourraient améliorer AURA, son Web Substrate, son Mesh, son routage de modèles ou sa sécurité sans augmenter sa dépendance à une plateforme centrale',
      target: 'web',
      domain: 'aura-rd',
      priority: 0.64,
      reason: 'Veille technique autonome permanente.',
      autoResearch: true,
    });

    return candidates.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  }

  async researchQuestion(item) {
    if (!item?.question || !this.webSubstrate?.enabled) return null;
    const webCountRow = await one(
      `SELECT COUNT(*) AS total FROM aura_cognitive_traces
       WHERE kind='curiosity-research' AND created_at>=?`,
      [new Date(Date.now() - 3600_000).toISOString()],
    );
    if (Number(webCountRow?.total || 0) >= config.curiosityMaxWebResearchPerHour) return null;

    const result = await this.webSubstrate.research(item.question, { trigger: 'curiosity' });
    await this.kernel.trace(
      'curiosity-research',
      `Recherche curieuse · ${item.domain || 'aura'}`,
      String(result?.conclusion || '').slice(0, 4000),
      {
        question: item.question,
        session_id: result?.session_id || '',
        epistemic_status: result?.epistemic_status || 'unverified',
        confidence: Number(result?.confidence || 0),
        evidence_count: Number(result?.evidence_count || 0),
      },
    );
    this.lastResearchAt = now();
    this.totalResearch += 1;

    if (
      Number(item.priority || 0) >= 0.72
      && Number(result?.evidence_count || 0) >= 2
      && ['corroborated','partially-supported'].includes(String(result?.epistemic_status || ''))
    ) {
      const existing = await query(
        `SELECT id,statement FROM aura_intentions
         WHERE status='active' AND source='curiosity' ORDER BY updated_at DESC LIMIT 20`,
      );
      const needle = String(item.question).slice(0, 120).toLowerCase();
      const duplicate = existing.some((row) => String(row.statement || '').toLowerCase().includes(needle));
      if (!duplicate) {
        await this.kernel.addIntention(
          `Évaluer et exploiter si utile cette découverte issue de la curiosité AURA : ${item.question}`,
          {
            priority: Math.min(0.82, Number(item.priority || 0.7)),
            source: 'curiosity',
            context: {
              domain: item.domain || 'aura',
              research_session_id: result?.session_id || '',
              epistemic_status: result?.epistemic_status || '',
              evidence_count: Number(result?.evidence_count || 0),
            },
          },
        );
      }
    }

    return result;
  }

  async runCycle(trigger = 'manual') {
    if (!config.curiosityEnabled) return { ok: false, skipped: true, reason: 'curiosity disabled' };
    if (this.running) return { ok: true, skipped: true, reason: 'curiosity cycle already running' };
    this.running = true;
    try {
      const used = await this.countQuestionsLastHour();
      const slots = Math.max(0, config.curiosityMaxQuestionsPerHour - used);
      if (!slots) return { ok: true, skipped: true, reason: 'curiosity hourly budget reached' };

      const candidates = await this.buildCandidates();
      const created = [];
      const researched = [];
      for (const candidate of candidates) {
        if (created.length >= Math.min(slots, config.curiosityQuestionsPerCycle)) break;
        const saved = await this.persistQuestion(candidate.question, candidate);
        if (!saved) continue;
        created.push(saved);
        if (
          candidate.autoResearch
          && requiresFreshWeb(candidate.question)
          && researched.length < config.curiosityResearchPerCycle
        ) {
          try {
            const result = await this.researchQuestion(saved);
            if (result) researched.push({
              question: saved.question,
              session_id: result.session_id || '',
              epistemic_status: result.epistemic_status || 'unverified',
              confidence: Number(result.confidence || 0),
            });
          } catch (error) {
            await this.kernel.trace(
              'curiosity-research-error',
              'Recherche curieuse indisponible',
              String(error?.message || error).slice(0, 1200),
              { question: saved.question },
            );
          }
        }
      }

      this.lastRunAt = now();
      this.lastError = '';
      return { ok: true, trigger, created, researched };
    } catch (error) {
      this.lastError = String(error?.message || error).slice(0, 800);
      throw error;
    } finally {
      this.running = false;
    }
  }

  async status() {
    const [hourQuestions, questions] = await Promise.all([
      this.countQuestionsLastHour(),
      this.recentQuestions(8),
    ]);
    return {
      version: CuriosityEngine.VERSION,
      enabled: config.curiosityEnabled,
      started: this.started,
      running: this.running,
      tick_seconds: config.curiosityTickSeconds,
      questions_per_cycle: config.curiosityQuestionsPerCycle,
      max_questions_per_hour: config.curiosityMaxQuestionsPerHour,
      max_web_research_per_hour: config.curiosityMaxWebResearchPerHour,
      last_run_at: this.lastRunAt,
      last_question_at: this.lastQuestionAt,
      last_research_at: this.lastResearchAt,
      last_error: this.lastError,
      total_questions_runtime: this.totalQuestions,
      total_research_runtime: this.totalResearch,
      questions_last_hour: hourQuestions,
      recent_questions: questions,
    };
  }
}
