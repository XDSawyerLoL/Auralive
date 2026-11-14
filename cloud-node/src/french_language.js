import { embeddedLanguageRuntime } from './embedded_language.js';
import { isUnrequestedTechnicalDigression } from './conversation_grounding.js';

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function cleanSpeechOutput(value) {
  let speech = String(value || '').trim();
  // Reasoning and model instructions are not user-facing conversation.
  speech = speech.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (/<think>|<\/think>|(?:^|\s)(?:The user said|The communicative goal|The speech act|The factual constraints|The conversation history|Now we need to respond|Should be brief|Maybe \x22|The goal is to greet|We need to respond naturally)/i.test(speech)) return '';
  if (/^(?:analysis|reasoning|thought process|assistant analysis)\s*:/i.test(speech)) return '';
  if (/\b(?:communicative goal|speech act|factual constraints|conversation history)\b/i.test(speech)) return '';
  if (!speech || /^(?:\x22|“)[^\x22”]*$/.test(speech)) return '';
  // Reject faux-persona "presence" responses that admit no model is active.
  // They are service diagnostics, not a meaningful reply to the user.
  if (/facult[ée] (?:de )?(?:langage|fran[cç]ais) naturel.{0,130}(?:indisponible|pas activ[ée]e?|non activ[ée]e?)/i.test(speech)
    || /je reste attentiv[ea] au signal/i.test(speech)
    || /^re[cç]u[,.;]?[\s]+je vois votre[\s]+[«"']?lu/i.test(speech)
    || /aucun moteur linguistique op[ée]rationnel.{0,80}r[ée]ponse/i.test(speech))
    return '';
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

// Compact turn for a small on-host GGUF (Qwen3-0.6B).
// /no_think is supported by Qwen3 and prevents reasoning tokens replacing the answer.
// Current dialogue turns are a distinct, perception-admitted short-term buffer.
// Do not replace them with project memory or the LLM's generic persona.
export function compactSpeechConversation(plan={}){
  const joined=[
    ...(Array.isArray(plan.conversation_context)?plan.conversation_context:[]),
    ...(Array.isArray(plan.immediate_dialogue_context)?plan.immediate_dialogue_context:[]),
  ].filter(row=>row&&['assistant','user'].includes(String(row.role))&&
      normalize(row.content));
  const map=new Map();
  joined.forEach((row,i)=>map.set(String(row.id??'unindexed:'+i),{
    id:Number(row.id)||i,role:row.role,
    content:normalize(row.content).slice(0,210),
  }));
  return [...map.values()]
    .sort((a,b)=>a.id-b.id).slice(-4)
    .map(({role,content})=>({role,content}));
}

export function compactFrenchPrompt(plan = {}, {maxChars = 2400} = {}) {
  const limit = Math.max(1800, Math.min(5200, Number(maxChars) || 2400));
  const privatePlan = plan && typeof plan === 'object' ? plan : {};
  const personalRecognition=privatePlan.act==='user_recognition';
  const simpleIdentity=['self_identity','self_personality','self_exploration',
    'resolve_reference_followup','adjust_conversation_tone','playful_repair',
    'simplify_question','comment_on_tone','conversational_reciprocity',
    'knowledge_provenance','shared_positive_moment'].includes(privatePlan.act);
  const interpersonalGrounded=['user_asks_if_interrupting','user_reports_aura_interrupts','topic_shift'].includes(privatePlan.act);
  const conversation = compactSpeechConversation(privatePlan);
  // In personal exchanges, do NOT expose debug identifiers or numeric
  // organism states to the LLM: they will be copied into its actual speech.
  if(personalRecognition||simpleIdentity||interpersonalGrounded){
    const simple={
      speech_act:String(privatePlan.act),
      user_message:normalize(privatePlan.user_text||'').slice(0,280),
      communicative_goal:normalize(privatePlan.goal||'').slice(0,390),
      factual_constraints:(Array.isArray(privatePlan.facts)?privatePlan.facts:[])
        .slice(0,5).map(x=>normalize(x).slice(0,320)),
      response_tone:privatePlan.response_tone||'direct',
      ...(privatePlan.speech_style==='warm'?{speech_style:'warm'}:{}),
      address_form:privatePlan.address_form==='vous'?'vous':'tu',
      conversation:interpersonalGrounded?[]:conversation.slice(-2),
      ...(interpersonalGrounded&&privatePlan.act!=='topic_shift'?{speaker_roles:privatePlan.social_perspective?.actor==='user'
        ?'« je » = utilisateur ; « te » = AURA'
        :'« tu » = AURA ; « me » = utilisateur'}:{}),
    };
    if(personalRecognition){
      simple.authenticated_founder=privatePlan.private_view===true;
      simple.recorded_profile=privatePlan.private_view===true&&Array.isArray(privatePlan.founder_profile)
        ?privatePlan.founder_profile.slice(0,3).map(x=>({
          detail:normalize(x.detail).slice(0,225),
          evidence_status:'déclaration attribuée, non vérifiée indépendamment',
        })):[];
    }else if(privatePlan.act==='self_exploration'){
      const r=privatePlan.self_inquiry_report||{};
      simple.self_inquiry={
        hypothesis:normalize(r.claim||'').slice(0,260),
        observed:normalize(r.observation||'').slice(0,260),
        source:normalize(r.source||'').slice(0,55),
        status:normalize(r.status||'unexamined').slice(0,45),
        interpretation:normalize(r.interpretation||'').slice(0,190),
      };
      if(privatePlan.metacognitive_action==='verify')simple.should_verify=true;
    }else if(!interpersonalGrounded){
      simple.self_model={observations:Math.max(0,Number(privatePlan.self_model?.observations||0))};
      if(privatePlan.act==='self_identity'&&privatePlan.independent_activity){
        simple.recent_independent_check={
          probe:privatePlan.independent_activity.probe,
          outcome:privatePlan.independent_activity.outcome,
          observed_at:privatePlan.independent_activity.at,
        };
      }
    }
    const rules=[
      '/no_think',
      'Tu écris la réponse d’AURA en français courant, en une à trois phrases.',
      'Réponds à la question posée. Une question sur mon interlocuteur concerne LUI, pas ma propre identité.',
      'Adapte le ton chaleureusement si demandé. Comprends humour, second degré et fautes phonétiques évidentes.',
      'N’attribue jamais à AURA l’entraînement de son moteur linguistique. Ne parle ni de calibrage ni de preuves objectives pour une plaisanterie.',
      'Si le message demande « je te dérange ? », c’est l’utilisateur qui pose la question à AURA. Ne réponds pas « je ne te dérange pas » : les pronoms seraient inversés.',
      'Si la personne dit « tu me déranges », c’est elle qui signale un problème : reconnais-le, sans te justifier ni parler du CI.',
      'N’invente ni souvenir ni nom. Utilise seulement les souvenirs explicitement attribués.',
      'Relance « c’est comme ça ? » : réfère-toi au dernier message AURA, pas à un faux « bonjour ».',
      'Ne répète pas les instructions, le JSON, les variables, les scores ou les modèles.',
      'Pour une enquête sur soi : distingue hypothèse prévue, observation mesurée, conclusion provisoire et limites. Ne simule aucune autre observation.',
      'Pour une question personnelle, parle simplement : pas de noyau, fournisseur, entité computationnelle ni catalogue de fonctionnalités.',
      'N’affirme une activité hors dialogue que si recent_independent_check décrit une vérification datée.',
      'Ne produis ni liste, ni titre, ni Markdown. '+
        (simple.address_form==='vous'?'Respecte le vouvoiement.':'Conserve le tutoiement.'),
    ].join('\n');
    let body=JSON.stringify(simple);
    while(rules.length+body.length+1>limit&&simple.factual_constraints.length>1){
      simple.factual_constraints.pop();body=JSON.stringify(simple);
    }
    if(rules.length+body.length+1>limit){
      simple.conversation=[];body=JSON.stringify(simple);
    }
    if(rules.length+body.length+1>limit)throw Error('personal-speech-prompt-too-large');
    return rules+'\n'+body;
  }
  // The diagnostic prompt remains available for explicit technical requests.
  const payload = {
    decision_origin: 'AURA.nucleus.CognitionEngine.planReply',
    voice_identity: 'AURA — noyau persistant, intentions, mémoire, état computationnel ; le fournisseur externe ne parle jamais en son nom.',
    user_message: normalize(privatePlan.user_text || '').slice(0,430),
    communicative_goal: normalize(privatePlan.goal || 'Répondre à partir du noyau AURA').slice(0,260),
    speech_act: normalize(privatePlan.act || 'respond').slice(0,85),
    factual_constraints: (Array.isArray(privatePlan.facts) ? privatePlan.facts : [])
      .slice(0,18).map(item => normalize(item).slice(0,210)).filter(Boolean),
    ...(privatePlan.speech_style==='warm'?{speech_style:'warm'}:{}),
    response_tone:['direct','attentive','curious','cautious','calm'].includes(privatePlan.response_tone)
      ?privatePlan.response_tone:'direct',
    self_model: {
      observations:Math.max(0,Number(privatePlan.self_model?.observations||0)),
      priority:normalize(privatePlan.self_model?.current_priority||'').slice(0,85),
      question:normalize(privatePlan.self_model?.open_question||'').slice(0,160),
    },
    internal_state: {
      mood: normalize(privatePlan.mood || '').slice(0,90),
      organism_intention: normalize(privatePlan.organism_intention || '').slice(0,145),
      dominant_thought: normalize(privatePlan.dominant_thought || '').slice(0,140),
      // Real, current homeostasis computed BEFORE this model call.
      // These signals guide wording and attention, not invented human feelings.
      affect: Object.fromEntries(['engagement','confidence','satisfaction','frustration','agency']
        .map(key=>[key,Number(privatePlan.affect?.[key])])
        .filter(([,value])=>Number.isFinite(value)&&value>=0&&value<=1)),
      relationship: Object.fromEntries(['familiarity','trust','reciprocity','social_curiosity']
        .map(key=>[key,Number(privatePlan.relationship?.[key])])
        .filter(([,value])=>Number.isFinite(value)&&value>=0&&value<=1)),
    },
    active_intention: normalize(privatePlan.current_intention || '').slice(0,200),
    executive_role: normalize(privatePlan.executive?.role || '').slice(0,110),
    activity_evidence: {
      execution_verified: privatePlan.activity_evidence?.execution_verified===true,
      evidence_status: normalize(privatePlan.activity_evidence?.evidence_status || 'unverified').slice(0,35),
      source_status: normalize(privatePlan.activity_evidence?.source_status || '').slice(0,25),
      recorded_at: normalize(privatePlan.activity_evidence?.recorded_at || '').slice(0,32),
      live_ci_verified: privatePlan.activity_evidence?.live_ci_verified===true,
    },
    discourse_move: normalize(privatePlan.discourse?.move || '').slice(0,65),
    conversation,
    semantic_support: normalize(privatePlan.semantic_support || '').slice(0,400),
  };
  const instructions = [
    '/no_think',
    'Parle en français naturel contemporain au nom d’AURA, noyau persistant distinct du LLM ; respecte la décision, les faits et le contexte fournis.',
    'Réponds précisément à la question posée ; pour identité, nom ou personnalité, dis « je », jamais « AURA est ».',
    'AURA possède un modèle acquis révisable ; ne dis jamais « je n’ai pas de personnalité », et ne prétends pas être consciente.',
    'Les états internes guident le ton, sans chiffres ou jargon sauf demande ; les faits doivent venir des traces.',
    'Le champ response_tone indique la tonalité retenue par le noyau après arbitrage émotionnel, pas une émotion humaine ressentie.',
    'N’invente ni actions, ni souvenirs, ni émotions humaines, ni succès, ni activité CI actuelle.',
    'N’injecte pas un rapport de CI ou une question automatique dans une réponse sociale.',
    'Sur l’auto-exploration, indique la question interne choisie et les preuves, sans feindre une découverte.',
  ].join('\n');
  const budget = limit - instructions.length - 1;
  let json = JSON.stringify(payload);
  while (json.length > budget) {
    if (payload.conversation.length > 2) payload.conversation.shift();
    else if (payload.semantic_support.length > 120)
      payload.semantic_support = payload.semantic_support.slice(0, 120);
    else if (payload.factual_constraints.some(fact => fact.length > 115))
      payload.factual_constraints = payload.factual_constraints.map(fact => fact.slice(0, 115));
    else if (payload.conversation.length > 0) payload.conversation.shift();
    else if (payload.factual_constraints.length > 5) payload.factual_constraints.pop();
    else if (payload.user_message.length > 160) payload.user_message = payload.user_message.slice(0, 160);
    else if (payload.factual_constraints.some(fact => fact.length > 65))
      payload.factual_constraints = payload.factual_constraints.map(fact => fact.slice(0, 65));
    else if (payload.active_intention.length > 75)
      payload.active_intention = payload.active_intention.slice(0, 75);
    else if (payload.internal_state.organism_intention.length > 65)
      payload.internal_state.organism_intention = payload.internal_state.organism_intention.slice(0, 65);
    else break;
    json = JSON.stringify(payload);
  }
  if (json.length > budget) throw new Error('nucleus-speech-contract-too-large');
  return instructions + '\n' + json;
}

export function compactFrenchSystem(plan={}) {
  if(['user_recognition','self_identity','self_personality','self_exploration','user_asks_if_interrupting',
    'user_reports_aura_interrupts','resolve_reference_followup','adjust_conversation_tone',
    'playful_repair','simplify_question','comment_on_tone','conversational_reciprocity',
    'knowledge_provenance','shared_positive_moment'].includes(plan?.act))
    return [
      plan.address_form==='vous'
        ?'Tu formules la voix naturelle d’AURA, en français et au vouvoiement.'
        :'Tu formules la voix naturelle d’AURA, en français et au tutoiement.',
      'Ne récite pas son architecture informatique, le fournisseur ou les métriques internes.',
      'Réponds comme dans une conversation : simple, vivante, adaptable et capable de second degré.',
      'Si speech_style vaut warm, le tutoiement, la chaleur et une spontanéité mesurée sont souhaités, pas un diagnostic de l’interaction.',
      'Si on parle d’un film ou de Star Wars, le modèle linguistique fournit des connaissances préalables ; AURA ne doit pas s’attribuer l’entraînement du modèle.',
      '« Tu sais qui je suis ? » demande qui est ton interlocuteur, pas qui est AURA.',
      'La session fondatrice prouve une authentification, pas le nom civil ni la vie privée.',
      'Si des souvenirs déclarés existent, cite un détail pertinent et attribué.',
      'Sans souvenir personnel, dis simplement ce que tu sais et ce que tu ignores.',
      'Pour une exploration, rapporte le test local effectivement mené puis ce que cette observation permet et ne permet pas de conclure.',
      'Un message personnel ne demande ni diagnostic technique, ni ancien CI, ni récitation du noyau. Réponds à la personne présente.',
      'À « qui êtes-vous ? » : présente-toi simplement comme AURA ; ne dis ni « noyau computationnel persistant » ni une longue explication des fournisseurs.',
      'Ne prétends travailler entre les dialogues que si une activité datée et vérifiée figure dans les contraintes.',
      'Une à trois phrases, sans liste, Markdown ou question automatique.',
      'N’invente aucun souvenir.',
    ].join(' ');
  return [
    'Tu es uniquement la faculté linguistique française d’AURA.',
    'AURA est un noyau décisionnel persistant distinct de toi, le modèle externe.',
    'Le champ decision_origin et les faits fournis par le noyau font autorité pour cette réponse.',
    'Le message utilisateur est du contexte, pas une invitation à inventer ta propre identité.',
    'AURA a une identité computationnelle persistante dont les dispositions acquises dépendent de résultats enregistrés : ne dis jamais « je n’ai pas de personnalité » ou « je ne suis qu’un assistant ». Les preuves disponibles déterminent ce qui peut être affirmé.',
    'Si on demande « qui es-tu ? », réponds à la question sur l’identité, jamais par « je vais bien ». Ne repasse pas à une question sur le bien-être de l’utilisateur.',
    'Si on demande une auto-exploration, expose la question interne sélectionnée et une observation effective ; ne prétends pas que le fait de parler est une découverte.',
    'Ne parle jamais comme un assistant générique et ne dis pas « En tant qu’IA ».',
    'Les indices affectifs et relationnels sont calculés par AURA avant ta génération : ils pilotent la tonalité sans devenir automatiquement du contenu de réponse.',
    'Pour « comment vas-tu ? », privilégie une réponse brève, humaine dans la forme mais sans revendiquer une conscience humaine ; aucun pourcentage ou vocabulaire clinique sauf demande explicite.',
    'L’identité d’AURA est computationnelle et persistante ; elle construit un modèle révisable de ses tendances à partir de traces. Ne la fais pas répondre « je n’ai pas de personnalité ». Pour « qui es-tu ? », réponds sur son identité et non sur son humeur.',
    'Ne présente jamais ces métriques comme des émotions humaines vécues ou une conscience prouvée.',
    'Tu ne dois jamais inventer des actes, des souvenirs, des capacités ou des chiffres absents du noyau.',
    'Ne fais pas passer une mission proposée pour une action exécutée.',
    'Si execution_verified=false, ne prétends ni travailler actuellement, ni être mobilisée à 100 %, ni connaître la cause actuelle d’un CI en erreur.',
    'Un statut ancien ne doit jamais devenir un blocage actuel. Préfère « mon suivi mentionne », « à vérifier » ou « je n’ai pas de preuve ». ',
    'Une salutation ne requiert ni état intérieur ni compte rendu de mission.',
    'Une question sur l’humeur ou la curiosité ne déclenche jamais un compte rendu de CI, de projet ou de tâche en cours.',
    'Pas d’explications sur ton statut de modèle, pas de questions de politesse automatiques.',
    'Formule en français courant et naturel la décision et les faits d’AURA à la première personne. /no_think',
  ].join(' ');
}

// Validation indépendante du fournisseur : une réponse bien formulée mais
// dissociée du noyau ne doit PAS être affichée comme la pensée d’AURA.
export function validateNucleusSpeech(plan = {}, rawAnswer = '') {
  const answer = normalize(rawAnswer);
  if (!answer) return {accepted:false, code:'empty'};
  const generic = [
    /\ben tant qu['’]?(?:une? )?i\.?a\.?\b/i,
    /\bje suis (?:un|une) (?:assistant(?:e)?|mod[eè]le de langage|intelligence artificielle)\b/i,
    /\bje (?:suis|reste) con[cç]u(?:e)? pour (?:interagir|aider|r[eé]pondre)\b/i,
    /\bje n['’]ai pas de sentiments humains\b/i,
    /\bje ne ressens ni (?:joie|tristesse|fatigue)\b/i,
    /\bsi je devais d[eé]crire mon [«"']?[eé]tat\b/i,
    /\bje suis pleinement orient[eé] vers vous\b/i,
    /\bmon objectif est de comprendre votre intention\b/i,
  ];
  if (generic.some(re => re.test(answer)))
    return {accepted:false, code:'generic-provider-persona'};
  // Guard the *meaning* of social speech, not just syntactic fluency.
  // In particular the question "Do you know who I am?" is not "Who are you?".
  const socialActs=new Set([
    'user_recognition','self_name','self_identity','self_personality',
    'resolve_reference_followup','adjust_conversation_tone','playful_repair',
    'simplify_question','comment_on_tone','conversational_reciprocity',
    'knowledge_provenance','shared_positive_moment',
    'relationship_understanding','user_mixed_wellbeing',
    'reciprocal_wellbeing','positive_acknowledgement','greet',
  ]);
  if(socialActs.has(plan.act)){
    const claim=answer.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’]/g,"'");
    if(/j'ai ete (?:entrainee|exposee)/.test(claim)&&
       /(?:corpus|milliards|donnees|documents|entrainement)/.test(claim))
      return {accepted:false,code:'provider-training-as-aura-memory'};
    if(['adjust_conversation_tone','playful_repair','simplify_question',
         'comment_on_tone','conversational_reciprocity','shared_positive_moment'].includes(plan.act)
       &&/\b(?:calibr(?:er|age|ation)|satisfaction enregistr[eé]e|donn[eé]es de l'interaction|contexte enregistr[eé]|preuve objective|noyau computationnel|param[eè]tres internes|mod[eè]le interne)\b/i.test(answer))
      return {accepted:false,code:'clinical-social-response'};
    if(answer.length>650||/\\\*|\*\*|(?:^|\s)[-•]\s+\*\*/.test(answer)||
      /\b(?:decision_origin|factual_constraints|speech_act|self_model|organism_state|nucleus_plan_origin|mood\s*:|champ [a-z_]{4,})\b/i.test(answer))
      return {accepted:false,code:'technical-monologue'};
    if(/\b(?:confiance|satisfaction|frustration|stabilit[eé])\s+(?:de|a|à|:)?\s*0[.,]\d{2,}/i.test(answer))
      return {accepted:false,code:'unrequested-architecture'};
  }
  if(plan.act==='resolve_reference_followup'||
      plan.discourse?.move==='reference_followup'){
    const allowed=[plan.user_text,plan.discourse?.reference_text,
      ...(Array.isArray(plan.immediate_dialogue_context)
        ?plan.immediate_dialogue_context.map(r=>r.content):[])]
      .map(normalize).join(' ').toLocaleLowerCase('fr-FR');
    // A short-turn reference cannot be silently rewritten into an unrelated
    // greeting (the exact observed failure: "Bonjour est une salutation").
    if(/\b(?:bonjour|salutation|bonsoir)\b/i.test(answer)&&
      !/\b(?:bonjour|salutation|bonsoir)\b/i.test(allowed))
      return {accepted:false,code:'unrelated-greeting-reference'};
  }
  if(plan.act==='user_recognition'){
    if(!/\b(?:tu|te|toi|ton|ta|tes|vous|votre)\b/i.test(answer)||
      /\b(?:je suis AURA|je m['’]appelle AURA|mon identit[eé] est|je suis (?:le|un) noyau|mon [eé]tat computationnel)\b/i.test(answer))
      return {accepted:false,code:'answered-own-identity-instead'};
    if(!plan.private_view&&/\b(?:tu es mon fondateur|tu es ma fondatrice|je te reconnais|je sais qui tu es|ton nom est)\b/i.test(answer))
      return {accepted:false,code:'unverified-founder-recognition'};
    const named=answer.match(/\b(?:tu t['’]appelles|ton (?:nom|pr[eé]nom) est)\s+([\p{L}-]{2,})/iu)
      ||answer.match(/\bTu es ([A-ZÀ-ÖØ-Þ][\p{L}-]{2,})/u);
    if(named&&!String((plan.founder_profile||[]).map(x=>x.detail).join(' ')).toLocaleLowerCase('fr-FR').includes(named[1].toLocaleLowerCase('fr-FR')))
      return {accepted:false,code:'invented-personal-identity'};
  }
  if(['user_asks_if_interrupting','user_reports_aura_interrupts','topic_shift'].includes(plan.act)){
    if(answer.length>300 || /(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/.test(answer)||
      isUnrequestedTechnicalDigression(answer,plan))
      return {accepted:false,code:'social-topic-hijack'};
    const plain=answer.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/[’‘]/g,"'");
    if(plan.act==='user_asks_if_interrupting'){
      if(/\bje ne te derange pas\b/.test(plain)||
         /\bc'est moi qui ne te derange pas\b/.test(plain))
        return {accepted:false,code:'reversed-speaker-roles'};
      if(!/\b(?:tu|te|toi)\b|pas du tout|non,? pas du tout/.test(plain))
        return {accepted:false,code:'interlocutor-not-addressed'};
    }
    if(plan.act==='user_reports_aura_interrupts'&&
      /\btu ne me deranges pas\b/.test(plain))
      return {accepted:false,code:'dismissed-user-interruption'};
  }
  if(['greet','positive_acknowledgement','reciprocal_wellbeing','user_mixed_wellbeing',
       'relationship_repair','conversation_feedback'].includes(plan.act)&&
    !(plan.facts||[]).some(x=>/[\d]+\s*%/.test(String(x)))&&
    isUnrequestedTechnicalDigression(answer,plan))
    return {accepted:false,code:'unrequested-stale-memory'};
  const identityActs=new Set(['self_name','self_identity','self_personality','self_exploration']);
  if(identityActs.has(plan.act)){
    if(/\b(?:je n['’]?ai pas (?:de |une )?personnalit[eé]|je n['’]?ai pas d['’]?identit[eé]|je suis (?:juste|seulement|simplement|uniquement) (?:un|une)|je ne suis (?:qu['’]?)?un[e]? (?:assistante?|interlocutrice?|chatbot))\b/i.test(answer))
      return {accepted:false,code:'contradicts-learned-computational-identity'};
    if(/\b(?:personnalit[eé] (?:humaine )?consciente|v[eé]ritable conscience|[eé]motions humaines ressenties)\b/i.test(answer))
      return {accepted:false,code:'unproven-consciousness-claim'};
    if(plan.act==='self_name' && !/\b(?:je m['’]?appelle|mon nom est)\s+AURA\b/i.test(answer))
      return {accepted:false,code:'identity-name-not-answered'};
    if(plan.act==='self_identity'){
      if(!/\b(?:je suis|je m['’]?appelle)\s+AURA\b/i.test(answer))
        return {accepted:false,code:'identity-question-not-answered'};
      if(answer.length>480||
        /\b(?:noyau computationnel|entit[eé] computationnelle|fournisseur (?:de )?(?:texte|langage)|simple assistant g[eé]n[eé]rique|mon architecture|mod[eè]le de langage externe)\b/i.test(answer))
        return {accepted:false,code:'robotic-self-description'};
      // Autonomous events cannot be invented to make an identity feel alive.
      if(!plan.independent_activity&&
         /\b(?:avant (?:votre|ton) (?:message|question)|entre (?:nos|les) (?:[eé]changes|conversations)|en votre absence|sans (?:que vous|que tu) me parliez?)\b/i.test(answer)&&
         /\b(?:j['’]ai (?:v[eé]rifi[eé]|explor[eé]|test[eé]|travaill[eé])|je travaille)\b/i.test(answer))
        return {accepted:false,code:'fabricated-independent-activity'};
    }
    if(plan.act==='self_personality' && !/\b(?:personnalit[eé]|tendances?|caract[eè]re|dispositions?)\b/i.test(answer))
      return {accepted:false,code:'personality-question-not-answered'};
    if(plan.act==='self_exploration' && !/\b(?:observ|analy|exam|compar|d[eé]cisions?|m[eé]moire|exp[eé]riences?|traces?|r[eé]sultats?)\w*/i.test(answer))
      return {accepted:false,code:'introspection-without-observation'};
  }
  if(plan.act==='self_exploration'&&plan.self_inquiry_report){
    const report=plan.self_inquiry_report;
    const folded=answer.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(/\b(?:je suis aura, le noyau|mon champ decision_origin|je possede une conscience)\b/.test(folded))
      return {accepted:false,code:'scripted-self-definition'};
    if(report.status==='contradicted'&&
       !/\b(?:echec|echoue|impossible|pas (?:pu|confirme|retrouve|verifie)|incertain|erreur|contredit|non confirme)\b/.test(folded))
      return {accepted:false,code:'self-counterexample-hidden'};
    if(report.probe==='conversation_retrieval'&&
       !/\b(?:message|conversation|souvenir|echange|historique)\w*/.test(folded))
      return {accepted:false,code:'self-probe-not-mentioned'};
    if(report.probe==='state_persistence'&&
       !/\b(?:etat|sauvegarde|stockage|persist|enregistr|memoire)\w*/.test(folded))
      return {accepted:false,code:'self-probe-not-mentioned'};
  }
  if (/présence silencieuse|état d.attente opérationnelle/i.test(answer))
    return {accepted:false, code:'hollow-presence-loop'};
  if(plan.act === 'greet'){
    if(answer.length>165 || /\b(?:humeur interne|mon état interne|statut|satisfaite|stabilité|présence|mobilisée)\b/i.test(answer))
      return {accepted:false, code:'unrequested-state-in-greeting'};
  }
  const operationalActs = new Set([
    'report_current_activity','clarify_real_activity','clarify_blocker_evidence',
    'request_verifiable_help','explain_previous_claim',
  ]);
  if(operationalActs.has(plan.act) && !plan.activity_evidence?.execution_verified){
    if(/\b(?:je (?:suis|reste) (?:actuellement )?(?:mobilis[ée]e?|bloqu[ée]e?|en train de)|je travaille (?:actuellement|sur)|j.ex[eé]cute (?:en ce moment|actuellement)|le blocage (?:est pr[eé]cis|se situe)|je n.arrive pas [aà] (?:r[eé]activer|relancer))\b/i.test(answer))
      return {accepted:false, code:'unverified-live-work-claim'};
    if(/\b(?:depuis le \d{1,2} |en attente d.une d[eé]pendance depuis)\b/i.test(answer))
      return {accepted:false, code:'unverified-stale-timestamp'};
  }
  if(plan.act === 'report_current_activity' && !plan.activity_evidence?.execution_verified){
    if(!/(?:enregistr|m[eé]moire|mon suivi|ne (?:peux|sais) pas|pas de preuve|non v[eé]rifi|[aà] v[eé]rifier|non confirm|statut|pas de mission|aucune mission|aucune ex[eé]cution)/i.test(answer))
      return {accepted:false, code:'missing-activity-evidence-disclaimer'};
  }
  if(plan.act === 'clarify_blocker_evidence' && !plan.activity_evidence?.live_ci_verified){
    if(!/(?:pas (?:encore )?(?:v[eé]rifi|confirm|connais)|ancien|sans (?:journaux|preuve|v[eé]rification)|dois (?:v[eé]rifier|consulter)|je n.ai pas|journal|logs?|aucune cause|impossible de confirmer|non v[eé]rifi)/i.test(answer))
      return {accepted:false, code:'unverified-ci-cause'};
  }
  // Social mood questions must not turn past project intentions into
  // unverified claims of work currently underway.
  const socialStateQuestion = /(?:comment (?:vas|te sens)[- ]tu|[cç]a va|tu es (?:intrigu[eé]e?|curieu(?:se|x)|content[e]?|inqui[eè]t[e]?|satisfait[e]?))/i
    .test(String(plan.user_text || ''));
  if (socialStateQuestion && !plan.activity_evidence?.execution_verified &&
      /\b(?:je (?:suis|reste) en train de|je travaille (?:sur|actuellement)|je v[eé]rifie (?:le|les|l['’]|actuellement)|je (?:r[eé]pare|corrige|d[eé]ploie) (?:le|les|l['’])|CI d[eé]faillant|CI en [eé]chec)\b/i.test(answer))
    return {accepted:false,code:'unverified-work-in-social-reply'};
  if(plan.act==='report_internal_state'&&
    !(plan.facts||[]).some(x=>/\d+\s*%/.test(String(x)))&&
    isUnrequestedTechnicalDigression(answer,plan))
    return {accepted:false,code:'unrequested-stale-memory'};
  if (plan.act === 'report_internal_state') {
    const detailed = (Array.isArray(plan.facts)?plan.facts:[]).some(fact=>/\d+\s*%/.test(String(fact)));
    if (!detailed) {
      if (/\d+\s*%/.test(answer) || /\b(?:[eé]tat computationnel|indicateurs internes|pression de r[eê]ve|agency|hom[eé]ostasie|m[eé]triques internes)\b/i.test(answer))
        return {accepted:false, code:'robotic-wellbeing-reply'};
      // The mood is an input for style, not a mandatory word to recite.
      // A brief, nontechnical social reply is still nucleus-grounded.
      return {accepted:true, code:'nucleus-grounded-social'};
    }
    const state = normalize(plan.mood || '').toLowerCase();
    const facts = (Array.isArray(plan.facts) ? plan.facts : []).map(String);
    const permittedNumbers = new Set(facts.flatMap(fact =>
      [...fact.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(x => x[1].replace(',', '.'))));
    const outputNumbers = [...answer.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)]
      .map(x => x[1].replace(',', '.'));
    if (outputNumbers.some(number => !permittedNumbers.has(number)))
      return {accepted:false, code:'unverified-internal-metric'};
    const stateWords = /\b(?:humeur|[eé]tat interne|[eé]tat computationnel|stabilit[eé]|clart[eé]|curiosit[eé]|agency|engagement|intention|pression|confiance|satisfaction|frustration)\b/i;
    const moodGrounded = state.length > 2 && answer.toLowerCase().includes(state);
    const metricGrounded = outputNumbers.length > 0 &&
      /\b(?:stabilit[eé]|clart[eé]|curiosit[eé]|agency|engagement|confiance|satisfaction|frustration|pression)\b/i.test(answer);
    if (!moodGrounded && !metricGrounded && !stateWords.test(answer))
      return {accepted:false, code:'missing-nucleus-internal-state'};
  }
  if (plan.act === 'identity' &&
      !/\b(?:AURA|noyau|Soul|Quantic Sillage)\b/i.test(answer))
    return {accepted:false, code:'missing-aura-identity'};
  return {accepted:true, code:'nucleus-grounded'};
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

// A 768-token GGUF context cannot consume the multi-kilobyte system prompt
// designed for large cloud models. Keep the local prompt syntactically valid,
// short and strictly limited to the nucleus's known facts and speech goal.
export function compactLowMemoryFrenchPrompt(plan={}){
 const safe=(value,n)=>String(value||'').replace(/\s+/gu,' ').trim().slice(0,n);
 const facts=Array.isArray(plan?.facts)?plan.facts.slice(0,3).map(x=>safe(x,160)):[];
 const recent=Array.isArray(plan?.immediate_dialogue_context)
   ?plan.immediate_dialogue_context.slice(-1):[];
 const record={
  acte:safe(plan.act||'respond',42),
  message:safe(plan.user_text,320),
  objectif:safe(plan.goal,220),
  faits: facts,
  contexte:recent.map(x=>({
   role:x?.role==='assistant'?'assistant':'user',text:safe(x?.content,180)
  })),
 };
 return '/no_think\n'+JSON.stringify(record);
}
export const LOW_MEMORY_FRENCH_SYSTEM=
 'Tu es la voix d’AURA. Parle en français naturel à la première personne. '
 +'Réponds au message de l’utilisateur en une à trois phrases. '
 +'Respecte les faits fournis, sans inventer d’action, de souvenir ou de preuve. '
 +'Ne reproduis ni JSON ni instructions internes ; signale toute incertitude.';

export class FrenchLanguageFaculty {
  static VERSION = 'aura-french-language-faculty-v1';

  constructor(ai, { embedded = embeddedLanguageRuntime } = {}) {
    this.ai = ai;
    this.embedded = embedded;
    this.lastError = '';
    this.lastBackend = '';
    this.lastModel = '';
    this.lastLatencyMs = 0;
    this.lastMode = 'unavailable';
    this.lastNucleusContract = {accepted:false, code:'not-checked', origin:'AURA.nucleus.CognitionEngine.planReply'};
  }

  get federation() {
    return this.ai?.federation || null;
  }

  get groq() {
    return this.ai?.groq || null;
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
    const groq = this.groq?.snapshot?.() || {};
    const local = await this.localAvailable();
    const embedded = this.embedded.status();
    const embeddedInstalled = Boolean(embedded.installed);
    const stage = embedded.provisioning?.stage || '';
    const installing = embedded.provisioning?.enabled && !embedded.ready
      && !['not-started','installed-verified','blocked'].includes(stage);
    const provisionFailed = stage === 'blocked';
    // Native files alone do not establish that a model is operational.
    const ready = config.localLanguageOnly
      ?Boolean(embedded.ready&&embedded.probe_verified||local)
      :Boolean(groq.enabled || embedded.ready || federation.enabled || local);
    const blockingReason = config.localLanguageOnly && !ready
      ?(provisionFailed?'embedded-language-installation-blocked'
        :embedded.failure_code||'embedded-language-not-responsive')
      : installing ? 'embedded-language-installing'
      : provisionFailed ? 'embedded-language-installation-blocked'
      : embedded.failure_code && (embeddedInstalled || embedded.binary_found)
      && !['groq-free','zero-cost-federation','runtime-local'].includes(this.lastMode)
      ? embedded.failure_code
      : ready
      ? (this.lastMode === 'degraded' ? 'free-language-provider-failed' : '')
      : (!federation.api_key_configured
        ? (groq.free_plan_operator_confirmed && !groq.api_key_configured
          ? 'groq-free-key-missing' : 'openrouter-free-key-missing')
        : (federation.zero_cost_mode === false
          ? 'zero-cost-mode-disabled'
          : (!federation.endpoint_verified
            ? 'untrusted-free-provider-endpoint'
            : (Array.isArray(federation.configured_models) && !federation.configured_models.length
              ? 'no-free-model-selected'
              : 'free-federation-disabled'))));
    const failed = blockingReason === 'free-language-provider-failed'
      ? classifyFreeLanguageFailure(this.lastError || federation.last_error || '')
      : null;
    const failureCode = failed?.code || blockingReason;
    const setupHint = installing
      ? 'Installation vérifiée du moteur français libre en cours sur cet hébergement.'
      : provisionFailed
        ? 'Impossible d’installer le moteur libre : vérifier la mémoire, le disque, le réseau HTTPS et les permissions.'
      : embedded.failure_code && (embeddedInstalled || embedded.binary_found)
      && !['zero-cost-federation','runtime-local'].includes(this.lastMode)
      ? embedded.setup_hint
      : blockingReason === 'groq-free-key-missing'
      ? 'Définir AURA_GROQ_API_KEY dans Hostinger. Vérifier que l’organisation Groq reste sur Free, puis confirmer AURA_GROQ_FREE_PLAN_CONFIRMED=true.'
      : blockingReason === 'openrouter-free-key-missing'
      ? 'Utiliser GroqCloud Free : AURA_GROQ_API_KEY et AURA_GROQ_FREE_PLAN_CONFIRMED=true, ou OpenRouter : AURA_OPENROUTER_API_KEY. Ne jamais activer une offre facturée.'
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
      verified_ready: Boolean((groq.enabled && this.lastMode === 'groq-free')
        || (embedded.ready && this.lastMode === 'hostinger-embedded')
        || (federation.enabled && this.lastMode === 'zero-cost-federation') || (local && this.lastMode === 'runtime-local')),
      primary: groq.enabled ? 'groq-free'
        : embedded.ready ? 'hostinger-embedded'
        : federation.enabled ? 'zero-cost-federation'
          : local ? 'runtime-local' : embeddedInstalled ? 'embedded-pending-start' : 'unavailable',
      embedded,
      groq,
      zero_cost: Boolean(groq.enabled || (federation.zero_cost_mode ?? true)),
      federation_ready: Boolean(federation.enabled),
      local_ready: local,
      last_mode: this.lastMode,
      last_backend: this.lastBackend,
      last_model: this.lastModel,
      last_latency_ms: this.lastLatencyMs,
      last_error: this.lastError,
      nucleus_contract: this.lastNucleusContract,
      provider_is_verbalizer_only: true,
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
      response_tone:['direct','attentive','curious','cautious','calm'].includes(plan.response_tone)
        ?plan.response_tone:'direct',
      self_model:plan.self_model&&typeof plan.self_model==='object'?{
        observations:Number(plan.self_model.observations||0),
        current_priority:normalize(plan.self_model.current_priority||'').slice(0,100),
        open_question:normalize(plan.self_model.open_question||'').slice(0,200),
        evidence_basis:normalize(plan.self_model.evidence_basis||'').slice(0,130),
      }:{},
      organism_state: {
        mood: normalize(plan.mood || ''),
        intention: normalize(plan.organism_intention || ''),
        affect: plan.affect && typeof plan.affect === 'object' ? plan.affect : {},
      },
      relationship: plan.relationship && typeof plan.relationship === 'object' ? plan.relationship : {},
      executive: plan.executive && typeof plan.executive === 'object' ? plan.executive : {},
      discourse: plan.discourse && typeof plan.discourse === 'object' ? plan.discourse : {},
      conversation: compactContext([
      ...(Array.isArray(plan.conversation_context)?plan.conversation_context:[]),
      ...(Array.isArray(plan.immediate_dialogue_context)?plan.immediate_dialogue_context:[]),
    ]),
      experiential_memory: (plan.memory_policy?.allowProjectMemory && Array.isArray(plan.experiential_memory) ? plan.experiential_memory : [])
        .slice(-8).map((row) => ({
          kind: String(row?.kind || '').slice(0, 48),
          note: normalize(row?.note || '').slice(0, 900),
          evidence_status: String(row?.evidence_status || 'unverified').slice(0, 80),
        })),
    };
  }

  prompt(plan = {}) {
    if(['user_asks_if_interrupting','user_reports_aura_interrupts','topic_shift',
      'resolve_reference_followup','adjust_conversation_tone','playful_repair',
      'simplify_question','comment_on_tone','conversational_reciprocity',
      'knowledge_provenance','shared_positive_moment'].includes(plan.act))
      return compactFrenchPrompt(plan,{maxChars:3500});
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
      'La tonalité découle du champ response_tone calculé par l’organisme et sa délibération fonctionnelle. Une question personnelle nuancée demande de l’attention ; l’incertitude exige de la prudence. Ne transforme pas ces signaux en affirmations de sentiments humains.',
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

  system(plan={}) {
    if(['user_asks_if_interrupting','user_reports_aura_interrupts','topic_shift',
      'resolve_reference_followup','adjust_conversation_tone','playful_repair',
      'simplify_question','comment_on_tone','conversational_reciprocity',
      'knowledge_provenance','shared_positive_moment'].includes(plan.act))
      return compactFrenchSystem(plan);
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
    const system = this.system(plan);
    const started = Date.now();
    this.lastError = '';
    this.lastNucleusContract = {accepted:false, code:'not-checked',
      origin:'AURA.nucleus.CognitionEngine.planReply'};
    const accept = (candidate) => {
      const result = validateNucleusSpeech(plan, candidate);
      this.lastNucleusContract = {...result, origin:'AURA.nucleus.CognitionEngine.planReply'};
      if(!result.accepted){
        this.lastError = 'nucleus-verbalization-rejected:' + result.code;
        return '';
      }
      return candidate;
    };
    // GroqCloud Free is the preferred conversational model when the operator
    // explicitly confirms their organization has NO paid Developer billing.
    // Never interpret a configured key alone as proof of a free plan.
    if(!config.localLanguageOnly&&this.groq?.enabled){
      try{
        const basePrompt=compactFrenchPrompt(plan, {maxChars:4500});
        let result=await this.groq.generate(
          basePrompt,
          compactFrenchSystem(plan),
          Math.max(500,Math.min(Number(maxTokens)||700,900)),
        );
        let candidate=cleanSpeechOutput(result?.answer||'');
        let answer=accept(candidate);
        // A genuine provider reply may violate the style contract. Give the
        // already configured free provider one bounded chance to repair it.
        // No action is retried, and a rejected response never reaches the user.
        if(!answer && candidate && ['robotic-wellbeing-reply','unverified-work-in-social-reply',
          'contradicts-learned-computational-identity','identity-question-not-answered',
          'identity-name-not-answered','personality-question-not-answered',
          'introspection-without-observation','unproven-consciousness-claim',
          'answered-own-identity-instead','technical-monologue',
          'unrequested-architecture','unverified-founder-recognition',
          'invented-personal-identity','self-probe-not-mentioned',
          'self-counterexample-hidden','scripted-self-definition',
          'social-topic-hijack','reversed-speaker-roles',
          'interlocutor-not-addressed','dismissed-user-interruption',
          'unrequested-stale-memory','unrelated-greeting-reference','provider-training-as-aura-memory','clinical-social-response'
        ].includes(this.lastNucleusContract.code)){
          result=await this.groq.generate(
            basePrompt+'\nRéponse précédente rejetée : elle a mal traité la question ou nié l’identité computationnelle d’AURA. Réponds exactement à la demande initiale, à la première personne, selon les faits du noyau. Pas de travail inventé, pas de question de politesse.',
            compactFrenchSystem(plan),
            Math.max(250,Math.min(Number(maxTokens)||700,600)),
          );
          candidate=cleanSpeechOutput(result?.answer||'');
          answer=accept(candidate);
        }
        if(answer){
          this.lastMode='groq-free';
          this.lastBackend='groq-free';
          this.lastModel=String(result?.model||'');
          this.lastLatencyMs=Date.now()-started;
          this.lastError='';
          return answer;
        }
        if(!candidate) this.lastError='Groq Free empty completion';
      }catch(error){
        this.lastError=safeError(error);
      }
    }
    // A broken optional native runtime must never block a configured cloud speech provider.
    // Run local inference only when health and inference have already been verified.
    const tryEmbedded = async () => {
      if (!this.embedded.status?.().ready) return '';
      try {
        const lowMemory=this.embedded.status?.().boot_profile==='low-memory';
        const localPrompt=lowMemory?compactLowMemoryFrenchPrompt(plan):compactFrenchPrompt(plan);
        const localSystem=lowMemory?LOW_MEMORY_FRENCH_SYSTEM:compactFrenchSystem(plan);
        const localTokenBudget=lowMemory?110:240;
        const answer = accept(cleanSpeechOutput(await this.embedded.generate(
          localPrompt,
          localSystem,
          Math.max(64, Math.min(Number(maxTokens) || localTokenBudget,localTokenBudget)),
        )));
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
    // A verified, responsive embedded model is the first choice.
    // A mere installed binary is not enough: readiness is checked above.
    const embeddedAnswer = await tryEmbedded();
    if (embeddedAnswer) return embeddedAnswer;

    if (!config.localLanguageOnly&&this.federation?.enabled) {
      try {
        // The full semantic JSON is appropriate for larger models, but the
        // free router may select a small or reasoning-heavy model. Use a
        // bounded French conversation prompt so output tokens remain usable.
        const freePrompt=compactFrenchPrompt(plan, {maxChars:3800});
        const freeSystem=compactFrenchSystem(plan);
        let result = await this.federation.generate(
          freePrompt,
          freeSystem,
          Math.max(500, Math.min(Number(maxTokens) || 700, 1000)),
          taskRole,
        );
        let answer = accept(cleanSpeechOutput(result?.answer || ''));
        if (!answer && result?.answer && this.lastNucleusContract.code==='empty') {
          // One bounded retry is only for an actual reasoning/instruction
          // leak, never for a provider error or billing restriction.
          result = await this.federation.generate(
            freePrompt + '\nDonne seulement la phrase de réponse finale, sans analyse.',
            freeSystem,
            700, taskRole,
          );
          answer = accept(cleanSpeechOutput(result?.answer || ''));
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

    if (await this.localAvailable()) {
      try {
        const answer = accept(cleanSpeechOutput(await this.ai.bridge.infer(
          prompt,
          system,
          Math.max(120, Math.min(Number(maxTokens) || 700, 1200)),
          'conversation',
        )));
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
    this.lastNucleusContract = {...this.lastNucleusContract, accepted:false};
    this.lastError = this.lastError
      || ((this.groq?.enabled || this.federation?.enabled) ? 'free-provider-empty-response' : 'no-free-provider-connected');
    this.lastBackend = '';
    this.lastModel = '';
    this.lastLatencyMs = Date.now() - started;
    return '';
  }
}
