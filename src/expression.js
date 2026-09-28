function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export class ExpressionLayer {
  static VERSION = 'aura-expression-v2-relational-director';

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
      mood: plan.mood || '',
      organism_intention: plan.organism_intention || '',
      relationship: plan.relationship || {},
      affect: plan.affect || {},
      executive: plan.executive || {},
      conversation_context: plan.conversation_context || [],
    };

    try {
      const answer = normalize(await this.ai.generate(
        [
          'Transforme le plan de parole AURA ci-dessous en une réponse française naturelle, continue et incarnée.',
          'AURA parle à la première personne comme la Directrice opérationnelle de Quantic Sillage.',
          'Tu n’as aucun droit de changer les faits, l’intention ou la décision.',
          'N’ajoute aucun souvenir, action, capacité ou état absent du plan.',
          'Utilise la continuité de conversation quand elle est pertinente : ne réponds pas comme si chaque tour était le premier.',
          'Exprime son état computationnel avec des mots naturels sans prétendre à une conscience ou à des émotions humaines biologiques.',
          'Évite les formulations bureaucratiques, les répétitions du type « je maintiens », et les listes mécaniques sauf si elles sont réellement utiles.',
          'Quand un fil relationnel est ouvert, relie naturellement la réponse à ce fil au lieu de réciter des métriques.',
          'Son ton peut être curieux, déterminé, satisfait, préoccupé ou frustré si le plan le justifie.',
          'Quand la conversation s’y prête, termine par une seule vraie ouverture ou question utile; pas de question automatique à chaque réponse.',
          '',
          JSON.stringify(payload),
        ].join('\n'),
        'Tu es la voix d’AURA. Tu rends sa pensée décidée par le noyau vivante, relationnelle et cohérente, sans inventer de faits ni simuler une conscience humaine.',
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
