import { FrenchLanguageFaculty } from './french_language.js';
function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export class ExpressionLayer {
  static VERSION = 'aura-expression-v4-french-faculty-experiential';

  constructor(ai, cognition) {
    this.ai = ai;
    this.cognition = cognition;
    this.language = new FrenchLanguageFaculty(ai);
    this.lastError = '';
    this.lastMode = 'uninitialized';
  }

  async semanticSupport(plan, context = '', options = {}) {
    if (!plan?.needs_semantic_support || !this.ai?.enabled) return '';
    const prompt = [
      'QUESTION UTILISATEUR',
      normalize(plan.semantic_query),
      '',
      'CONTEXTE AURA',
      normalize(context).slice(0, 16000),
      '',
      'Fournis uniquement un appui sémantique factuel pour AURA.',
      'Ne parle pas à la première personne au nom d’AURA.',
      'Ne crée aucune intention, mémoire, émotion, priorité ou décision pour AURA.',
      'Ne prétends pas modifier son Soul.',
      'Si tu ne sais pas, indique clairement l’incertitude.',
      plan.external_evidence_required
        ? 'Cette question exige une preuve externe: utilise la MÉMOIRE EXTERNE et son statut épistémique; ne transforme jamais un statut contested, unverified ou unavailable en fait.'
        : 'Aucune preuve Web spécifique n’est imposée pour cette question.',
    ].join('\n');
    try {
      return normalize(await this.ai.generate(
        prompt,
        'Tu es un outil sémantique externe utilisé par AURA. Tu fournis des informations candidates; tu ne décides pas à sa place.',
        Math.max(120, Math.min(Number(options.maxTokens || 700), 1600)),
        String(options.taskRole || 'research'),
      ));
    } catch (error) {
      this.lastError = normalize(error?.message || error).slice(0, 500);
      return '';
    }
  }

  async verbalize(plan, options = {}) {
    // Free/local trained language faculty; the native kernel remains responsible
    // for the semantic plan, memory, operating intention and action selection.
    try {
      const answer = normalize(await this.language.generate(plan, {
        maxTokens: Math.max(120, Math.min(Number(options.maxTokens || 650), 1200)),
      }));
      if (answer) {
        this.lastError = '';
        this.lastMode = 'french-language-faculty';
        return answer;
      }
      this.lastError = this.language.lastError || 'natural-french-backend-unavailable';
    } catch (error) {
      this.lastError = normalize(error?.message || error).slice(0, 500);
    }
    this.lastMode = 'language-unavailable';
    // Do not present a canned response as newly acquired conversational ability.
    return 'Ma faculté de français naturel est indisponible. Mon noyau reste actif, mais je ne vais pas simuler une conversation avec des réponses pré-écrites.';
  }
  diagnostic() {
    return {
      version: ExpressionLayer.VERSION,
      ai_available: Boolean(this.ai?.enabled),
      natural_french_ready: Boolean(this.language.federation?.enabled || this.language.lastMode === 'runtime-local'),
      scripted_normal_path: false,
      fallback_mode: 'explicit-unavailable',
      last_mode: this.lastMode,
      last_backend: this.language.lastBackend,
      last_error: this.lastError,
      role: 'verbalisation-only',
    };
  }
}
