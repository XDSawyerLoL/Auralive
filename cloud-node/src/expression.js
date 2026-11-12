import { config } from './config.js';
import { FrenchLanguageFaculty,validateNucleusSpeech } from './french_language.js';
import {NATIVE_SOCIAL_ACTS} from './social_turn_kernel.js';
import {nativeFrenchCorpus} from './native_french_corpus.js';

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export class ExpressionLayer {
  static VERSION = 'aura-expression-v4-language-faculty';

  constructor(ai, cognition) {
    this.ai = ai;
    this.cognition = cognition;
    this.language = new FrenchLanguageFaculty(ai);
    this.lastError = '';
    this.lastMode = 'uninitialized';
    this.fallbackCount = 0;
  }

  async semanticSupport(plan, context = '', options = {}) {
    if (process.env.AURA_NATIVE_FRENCH_MODE==='local-only') return '';
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
    // Explicit current-turn social intent can be expressed by the kernel
    // itself. A language provider must not invent AURA's curiosity or steer
    // the conversation. This is NOT a fake hidden thought or human emotion.
    if (plan?.social_turn?.source==='same-session-conversation-and-rule'
        && NATIVE_SOCIAL_ACTS.has(plan.act) && fallback) {
      const check=validateNucleusSpeech(plan,fallback);
      this.language.lastNucleusContract={
        ...check,origin:'AURA.native-social-kernel-v1'};
      if(check.accepted){
        this.lastError='';
        this.lastMode='native-social-kernel';
        this.language.lastBackend='aura-native-social';
        this.language.lastModel='';
        this.language.lastLatencyMs=0;
        this.language.lastError='';
        return fallback;
      }
      this.lastError='native-social-rejected:'+check.code;
      // Do NOT let a provider override a rejected kernel decision.
      this.lastMode='natural-language-unavailable';
      return '';
    }
    const nativeMode=String(process.env.AURA_NATIVE_FRENCH_MODE||'').trim();
    if(nativeMode==='local-only'||nativeMode==='prefer-local'){
      const local=nativeFrenchCorpus.realizePlan(plan);
      if(local?.text){
        const checked=validateNucleusSpeech(plan,local.text);
        this.language.lastNucleusContract={
          ...checked,origin:'AURA.nucleus.CognitionEngine.planReply',
        };
        if(checked.accepted){
          this.lastError='';
          this.lastMode='native-corpus-language';
          this.language.lastBackend='aura-native-corpus';
          this.language.lastModel='ud-fr-gsd-morphological-symbolic';
          this.language.lastLatencyMs=0;
          this.language.lastError='';
          return local.text;
        }
        this.lastError='native-corpus-contract-rejected:'+checked.code;
      }else{
        this.lastError=nativeFrenchCorpus.status().ready
          ?'native-corpus-unsupported-intent':'native-corpus-not-installed';
      }
      if(nativeMode==='local-only'){
        this.lastMode='native-corpus-uncovered';
        // No covert Groq/OpenRouter/remote fallback in local-only mode.
        return '';
      }
    }
    try {
      const answer = normalize(await this.language.generate(plan, {
        maxTokens: Math.max(120, Math.min(Number(options.maxTokens || 650), 1200)),
        taskRole: String(options.taskRole || 'french'),
      }));
      if (answer) {
        this.lastError = '';
        this.lastMode = 'french-language-faculty';
        return answer;
      }
    } catch (error) {
      this.lastError = normalize(error?.message || error).slice(0, 500);
    }

    this.lastError = this.language.lastError || 'natural-french-backend-unavailable';
    this.fallbackCount += 1;
    if (config.frenchLanguageRequired) {
      this.lastMode = 'natural-language-unavailable';
      // Do not invent speech or a feeling of "presence" when inference fails.
      // The API returns a structured outage with a retry affordance instead.
      return '';
    }

    // Secours legacy explicitement opt-in seulement.
    this.lastMode = 'deterministic-emergency-fallback';
    return fallback;
  }

  async diagnostic() {
    const language = await this.language.status();
    const corpusOnly=process.env.AURA_NATIVE_FRENCH_MODE==='local-only';
    const corpusReady=nativeFrenchCorpus.status().ready;
    return {
      version: ExpressionLayer.VERSION,
      language,
      corpus_local:nativeFrenchCorpus.status(),
      corpus_mode:String(process.env.AURA_NATIVE_FRENCH_MODE||'off'),
      corpus_is_open_domain:false,
      natural_french_ready: corpusOnly?false:Boolean(language.verified_ready),
      mode: corpusOnly
        ? (corpusReady?'native-corpus-limited':'native-corpus-not-installed')
        : language.verified_ready
        ? 'learned-language-model'
        : (config.frenchLanguageRequired ? 'natural-language-unavailable' : 'degraded-deterministic-fallback'),
      scripted_normal_path: corpusOnly,
      strict_natural_language: Boolean(config.frenchLanguageRequired),
      remote_language_calls_permitted: !corpusOnly,
      native_corpus_fully_fluent:false,
      fallback_count: this.fallbackCount,
      last_mode: this.lastMode,
      last_error: this.lastError || language.last_error || '',
      role: 'verbalisation-only',
    };
  }
}
