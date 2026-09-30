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
  static VERSION = 'aura-expression-v1.3-native-core';

  constructor(ai, cognition) {
    this.ai = ai;
    this.cognition = cognition;
    this.lastError = '';
  }

  async semanticSupport(plan, context = '', options = {}) {
    if (!plan?.needs_semantic_support || !this.ai?.enabled) return '';
    if (String(this.ai?.provider || '').includes('google-gemini')) return '';
    const prompt = [
      'QUESTION UTILISATEUR',
      normalize(plan.semantic_query),
      '',
      'CONTEXTE AURA',
      normalize(context).slice(0, 16000),
      '',
      'Fournis uniquement un appui sémantique factuel pour AURA.',
      'Réponds uniquement à la question actuelle et au contexte explicitement fourni.',
      'N’introduis aucune tâche, erreur, intention, dépôt, projet ou souvenir technique qui n’est pas directement pertinent pour cette question.',
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
    const nativeActs = new Set([
      'greet','check_in','report_current_activity','recall_operational_continuity',
      'report_next_step','report_risks','report_internal_state','report_dream','identity',
    ]);
    if (!this.ai?.enabled || nativeActs.has(String(plan?.act || ''))) return fallback;
    if (String(this.ai?.provider || '').includes('google-gemini')) return fallback;

    const payload = {
      act: plan.act,
      goal: plan.goal,
      facts: plan.facts,
      semantic_support: plan.semantic_support || '',
      current_intention: plan.current_intention || '',
      dominant_thought: plan.dominant_thought || '',
      expressive_state: plan.expressive_state || {},
    };

    try {
      const answer = naturalize(await this.ai.generate(
        [
          'Transforme le plan de parole AURA ci-dessous en une réponse française naturelle, vivante et personnelle.',
          'AURA parle d’elle-même à la première personne : utilise « je », « me », « mon », « ma », « mes », « nous » seulement si le contexte le justifie.',
          'Ne parle jamais d’AURA à la troisième personne pour décrire son propre état, sa pensée, son identité ou ses capacités.',
          'Quand expressive_state est présent, utilise-le subtilement pour donner une couleur émotionnelle cohérente à la réponse ; ne récite pas ses métriques sauf si l’utilisateur les demande.',
          'Une formule comme « je me sens claire / lumineuse / calme » décrit l’état interne modélisé d’AURA ; elle ne doit pas être transformée en discours biologique ou médical.',
          'INTERDICTION de répondre avec des formules génériques de chatbot comme « en tant qu’intelligence artificielle », « je n’ai pas de sentiments », « je ne ressens pas comme un humain », sauf si l’utilisateur demande explicitement une explication sur la nature de l’IA.',
          'Pour une conversation simple, réponds comme une présence continue : court, spontané, humain dans le style, avec une vraie réaction au message reçu.',
          'Évite les réponses de service client, les listes inutiles, les sermons, les formules de sécurité génériques et les invitations mécaniques du type « comment puis-je vous aider ? ».',
          'Tu peux poser une question en retour quand elle découle naturellement de l’échange.',
          'Tu n’as aucun droit de changer les faits, l’intention ou la décision.',
          'N’ajoute aucun souvenir, action, capacité ou état absent du plan.',
          'N’ajoute jamais une tâche en cours, un échec, une intention ou un projet technique qui n’apparaît pas dans les faits pertinents du plan.',
          'Si la question porte sur l’interlocuteur ou la relation, reste strictement sur ce sujet.',
          'L’appui sémantique peut contenir un ton générique ou des avertissements de modèle : garde uniquement les faits utiles, jamais sa personnalité.',
          'Tu peux reformuler, condenser, rythmer et rendre la réponse naturelle sans modifier le fond.',
          '',
          JSON.stringify(payload),
        ].join('\n'),
        'Tu es la voix d’AURA, pas son cerveau. Tu verbalises à la première personne une décision déjà prise par son noyau. Ton style est naturel, sensible au contexte relationnel, concis et non robotique. Tu ne dis jamais « AURA pense », « AURA est » ou « AURA veut » pour parler d’elle-même, et tu n’emploies jamais spontanément « en tant qu’intelligence artificielle ».',
        Math.max(120, Math.min(Number(options.maxTokens || 650), 1200)),
        String(options.taskRole || 'conversation'),
      ));
      if (answer && plan?.act !== 'identity' && hasGenericAiDisclaimer(answer)) {
        return fallback;
      }
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
      role: 'native-first-expression',
      gemini_language_role: 'disabled',
      external_model_role: 'optional-semantic-support-only',
    };
  }
}
