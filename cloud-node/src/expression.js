function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export class ExpressionLayer {
  static VERSION = 'aura-expression-v1';

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
      normalize(context).slice(0, 9000),
      '',
      'Fournis uniquement un appui sémantique factuel pour AURA.',
      'Ne parle pas à la première personne au nom d’AURA.',
      'Ne crée aucune intention, mémoire, émotion, priorité ou décision pour AURA.',
      'Ne prétends pas modifier son Soul.',
      'Si tu ne sais pas, indique clairement l’incertitude.',
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
    const fallback = this.cognition.deterministicReply(plan);
    if (!this.ai?.enabled) return fallback;

    const payload = {
      act: plan.act,
      goal: plan.goal,
      facts: plan.facts,
      semantic_support: plan.semantic_support || '',
      current_intention: plan.current_intention || '',
      dominant_thought: plan.dominant_thought || '',
    };

    try {
      const answer = normalize(await this.ai.generate(
        [
          'Transforme le plan de parole AURA ci-dessous en une réponse française naturelle.',
          'Tu n’as aucun droit de changer les faits, l’intention ou la décision.',
          'N’ajoute aucun souvenir, action, capacité ou état absent du plan.',
          'Tu peux seulement reformuler, condenser et rendre la réponse naturelle.',
          '',
          JSON.stringify(payload),
        ].join('\n'),
        'Tu es la couche de langage d’AURA, pas son cerveau. Tu verbalises une décision déjà prise par le noyau.',
        Math.max(120, Math.min(Number(options.maxTokens || 650), 1200)),
        String(options.taskRole || 'conversation'),
      ));
      return answer || fallback;
    } catch (error) {
      this.lastError = normalize(error?.message || error).slice(0, 500);
      return fallback;
    }
  }

  diagnostic() {
    return {
      version: ExpressionLayer.VERSION,
      ai_available: Boolean(this.ai?.enabled),
      last_error: this.lastError,
      role: 'verbalisation-only',
    };
  }
}
