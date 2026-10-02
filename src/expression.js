function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export class ExpressionLayer {
  static VERSION = 'aura-expression-v3-native-authority';

  constructor(ai, cognition) {
    this.ai = ai;
    this.cognition = cognition;
    this.lastError = '';
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

  async verbalize(plan, _options = {}) {
    // Final-language authority is native to AURA. External models may supply
    // candidate semantic data through semanticSupport(), but they never write
    // the final sentence spoken in AURA's name.
    const answer = normalize(this.cognition.deterministicReply(plan));
    return answer || 'Je n’ai pas encore assez d’éléments internes pour répondre de façon fiable.';
  }


  diagnostic() {
    return {
      version: ExpressionLayer.VERSION,
      ai_available: Boolean(this.ai?.enabled),
      last_error: this.lastError,
      role: 'semantic-support-only',
      final_language_authority: 'aura-native-cognition',
      external_model_can_formulate_final_reply: false,
    };
  }
}
