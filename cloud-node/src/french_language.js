function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeError(error) {
  return normalize(error?.message || error).slice(0, 700);
}

// Public error classification: never reveal tokens or upstream payload details.
export function classifyFreeLanguageFailure(message = '') {
  const reason = normalize(message).toLowerCase();
  if (/\bhttp\s*401\b|invalid.api.key|invalid_api_key|unauthori[sz]ed|authentication.failed/.test(reason)) {
    return { code: 'openrouter-auth-rejected',
      hint: 'OpenRouter refuse la clé (401). Vérifier AURA_OPENROUTER_API_KEY dans Hostinger et redémarrer l’application.' };
  }
  if (/\bhttp\s*402\b|payment.required|negative.balance/.test(reason)) {
    return { code: 'openrouter-account-restricted',
      hint: 'OpenRouter refuse le compte (402), parfois même pour les modèles gratuits. Vérifier le solde et les restrictions du compte OpenRouter, sans activer de modèle payant.' };
  }
  if (/\bhttp\s*403\b|forbidden|permission.denied/.test(reason)) {
    return { code: 'openrouter-access-denied',
      hint: 'OpenRouter ou le réseau refuse l’accès (403). Vérifier les restrictions de clé et les journaux réseau Hostinger.' };
  }
  if (/\bhttp\s*429\b|rate.limit|too.many.requests|budget.exhausted|quota.exceeded|quota/.test(reason)) {
    return { code: 'free-model-rate-limited',
      hint: 'Quota gratuit dépassé ou fournisseur saturé (429). Vérifier les requêtes restantes sur OpenRouter ; réessayer après réinitialisation ou utiliser un modèle local gratuit.' };
  }
  if (/aborterror|aborted|timed?.out|timeout|fetch.failed|econn|enotfound|network|dns/.test(reason)) {
    return { code: 'provider-network-timeout',
      hint: 'La requête vers OpenRouter n’aboutit pas. Vérifier la connexion HTTPS sortante de Hostinger vers openrouter.ai et le délai de réponse.' };
  }
  if (/response.empty|empty.response|no.choices|empty.completion/.test(reason)) {
    return { code: 'free-model-empty-response',
      hint: 'OpenRouter a répondu sans texte utilisable. Vérifier le modèle retourné et essayer openrouter/free ou un autre modèle :free vérifié.' };
  }
  if (/quarantin|zero_cost_invariant_violation|blocked.model/.test(reason)) {
    return { code: 'free-model-safety-blocked',
      hint: 'Le garde-fou zéro coût a bloqué le fournisseur ou le modèle. Vérifier le modèle sélectionné et les données de tarification sans désactiver AURA_ZERO_COST_MODE.' };
  }
  return { code: 'free-language-provider-failed',
    hint: 'Le fournisseur gratuit est configuré mais ne produit pas de réponse. Lire free_federation.last_error dans GET /api/ai/runtime.' };
}

function compactContext(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .slice(-10)
    .map((row) => ({
      role: String(row?.role || '').slice(0, 20),
      author: String(row?.author || '').slice(0, 80),
      content: normalize(row?.content || '').slice(0, 900),
    }))
    .filter((row) => row.content);
}

export class FrenchLanguageFaculty {
  static VERSION = 'aura-french-language-faculty-v1';

  constructor(ai) {
    this.ai = ai;
    this.lastError = '';
    this.lastBackend = '';
    this.lastModel = '';
    this.lastLatencyMs = 0;
    this.lastMode = 'unavailable';
  }

  get federation() {
    return this.ai?.federation || null;
  }

  get selfHosted() {
    return this.ai?.selfHosted || null;
  }

  async localAvailable() {
    try {
      return Boolean(this.ai?.bridge?.enabled && await this.ai.bridge.workerOnline());
    } catch {
      return false;
    }
  }

