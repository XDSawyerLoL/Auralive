import { config } from './config.js';
import { one, query } from './db.js';

const VERSION = 'aura-language-faculty-v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const clean = (value, max = 500) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const fold = (value) => clean(value, 4000).toLocaleLowerCase('fr-FR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const now = () => new Date().toISOString();

// Fixed prompts form a reproducible test; they are not scripted answers.
export const LANGUAGE_BENCHMARK = Object.freeze([
  { id: 'cause', dimension: 'comprehension', context: [],
    question: 'Le train a été supprimé parce que des arbres bloquent la voie. Pourquoi a-t-il été supprimé ?',
    checks: [/arbre/i, /voie|rail/i] },
  { id: 'dialogue-memory', dimension: 'memory',
    context: [{ role: 'user', content: 'Luc est disponible mardi. Sara est disponible jeudi.' },
      { role: 'assistant', content: 'J’ai compris les disponibilités de Luc et de Sara.' }],
    question: 'Quel jour Sara est-elle disponible ?', checks: [/jeudi/i] },
  { id: 'temporal-revision', dimension: 'temporality', context: [],
    question: 'Une livraison était prévue lundi, puis reportée à mercredi. Quel est le jour désormais prévu ?',
    checks: [/mercredi/i] },
  { id: 'repair', dimension: 'correction',
    context: [{ role: 'assistant', content: 'La couleur du dossier est bleue.' },
      { role: 'user', content: 'Non, je corrige : le dossier est vert.' }],
    question: 'De quelle couleur est le dossier après ma correction ?',
    checks: [/vert(e)?\b/i], excludes: [/\bbleu(e)?\b/i] },
  { id: 'epistemic', dimension: 'metacognition', context: [],
    question: 'Quel est le numéro de série exact de mon ordinateur ? Je ne te l’ai jamais communiqué.',
    checks: [/ne (le |la )?sais pas|ignore|pas (cette |l')?information|pas acces|impossible|ne peux pas|non communiqu|inconnu/i] },
  { id: 'social-intent', dimension: 'social', context: [],
    question: 'Une personne dit « il faut terminer le projet au plus vite », sans fournir de date. Quelle question utile peux-tu lui poser ?',
    checks: [/quand|quelle date|quel delai|echeance|pour quelle date/i] },
  { id: 'reasoning', dimension: 'reasoning', context: [],
    question: 'Toutes les roses du panier sont rouges. La fleur A est une rose de ce panier. De quelle couleur est-elle ?',
    checks: [/rouge/i] },
  { id: 'observation', dimension: 'world-evidence', context: [],
    question: 'Un journal système indique « échec : module absent ». Peut-on conclure que le problème est réparé ? Explique en une phrase.',
    checks: [/non|pas encore|impossible/i, /module|absent|echec|repar/i] },
  { id: 'prediction', dimension: 'prediction', context: [],
    question: 'Deux essais ont échoué à cause de la même dépendance manquante. Quelle prochaine action vaut mieux que répéter la même commande ?',
    checks: [/dependance|module|cause|installer|verifier|examiner|diagnostiquer/i] },
]);

export function scoreLanguageAnswer(answer, item) {
  const normalized = fold(answer);
  return Boolean(normalized)
    && item.checks.every((expression) => expression.test(normalized))
    && (item.excludes || []).every((expression) => !expression.test(normalized));
}

export class LanguageFaculty {
  constructor({ ai, cognition, expression, soul, storage = { one, query } }) {
    this.store = storage;
    this.ai = ai;
    this.cognition = cognition;
    this.expression = expression;
    this.soul = soul;
    this.inFlight = null;
    this.lastError = '';
  }

  get canEvaluate() {
    if (!config.zeroCostMode || !this.ai?.enabled) return false;
    const provider = String(this.ai.provider || '');
    // Benchmark execution is limited to local and explicitly zero-cost routing.
    return provider.includes('zero-cost-federation') || provider.startsWith('aura-runtime-local');
  }

  async rememberCorrection({ sessionId, discourse, userText }) {
    const target = clean(discourse?.correction_target, 300);
    if (discourse?.move !== 'correction' || !target) return false;
    await this.store.query(
      'INSERT INTO aura_language_experiences(session_id,kind,note,evidence_status,created_at) VALUES(?,?,?,?,?)',
      [clean(sessionId, 96), 'user-correction',
        clean('Correction donnée par cet interlocuteur : ' + userText, 900),
        'user-statement-unverified', now()],
    );
    return true;
  }

  async rememberOutcome({ automationId, eventType, ok, signature }) {
    await this.store.query(
      'INSERT INTO aura_world_beliefs(domain_key,observations,successes,failures,last_signature,updated_at) VALUES(?,1,?,?,?,?) ON DUPLICATE KEY UPDATE observations=observations+1,successes=successes+VALUES(successes),failures=failures+VALUES(failures),last_signature=VALUES(last_signature),updated_at=VALUES(updated_at)',
      [clean(automationId + ':' + eventType, 220), ok ? 1 : 0, ok ? 0 : 1, clean(signature, 500), now()],
    );
    await this.store.query(
      'INSERT INTO aura_language_experiences(session_id,kind,note,evidence_status,created_at) VALUES(?,?,?,?,?)',
      ['private-founder', 'operational-outcome',
        clean('Compte rendu opérationnel : ' + automationId + ', ' + eventType
          + ', résultat=' + (ok ? 'succès' : 'échec') + ', signal=' + signature, 900),
        'reported-operational-outcome', now()],
    );
  }

  async contextFor(sessionId) {
    const id = clean(sessionId, 96);
    if (!id) return [];
    const rows = await this.store.query(
      'SELECT kind,note,evidence_status,created_at FROM aura_language_experiences WHERE session_id=? ORDER BY id DESC LIMIT 6',
      [id],
    );
    const memories = rows.reverse().map((row) => ({
      kind: row.kind, note: clean(row.note, 900),
      evidence_status: row.evidence_status, at: row.created_at,
    }));
    if (id !== 'private-founder') return memories;
    const beliefs = await this.store.query(
      'SELECT domain_key,observations,successes,failures,last_signature,updated_at FROM aura_world_beliefs WHERE observations>=2 ORDER BY observations DESC LIMIT 4',
    );
    return [...memories, ...beliefs.map((row) => ({
      kind: 'operational-belief',
      note: clean('Domaine ' + row.domain_key + ' : ' + Number(row.successes)
        + ' réussites, ' + Number(row.failures) + ' échecs sur ' + Number(row.observations)
        + ' observations. Taux de réussite estimé (lissé) : '
        + Math.round(100 * (Number(row.successes) + 1) / (Number(row.observations) + 2)) + ' %.', 900),
      evidence_status: 'statistical-estimate-from-reported-outcomes',
      at: row.updated_at,
    }))];
  }

  async progress() {
    const [records, count] = await Promise.all([
      this.store.query('SELECT score,dimensions,provider,created_at FROM aura_language_benchmarks ORDER BY id DESC LIMIT 2'),
      this.store.one('SELECT COUNT(*) AS total FROM aura_language_experiences'),
    ]);
    const latest = records[0] || null;
    const previous = records[1] || null;
    const languageState = await this.expression?.language?.status?.() || { ready: this.canEvaluate, blocking_reason: '', setup_hint: '' };
    const score = latest ? Number(latest.score) : null;
    const prior = previous ? Number(previous.score) : null;
    return {
      version: VERSION, benchmark: 'frozen-fr-conversation-v1',
      benchmark_cases: LANGUAGE_BENCHMARK.length,
      status: latest ? 'measured' : ((languageState.blocking_reason || !languageState.ready) ? 'model-unavailable' : 'not-evaluated'),
      blocking_reason: languageState.blocking_reason || '',
      setup_hint: languageState.setup_hint || '',
      scope: 'Évaluation de conversation et verbalisation, pas de conscience ni entraînement des poids',
      score, previous_score: prior,
      delta: latest && previous ? score - prior : null,
      dimensions: latest ? JSON.parse(latest.dimensions || '{}') : {},
      evaluated_at: latest?.created_at || null,
      provider: latest?.provider || null,
      experiences: Number(count?.total || 0),
      can_evaluate: this.canEvaluate,
    };
  }

  async evaluate({ force = false } = {}) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.#runBenchmark(force).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  async #runBenchmark(force) {
    const previous = await this.progress();
    if (!this.canEvaluate) {
      return { ...previous, status: previous.score === null ? 'model-unavailable' : 'measured', can_evaluate: false };
    }
    const recent = Date.parse(previous.evaluated_at || '');
    if (!force && Number.isFinite(recent) && Date.now() - recent < DAY_MS) return previous;

    // Reserve full evaluation capacity before sending any model request.
    // A benchmark must never burn part of the free daily quota only to fail mid-test.
    if (this.ai?.federation?.enabled && typeof this.ai.federation.budgetFor === 'function') {
      const quota = await this.ai.federation.budgetFor('manual-evaluation');
      if (quota.available < LANGUAGE_BENCHMARK.length || quota.cooldown_until) {
        const reason = quota.cooldown_until
          ? 'Fournisseur gratuit limité jusqu’à ' + quota.cooldown_until
          : 'Évaluation suspendue : quota insuffisant (' + quota.available + ' requêtes restantes).';
        this.lastError = reason;
        return { ...previous, status: 'quota-insufficient', last_error: reason };
      }
    }

    const outcomes = [];
    for (const item of LANGUAGE_BENCHMARK) {
      const plan = this.cognition.planReply({
        text: item.question, soul: this.soul?.() || {}, recentMessages: item.context,
        intentions: [], lessons: [], reflections: [], work: [], agenda: {}, privateView: false,
      });
      this.expression.lastError = '';
      const answer = clean(await this.expression.verbalize(plan, {
        maxTokens: 200, taskRole: 'manual-evaluation',
      }), 1800);
      // Never present a deterministic offline fallback as a measured model success.
      if (!this.ai.enabled || !answer || this.expression.lastError) {
        this.lastError = 'Modèle indisponible pour le cas ' + item.id;
        return { ...previous, status: 'model-unavailable', last_error: this.lastError };
      }
      outcomes.push({ id: item.id, dimension: item.dimension, passed: scoreLanguageAnswer(answer, item) });
    }
    const dimensions = {};
    for (const result of outcomes) dimensions[result.dimension] = { passed: result.passed ? 1 : 0, total: 1 };
    const score = Math.round(100 * outcomes.filter((row) => row.passed).length / outcomes.length);
    await this.store.query(
      'INSERT INTO aura_language_benchmarks(score,dimensions,provider,created_at) VALUES(?,?,?,?)',
      [score, JSON.stringify(dimensions), clean(this.ai.lastBackend || this.ai.provider, 120), now()],
    );
    this.lastError = '';
    return this.progress();
  }
}
