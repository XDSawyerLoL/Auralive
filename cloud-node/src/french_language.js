import { embeddedLanguageRuntime } from './embedded_language.js';
import { groqFreeSpeech } from './groq_free_speech.js';

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function cleanSpeechOutput(value) {
  let speech = String(value || '').trim();
  // Reasoning and model instructions are not user-facing conversation.
  speech = speech.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (/<think>|<\/think>|(?:^|\s)(?:The user said|The user is (?:asking|saying|requesting|trying|wondering)|According to the core(?:'s)? decision|I should (?:respond|answer|explain)|The response should|My mood is|The relationship shows|The communicative goal|The speech act|The factual constraints|The conversation history|Now we need to respond|Should be brief|Maybe \x22|The goal is to greet|We need to respond naturally)/i.test(speech)) return '';
  if (/^(?:analysis|reasoning|thought process|assistant analysis)\s*:/i.test(speech)) return '';
  if (/\b(?:communicative goal|speech act|factual constraints|conversation history)\b/i.test(speech)) return '';
  if (!speech || /^(?:\x22|“)[^\x22”]*$/.test(speech)) return '';
  return normalize(speech);
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

  constructor(ai, { embedded = embeddedLanguageRuntime, groq = groqFreeSpeech } = {}) {
    this.ai = ai;
    this.embedded = embedded;
    this.groq = groq;
    this.lastError = '';
    this.lastBackend = '';
    this.lastModel = '';
    this.lastLatencyMs = 0;
    this.lastMode = 'unavailable';
  }

  get federation() {
    return this.ai?.federation || null;
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
    const local = await this.localAvailable();
    const embedded = this.embedded.status();
    const groq = this.groq?.snapshot?.() || { enabled: false };
    const embeddedInstalled = Boolean(embedded.installed);
    const stage = embedded.provisioning?.stage || '';
    const installing = embedded.provisioning?.enabled && !embedded.ready
      && !['not-started','installed-verified','blocked'].includes(stage);
    const provisionFailed = stage === 'blocked';
    // Native files alone do not establish that a model is operational.
    const ready = Boolean(embedded.ready || federation.enabled || local || groq.enabled);
    const blockingReason = installing ? 'embedded-language-installing'
      : provisionFailed ? 'embedded-language-installation-blocked'
      : embedded.failure_code && (embeddedInstalled || embedded.binary_found)
      && !['zero-cost-federation','runtime-local'].includes(this.lastMode)
      ? embedded.failure_code
      : ready
      ? (this.lastMode === 'degraded' ? 'free-language-provider-failed' : '')
      : (!federation.api_key_configured
        ? 'openrouter-free-key-missing'
        : (federation.zero_cost_mode === false
          ? 'zero-cost-mode-disabled'
          : (!federation.endpoint_verified
            ? 'untrusted-free-provider-endpoint'
            : (Array.isArray(federation.configured_models) && !federation.configured_models.length
              ? 'no-free-model-selected'
              : 'free-federation-disabled'))));
    // Groq is an optional *speech-only* provider: do not emit OpenRouter
    // key instructions when the actual failed service is Groq Free.
    const groqFailure = groq.enabled && this.lastMode === 'degraded'
      ? String(groq.last_error || '').slice(0, 100)
      : '';
    const failed = blockingReason === 'free-language-provider-failed'
      && !groqFailure
      ? classifyFreeLanguageFailure(this.lastError || federation.last_error || '')
      : null;
    const failureCode = groqFailure || failed?.code || blockingReason;
    const setupHint = installing
      ? 'Installation vérifiée du moteur français libre en cours sur cet hébergement.'
      : provisionFailed
        ? 'Impossible d’installer le moteur libre : vérifier la mémoire, le disque, le réseau HTTPS et les permissions.'
      : embedded.failure_code && (embeddedInstalled || embedded.binary_found)
      && !['zero-cost-federation','runtime-local'].includes(this.lastMode)
      ? embedded.setup_hint
      : blockingReason === 'openrouter-free-key-missing'
      ? 'Définir AURA_OPENROUTER_API_KEY dans les variables Hostinger (clé gratuite OpenRouter), puis redémarrer. Garder AURA_ZERO_COST_MODE=true et AURA_FREE_FEDERATION_ENABLED=true.'
      : groqFailure
        ? (groqFailure === 'groq-free-http-429'
          ? 'Groq Free a atteint une limite (429). Vérifier les quotas gratuits de ce modèle et réessayer plus tard, sans basculer vers une offre payante.'
          : groqFailure === 'groq-free-http-401'
            ? 'Groq a refusé la clé (401). Vérifier AURA_GROQ_API_KEY, jamais l’afficher publiquement.'
            : groqFailure === 'groq-free-daily-budget-reached'
              ? 'Plafond local quotidien Groq atteint. Utiliser le Runtime local ou attendre la remise à zéro.'
              : 'La verbalisation Groq Free a échoué : consulter le code d’erreur expurgé dans GET /api/aura/capabilities. Aucun modèle payant ne sera appelé.')
      : blockingReason === 'free-language-provider-failed'
        ? failed.hint
        : blockingReason === 'free-federation-disabled'
          ? 'Vérifier AURA_FREE_FEDERATION_ENABLED=true, AURA_ZERO_COST_MODE=true et la connexion du modèle local.'
          : blockingReason
            ? 'Consulter GET /api/ai/runtime pour vérifier la configuration du fournisseur gratuit.'
            : '';
    return {
      blocking_reason: failureCode,
      setup_hint: setupHint,
      version: FrenchLanguageFaculty.VERSION,
      ready,
      verified_ready: Boolean((groq.enabled && this.lastMode === 'groq-free-speech'
          && groq.last_success_at && (Date.now() - Date.parse(groq.last_success_at)) < 3_600_000)
        || (embedded.ready && this.lastMode === 'hostinger-embedded')
        || (federation.enabled && this.lastMode === 'zero-cost-federation') || (local && this.lastMode === 'runtime-local')),
      primary: groq.enabled ? 'groq-free-speech'
        : embedded.ready ? 'hostinger-embedded'
        : federation.enabled ? 'zero-cost-federation'
          : local ? 'runtime-local' : embeddedInstalled ? 'embedded-pending-start' : 'unavailable',
      embedded,
      groq,
      zero_cost: Boolean(federation.zero_cost_mode ?? true),
      federation_ready: Boolean(federation.enabled),
      local_ready: local,
      groq_ready: Boolean(groq.enabled),
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
      'Distingue les assertions factuelles vérifiables des actes de parole ordinaires (saluer, remercier, plaisanter, compatir, proposer, répondre à une attention, exprimer une hypothèse).',
      'Une réponse sociale, une opinion explicitement présentée comme telle ou une explication générale ne requiert pas de preuve opérationnelle AURA.',
      'Pour ces actes, appuie-toi sur le message utilisateur et le contexte conversationnel, sans inventer des événements ou des expériences.',
      'Une absence de faits externes ne doit jamais produire un refus de conversation sociale : réponds de manière appropriée et concise.',
      'Seules les affirmations sur les actions exécutées, souvenirs réels, métriques, résultats, accès et capacités d’AURA exigent des traces fiables.',

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
      'Tu peux reformuler librement les intentions relationnelles, les salutations et les raisonnements hypothétiques sans exiger de preuves factuelles.',
      'Ne convertis jamais une hypothèse en fait établi, et ne prétends pas avoir réalisé une action absente des traces du noyau.',

    ].join(' ');
  }

  async generate(plan, { maxTokens = 700, taskRole = 'french' } = {}) {
    const prompt = this.prompt(plan);
    const system = this.system();
    const started = Date.now();
    this.lastError = '';
    // A broken optional native runtime must never block a configured cloud speech provider.
    // Run local inference only when health and inference have already been verified.
    const tryEmbedded = async () => {
      if (!this.embedded.status?.().ready) return '';
      try {
        const answer = cleanSpeechOutput(await this.embedded.generate(prompt, system, maxTokens));
        if (answer) {
          this.lastMode = 'hostinger-embedded';
          this.lastBackend = 'hostinger-embedded-llama';
          this.lastModel = 'local-gguf';
          this.lastLatencyMs = Date.now() - started;
          this.lastError = '';
        }
        return answer;
      } catch (error) {
        this.lastError = safeError(error);
        return '';
      }
    };
    // Explicitly confirmed Groq Free plan is used for SPEECH only. The
    // cognitive core and any administrative operator never call this adapter.
    if (this.groq?.enabled) {
      const answer = cleanSpeechOutput(await this.groq.generate(
        prompt, system, Math.min(600, Math.max(120, Number(maxTokens) || 400)),
      ));
      if (answer) {
        this.lastMode = 'groq-free-speech';
        this.lastBackend = 'groq-free-verified-response';
        this.lastModel = this.groq.lastModel || this.groq.model || '';
        this.lastLatencyMs = Date.now() - started;
        this.lastError = '';
        return answer;
      }
      this.lastError = String(this.groq.lastError || 'groq-free-empty-response').slice(0, 120);
    }

    // Without federation, use the local runtime if it is healthy.
    if (!this.federation?.enabled) {
      const localAnswer = await tryEmbedded();
      if (localAnswer) return localAnswer;
    }

    if (this.federation?.enabled) {
      try {
        const result = await this.federation.generate(
          prompt,
          system,
          Math.max(120, Math.min(Number(maxTokens) || 700, 1200)),
          taskRole,
        );
        let answer = cleanSpeechOutput(result?.answer || '');
        if (!answer && result?.answer) {
          const retry = await this.federation.generate(
            prompt + '\nIMPORTANT : écris uniquement la réponse finale en français, jamais ton analyse ou des instructions.',
            system + ' Réponds uniquement en français, directement, sans explication du processus.',
            Math.min(360, Math.max(120, Number(maxTokens) || 250)), taskRole,
          );
          answer = cleanSpeechOutput(retry?.answer || '');
          if (!answer) this.lastError = 'speech-reasoning-leak-rejected';
        }
        if (answer) {
          this.lastMode = 'zero-cost-federation';
          this.lastError = '';
          this.lastBackend = String(result?.provider || 'openrouter-free');
          this.lastModel = String(result?.model || '');
          this.lastLatencyMs = Date.now() - started;
          return answer;
        }
      } catch (error) {
        this.lastError = safeError(error);
      }
    }

    // Federation was preferred; if unavailable, a healthy local engine can still answer.
    if (this.federation?.enabled) {
      const localAnswer = await tryEmbedded();
      if (localAnswer) return localAnswer;
    }

    if (await this.localAvailable()) {
      try {
        const answer = cleanSpeechOutput(await this.ai.bridge.infer(
          prompt,
          system,
          Math.max(120, Math.min(Number(maxTokens) || 700, 1200)),
          'conversation',
        ));
        if (answer) {
          this.lastMode = 'runtime-local';
          this.lastError = '';
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
    this.lastError = this.lastError || (this.federation?.enabled ? 'free-provider-empty-response' : 'no-free-provider-connected');
    this.lastBackend = '';
    this.lastModel = '';
    this.lastLatencyMs = Date.now() - started;
    return '';
  }
}