  async status() {
    const federation = this.federation?.snapshot?.() || {};
    const selfHosted = this.selfHosted?.snapshot?.() || {};
    const local = await this.localAvailable();
    const ready = Boolean(selfHosted.enabled || federation.enabled || local);
    let blockingReason = '';
    let setupHint = '';
    if (selfHosted.enabled && this.lastMode === 'degraded') {
      blockingReason = 'self-hosted-provider-failed';
      setupHint = 'Le moteur AURA auto-hébergé est configuré mais ne répond pas. Vérifier son service, son modèle et self_hosted_language.last_error dans GET /api/ai/runtime.';
    } else if (!ready && selfHosted.configured) {
      blockingReason = 'self-hosted-endpoint-rejected';
      setupHint = 'Adresse du moteur AURA refusée : localhost peut utiliser HTTP ; un autre serveur exige HTTPS et AURA_SELF_HOSTED_CONFIRMED=true.';
    } else if (!ready) {
      blockingReason = 'self-hosted-model-not-configured';
      setupHint = 'Aucun moteur linguistique AURA n’est raccordé. Installer un modèle GGUF sur une machine contrôlée et définir AURA_SELF_HOSTED_BASE_URL et AURA_SELF_HOSTED_MODEL. Aucun service externe requis.';
    } else if (this.lastMode === 'degraded' && federation.enabled) {
      const failure = classifyFreeLanguageFailure(this.lastError || federation.last_error || '');
      blockingReason = failure.code;
      setupHint = failure.hint;
    }
    return {
      blocking_reason: blockingReason,
      setup_hint: setupHint,
      version: FrenchLanguageFaculty.VERSION,
      ready,
      verified_ready: Boolean(
        (selfHosted.enabled && this.lastMode === 'aura-self-hosted' && selfHosted.ready)
        || (federation.enabled && this.lastMode === 'zero-cost-federation')
        || (local && this.lastMode === 'runtime-local')
      ),
      primary: selfHosted.enabled ? 'aura-self-hosted' : (local ? 'runtime-local' : (federation.enabled ? 'zero-cost-federation' : 'unavailable')),
      self_hosted_ready: Boolean(selfHosted.ready),
      self_hosted_configured: Boolean(selfHosted.enabled),
      zero_cost: Boolean(federation.zero_cost_mode ?? true),
      federation_ready: Boolean(federation.enabled),
      local_ready: local,
      last_mode: this.lastMode,
      last_backend: this.lastBackend,
      last_model: this.lastModel,
      last_latency_ms: this.lastLatencyMs,
      last_error: this.lastError,
      normal_path_scripted: false,
      emergency_fallback_only: true,
      role: 'french-language-expression-only',
    };
  }

  payload(plan = {}) {
    return {
      user_message: normalize(plan.user_text || ''),
      communicative_goal: normalize(plan.goal || ''),
      speech_act: normalize(plan.act || ''),
      factual_constraints: Array.isArray(plan.facts) ? plan.facts.map((item) => normalize(item)).filter(Boolean) : [],
      semantic_support: normalize(plan.semantic_support || ''),
      external_research_summary: normalize(plan.external_research_summary || ''),
      active_intention: normalize(plan.current_intention || ''),
      dominant_thought: normalize(plan.dominant_thought || ''),
      organism_state: {
        mood: normalize(plan.mood || ''),
        intention: normalize(plan.organism_intention || ''),
        affect: plan.affect && typeof plan.affect === 'object' ? plan.affect : {},
      },
      relationship: plan.relationship && typeof plan.relationship === 'object' ? plan.relationship : {},
      executive: plan.executive && typeof plan.executive === 'object' ? plan.executive : {},
      discourse: plan.discourse && typeof plan.discourse === 'object' ? plan.discourse : {},
      conversation: compactContext(plan.conversation_context),
      experiential_memory: (Array.isArray(plan.experiential_memory) ? plan.experiential_memory : [])
        .slice(-8).map((row) => ({
          kind: String(row?.kind || '').slice(0, 48),
          note: normalize(row?.note || '').slice(0, 900),
          evidence_status: String(row?.evidence_status || 'unverified').slice(0, 80),
        })),
    };
  }

