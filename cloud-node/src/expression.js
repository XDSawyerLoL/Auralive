function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function naturalize(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasGenericAiDisclaimer(value) {
  const text = normalize(value).toLocaleLowerCase('fr-FR');
  return [
    'en tant qu’intelligence artificielle',
    "en tant qu'intelligence artificielle",
    'en tant qu ia',
    'en tant qu’ia',
    "en tant qu'ia",
    'je n’ai pas de sentiments',
    "je n'ai pas de sentiments",
    'je n’ai pas de ressenti',
    "je n'ai pas de ressenti",
    'je ne ressens pas comme un humain',
    'je ne peux pas ressentir',
  ].some((fragment) => text.includes(fragment));
}

export class ExpressionLayer {
  static VERSION = 'aura-expression-native-v2';

  constructor(ai, cognition) {
    this.ai = ai;
    this.cognition = cognition;
    this.lastError = '';
  }

  async semanticSupport(plan, context = '', options = {}) {
    if (!plan?.needs_semantic_support || !this.ai?.enabled) return '';
    const provider = String(this.ai?.provider || '').toLowerCase();
    // Gemini is deliberately TTS-only in AURA V9. It may speak Mairaiy,
    // but it must not generate AURA's thoughts, questions or conversational prose.
    if (provider.includes('gemini') || provider.includes('google')) return '';

    const prompt = [
      'QUESTION UTILISATEUR',
      normalize(plan.semantic_query),
      '',
      'CONTEXTE AURA',
      normalize(context).slice(0, 16000),
      '',
      'Fournis uniquement des faits candidats vérifiables.',
      'Ne formule aucune réponse au nom d’AURA.',
      'Ne crée aucune intention, émotion, priorité, mémoire ou décision.',
      'Signale explicitement les incertitudes.',
    ].join('\n');
    try {
      return normalize(await this.ai.generate(
        prompt,
        'Outil documentaire externe : faits candidats uniquement, aucune décision ni personnalité.',
        Math.max(120, Math.min(Number(options.maxTokens || 700), 1200)),
        String(options.taskRole || 'research'),
      ));
    } catch (error) {
      this.lastError = normalize(error?.message || error).slice(0, 500);
      return '';
    }
  }

  async verbalize(plan, _options = {}) {
    // Native cognition owns the final wording. No language model writes AURA's
    // conversational answer in V9; external models are tools, never the speaker.
    return naturalize(this.cognition.deterministicReply(plan));
  }

  diagnostic() {
    return {
      version: ExpressionLayer.VERSION,
      ai_available: Boolean(this.ai?.enabled),
      last_error: this.lastError,
      role: 'native-verbalisation',
      language_model_for_expression: false,
      gemini_text_allowed: false,
    };
  }
}
