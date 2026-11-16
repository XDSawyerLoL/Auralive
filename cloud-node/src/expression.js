import { config } from './config.js';
import { FrenchLanguageFaculty,validateNucleusSpeech } from './french_language.js';
import {NATIVE_SOCIAL_ACTS} from './social_turn_kernel.js';
import {nativeFrenchCorpus} from './native_french_corpus.js';
import {answerFrenchFromConversation} from './native_semantic_grammar.js';
import {answerNativeSessionDialogue} from './native_session_discourse.js';

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
    if (config.localLanguageOnly || ['local-only','native-acquired'].includes(process.env.AURA_NATIVE_FRENCH_MODE)) return '';
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
    // The native speaker can recall only user-declared, same-session facts
    // passed through the trusted language workspace. No pretrained model,
    // invented biography or unverified cross-session user recognition.
    const currentMode=String(process.env.AURA_NATIVE_FRENCH_MODE||'').trim();
    if(['native-acquired','local-only','prefer-local'].includes(currentMode)){
      const recalled=answerNativeSessionDialogue({
        question:plan?.user_text,history:plan?.immediate_dialogue_context||[],
        storedFacts:plan?.native_session_preferences||[],
      });
      if(recalled?.text){
        const check=validateNucleusSpeech(plan,recalled.text);
        this.language.lastNucleusContract={...check,
          origin:'AURA.native-session-user-disclosure-v1'};
        if(check.accepted){
          this.lastError='';
          this.lastMode='native-session-grounded';
          this.language.lastBackend='aura-native-session-discourse';
          this.language.lastModel='';
          this.language.lastLatencyMs=0;
          this.language.lastError='';
          return recalled.text;
        }
      }
    }
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
    if(nativeMode==='local-only'||nativeMode==='prefer-local'||nativeMode==='native-acquired'){
      // Only same-session statements admitted by the perceptual language gate
      // can justify a local answer. This is reported testimony, not world truth.
      const semantic=answerFrenchFromConversation({
        question:plan.user_text,
        history:plan.immediate_dialogue_context||[],
        storedCorrections:plan.native_semantic_corrections||[],
      });
      const local=semantic||nativeFrenchCorpus.realizePlan(plan);
      if(local?.text){
        const checked=validateNucleusSpeech(plan,local.text);
        this.language.lastNucleusContract={
          ...checked,origin:'AURA.nucleus.CognitionEngine.planReply',
        };
        if(checked.accepted){
          this.lastError='';
          this.lastMode=semantic?'native-grammar-grounded':'native-corpus-language';
          this.language.lastBackend='aura-native-corpus';
          this.language.lastModel=semantic?'ud-fr-gsd-lexical-local-semantics':'ud-fr-gsd-morphological-symbolic';
          this.language.lastLatencyMs=0;
          this.language.lastError='';
          return local.text;
        }
        this.lastError='native-corpus-contract-rejected:'+checked.code;
      }else{
        this.lastError=nativeFrenchCorpus.status().ready
          ?'native-corpus-unsupported-intent':'native-corpus-not-installed';
      }
      if(nativeMode==='native-acquired'){
        // A visibly attributed communication-repair utterance prevents a
        // silent chat. This is a bounded built-in clarification, NOT language
        // learned by training and NOT a pretence of open-domain fluency.
        // It is allowed only on an ordinary user question; other nucleus
        // decisions keep their safety-specific speech contracts.
        if(plan?.act==='respond'&&normalize(plan.user_text)){
          const repair="Je n'ai pas encore appris à répondre correctement à cette question. Peux-tu me donner un exemple ou préciser ce que tu veux savoir ?";
          const checked=validateNucleusSpeech(plan,repair);
          this.language.lastNucleusContract={
            ...checked,origin:'AURA.native-conversation-repair-v1'};
          if(checked.accepted){
            this.lastMode='native-acquired-clarification';
            this.lastError='native-construction-out-of-coverage';
            this.language.lastBackend='aura-native-clarification-rule';
            this.language.lastModel='';
            this.language.lastLatencyMs=0;
            this.language.lastError='native-construction-out-of-coverage';
            return repair;
          }
        }
        this.lastMode='native-acquired-out-of-coverage';
        return '';
      }
      if(nativeMode==='local-only'){
        // The symbolic grammar does not cover free conversation. A verified
        // GGUF model or a local bridge may verbalize it, but NEVER Groq or
        // OpenRouter. In the previous path this returned '' before trying
        // either local generator, even when the model was responsive.
        try {
          const answer=normalize(await this.language.generate(plan,{
            maxTokens:Math.max(120,Math.min(Number(options.maxTokens||650),1200)),
            taskRole:String(options.taskRole||'french'),
            localOnly:true,
          }));
          if(answer){
            this.lastError='';
            this.lastMode='local-generative-language';
            return answer;
          }
        }catch(error){
          this.lastError=normalize(error?.message||error).slice(0,500);
        }
        this.lastError=this.language.lastError||this.lastError||'local-generative-model-unavailable';
        this.lastMode='native-corpus-uncovered';
        return '';
      }
    }
    try {
      const answer = normalize(await this.language.generate(plan, {
        maxTokens: Math.max(120, Math.min(Number(options.maxTokens || 650), 1200)),
        taskRole: String(options.taskRole || 'french'),
        preferLocal: nativeMode==='prefer-local',
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
    const corpusOnly=['local-only','native-acquired'].includes(process.env.AURA_NATIVE_FRENCH_MODE);
    const strictLocal=corpusOnly||Boolean(config.localLanguageOnly);
    const ownLanguage=process.env.AURA_NATIVE_FRENCH_MODE==='native-acquired';
    const localModelReady=Boolean(language.verified_ready &&
      ['hostinger-embedded','runtime-local'].includes(language.last_mode));
    const corpusReady=nativeFrenchCorpus.status().ready;
    return {
      version: ExpressionLayer.VERSION,
      language,
      corpus_local:nativeFrenchCorpus.status(),
      corpus_mode:String(process.env.AURA_NATIVE_FRENCH_MODE||'off'),
      corpus_is_open_domain:false,
      natural_french_ready: strictLocal?localModelReady:Boolean(language.verified_ready),
      mode: ownLanguage?'native-acquired-bounded' : corpusOnly
        ? (localModelReady?'learned-local-language-model':corpusReady?'native-corpus-limited':'native-corpus-not-installed')
        : language.verified_ready
        ? 'learned-language-model'
        : (config.frenchLanguageRequired ? 'natural-language-unavailable' : 'degraded-deterministic-fallback'),
      scripted_normal_path: corpusOnly&&!localModelReady,
      no_pretrained_language_generation:ownLanguage,
      strict_natural_language: Boolean(config.frenchLanguageRequired),
      remote_language_calls_permitted: !strictLocal,
      native_corpus_fully_fluent:false,
      fallback_count: this.fallbackCount,
      last_mode: this.lastMode,
      last_error: this.lastError || language.last_error || '',
      role: 'verbalisation-only',
    };
  }
}