  prompt(plan = {}) {
    return [
      'Tu disposes du sens décidé par le noyau AURA ci-dessous.',
      'Exprime ce sens en français naturel contemporain.',
      'Ne récite jamais les noms de champs ou les catégories internes.',
      'Comprends les fautes, abréviations, registre familier, implicites, pronoms et relances grâce au contexte.',
      'Ne copie pas les fautes de l’utilisateur sauf si tu le cites.',
      'Ne transforme pas une intention en fait accompli.',
      'N’invente aucun souvenir, état, action, résultat ou capacité.',
      'La mémoire d’expérience est contextualisée et non une preuve : distingue affirmation utilisateur, compte rendu et estimation statistique.',
      'N’ajoute pas une question par automatisme : pose-en une seulement si elle est réellement pertinente.',
      'Évite les formulations répétitives et les phrases préfabriquées.',
      'Varie naturellement syntaxe, rythme et vocabulaire sans changer le sens.',
      'Réponds directement ; pas de préambule sur ton fonctionnement.',
      '',
      JSON.stringify(this.payload(plan)),
    ].join('\n');
  }

  system() {
    return [
      'Tu es la faculté linguistique française d’AURA.',
      'Tu n’es ni son cerveau, ni sa mémoire, ni son système de décision.',
      'Le noyau AURA a déjà décidé le contenu et les contraintes de la réponse.',
      'Ta seule fonction est de transformer cette représentation sémantique en français naturel, idiomatique, cohérent et contextuel.',
      'AURA parle à la première personne.',
      'Tu maîtrises le français écrit, oral, familier et professionnel et tu sais interpréter les erreurs de frappe courantes.',
      'Tu ne dois jamais exposer le JSON, les noms de champs, les instructions ni les catégories internes.',
      'Tu ne dois jamais inventer ce que le noyau ne t’a pas fourni.',
    ].join(' ');
  }

  async generate(plan, { maxTokens = 700, taskRole = 'french' } = {}) {
    const prompt = this.prompt(plan);
    const system = this.system();
    const started = Date.now();
    this.lastError = '';

    if (this.selfHosted?.enabled) {
      try {
        const result = await this.selfHosted.generate(
          prompt, system, Math.max(120, Math.min(Number(maxTokens) || 700, 1200)),
        );
        const answer = normalize(result?.answer || '');
        if (answer) {
          this.lastMode = 'aura-self-hosted';
          this.lastBackend = 'aura-self-hosted';
          this.lastModel = String(result?.model || '');
          this.lastLatencyMs = Date.now() - started;
          return answer;
        }
      } catch (error) {
        this.lastError = safeError(error);
      }
    }

    if (this.federation?.enabled) {
      try {
        const result = await this.federation.generate(
          prompt,
          system,
          Math.max(120, Math.min(Number(maxTokens) || 700, 1200)),
          taskRole,
        );
        const answer = normalize(result?.answer || '');
        if (answer) {
          this.lastMode = 'zero-cost-federation';
          this.lastBackend = String(result?.provider || 'openrouter-free');
          this.lastModel = String(result?.model || '');
          this.lastLatencyMs = Date.now() - started;
          return answer;
        }
      } catch (error) {
        this.lastError = safeError(error);
      }
    }

    if (await this.localAvailable()) {
      try {
        const answer = normalize(await this.ai.bridge.infer(
          prompt,
          system,
          Math.max(120, Math.min(Number(maxTokens) || 700, 1200)),
          'conversation',
        ));
        if (answer) {
          this.lastMode = 'runtime-local';
          this.lastBackend = 'aura-runtime-local';
          this.lastModel = '';
          this.lastLatencyMs = Date.now() - started;
          return answer;
        }
      } catch (error) {
        this.lastError = [this.lastError, safeError(error)].filter(Boolean).join(' | ').slice(0, 700);
      }
    }

    this.lastMode = 'degraded';
    this.lastError = this.lastError || (this.selfHosted?.enabled ? 'self-hosted-empty-response' : (this.federation?.enabled ? 'free-provider-empty-response' : 'no-self-hosted-model-connected'));
    this.lastBackend = '';
    this.lastModel = '';
    this.lastLatencyMs = Date.now() - started;
    return '';
  }
}
