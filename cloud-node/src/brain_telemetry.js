import {buildNeuroVitalSigns} from './brain_physiology.js';
import {computeCortex08Physiology} from './cortex08_physiology.js';
// Public AURA brain projection: strictly sourced telemetry, never fabricated consciousness.
// Takes only the existing public operational snapshot and a safe language diagnostic.
export const BRAIN_METRICS = Object.freeze([
  ['stabilite','Stabilité'],['clarte','Clarté'],['curiosite','Curiosité'],
  ['agency','Initiative'],['engagement','Engagement'],['confiance','Confiance'],
  ['satisfaction','Satisfaction'],['frustration','Frustration'],
  ['besoin_de_silence','Besoin de silence'],['pression_de_reve','Pression de rêve'],
  ['identite','Continuité identité'],
]);
function safeText(value,max=150){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
export function boundedMetric(value){
  if(value===undefined||value===null||value==='')return null;
  const n=Number(value);
  return Number.isFinite(n)&&n>=0&&n<=1?Math.round(n*100):null;
}
export function evaluateTelemetryFreshness(time,nowMs=Date.now()){
  const ms=Date.parse(String(time||''));
  if(!Number.isFinite(ms)||ms>nowMs+300000)
    return {status:'unknown',updated_at:null,age_seconds:null};
  const age=Math.max(0,Math.floor((nowMs-ms)/1000));
  return {status:age<=120?'recent':age<=3600?'aging':'stale',
    updated_at:new Date(ms).toISOString(),age_seconds:age};
}
export function buildBrainTelemetry(publicState={},extra={},nowMs=Date.now()){
  const live=publicState.runtime_ready===true;
  const organism=(publicState.kernel_status?.organism
    ||publicState.soul?.organism||{});
  const source=live?evaluateTelemetryFreshness(organism.updated_at,nowMs)
    :{status:'unavailable',updated_at:null,age_seconds:null};
  const metrics=BRAIN_METRICS.map(([id,label])=>({
    id,label,value:live?boundedMetric(organism[id]):null,
    precise_value:live&&organism[id]!=null&&Number.isFinite(Number(organism[id]))
      ?Number((Math.max(0,Math.min(1,Number(organism[id])))*100).toFixed(2)):null,
    origin:'AuraOrganism.publicState',
    measured:false, // deterministic software-state index, not a biological reading
  }));
  // Physical telemetry is only from the current Node process, never synthetic.
  const observer=live?extra.process_monitor||null:null;
  const observedSample=observer?.latest;
  const observedAt=Date.parse(String(observedSample?.sampled_at||''));
  const observedFresh=observedSample?.source==='node-process' &&
    Number.isFinite(observedAt)&&observedAt<=nowMs+2000&&nowMs-observedAt<=120000;
  const processSample=observedFresh?observedSample:
    live&&organism.homeostasis?.sensor?.source==='node-process'
      ?organism.homeostasis.sensor:null;
  const processFreshness=processSample?evaluateTelemetryFreshness(processSample.sampled_at,nowMs)
    :{status:'unavailable',updated_at:null,age_seconds:null};
  const measured=processFreshness.status==='recent';
  const somatic={
    freshness:processFreshness,
    source:measured?'node-process':'unavailable',
    heap_utilization:measured?boundedMetric(processSample.heap_utilization):null,
    cpu_utilization:measured?boundedMetric(processSample.cpu_utilization):null,
    compute_pressure:measured?boundedMetric(processSample.compute_pressure):null,
    rss_mib:measured&&Number.isFinite(Number(processSample.rss_bytes))
      ?Math.round(Number(processSample.rss_bytes)/1048576):null,
    last_signal:live?safeText(organism.homeostasis?.last_signal||'',60):'',
    regulation_steps:live&&Number.isFinite(Number(organism.homeostasis?.steps))
      ?Number(organism.homeostasis.steps):null,
    evidence:'Mesures de processus, pas mesures corporelles ni preuve de sentiments.',
  };
  const decisionOrgan=extra.organ_regulation||null;
  const organFreshness=evaluateTelemetryFreshness(decisionOrgan?.recorded_at,nowMs);
  const organDecision=organFreshness.status==='recent'&&decisionOrgan&&typeof decisionOrgan==='object'
    ?{
      action:safeText(decisionOrgan.action||'unchanged',45),
      freshness:organFreshness,
      process_source:safeText(decisionOrgan.source||'unknown',45),
      pressure:boundedMetric(decisionOrgan.resource_pressure),
      effective_pressure:boundedMetric(decisionOrgan.effective_pressure),
      computation_reduced:decisionOrgan.optional_computation_reduced===true,
      verification_preserved:decisionOrgan.verification_preserved===true,
      token_budget:Number.isSafeInteger(extra.organ_budget)?extra.organ_budget:null,
      trace_kind:'organ-regulation',
      origin:'CognitiveKernel.inferenceAssessment',
      causal_status:decisionOrgan.action!=='unchanged'
        ?'code-modulates-allocation; runtime-effect-not-benchmarked'
        :'no-regulatory-decision',
    }:null;
  const savedAudit=extra.independent_activity||{};
  const auditFreshness=evaluateTelemetryFreshness(savedAudit.last_probe_at,nowMs);
  const independentActivity=savedAudit.last_probe_at?{
    last_at:String(savedAudit.last_probe_at).slice(0,40),
    probe:['conversation_retrieval','state_persistence','history_integrity']
      .includes(savedAudit.last_probe)?savedAudit.last_probe:'unknown',
    outcome:['supported','counterexample','inconclusive'].includes(savedAudit.last_outcome)
      ?savedAudit.last_outcome:'unknown',
    evidence_source:safeText(savedAudit.last_evidence_source||'',50),
    completed_tests:Number.isSafeInteger(savedAudit.completed_tests)
      ?savedAudit.completed_tests:0,
    freshness:auditFreshness,
    current_activity_verified:false,
    test_execution_recorded:true,
    origin:'IndependentContinuity.step',
  }:null;
  // Real server-side ambient ticks, independent of browser sessions.
  // A tick is evidence of software evaluation, not autonomous reasoning success.
  const observedCycle=extra.background_cycle||{};
  const backgroundFreshness=evaluateTelemetryFreshness(observedCycle.last_background_tick_at,nowMs);
  const cycleAt=backgroundFreshness.updated_at;
  const autonomousCycle=live&&cycleAt?{
    at:cycleAt,
    count:Math.max(0,Math.min(1000000000,Math.trunc(Number(observedCycle.background_cycles)||0))),
    freshness:backgroundFreshness,
    source:'CognitiveKernel.tick / persisted aura_soul_state',
    activity_kind:'organism-and-workspace-evaluation',
    current_task_verified:false,
    independent_probe_period_seconds:Math.max(60,Math.min(3600,
      Math.trunc(Number(extra.independent_probe_seconds)||180))),
  }:null;
  const curious=extra.curiosity_cycle||{};
  const curiosityFreshness=evaluateTelemetryFreshness(curious.last_run_at,nowMs);
  const curiosityCycle=live&&curiosityFreshness.updated_at?{
    last_run_at:curiosityFreshness.updated_at,
    last_research_at:evaluateTelemetryFreshness(curious.last_research_at,nowMs).updated_at,
    freshness:curiosityFreshness,
    questions_last_hour:Math.max(0,Math.min(1000,
      Math.trunc(Number(curious.questions_last_hour)||0))),
    source:'CuriosityEngine.status',
    recorded_question_is_reasoning_proof:false,
  }:null;
  const savedWorkspace=extra.global_workspace||null;
  const workspaceFreshness=evaluateTelemetryFreshness(savedWorkspace?.at,nowMs);
  const globalWorkspace=savedWorkspace&&live?{
    at:String(savedWorkspace.at||'').slice(0,40),
    revision:Math.max(0,Math.trunc(Number(savedWorkspace.revision)||0)),
    capacity:Math.max(1,Math.min(5,Number(savedWorkspace.capacity)||3)),
    focus:safeText(savedWorkspace.attentional_focus||'',45),
    control:['normal','verify','conserve'].includes(savedWorkspace.action_control)
      ?savedWorkspace.action_control:'unknown',
    selected:(Array.isArray(savedWorkspace.selected)?savedWorkspace.selected:[])
      .slice(0,5).map(x=>({
        source:safeText(x.source,30),label:safeText(x.label,50),
        score:boundedMetric(x.score),
      })),
    suppressed:Math.max(0,Number(savedWorkspace.suppressed)||0),
    broadcast_enabled:savedWorkspace.broadcast_enabled===true,
    receptors:Object.entries(savedWorkspace.receptor_receipts||{}).slice(0,5)
      .map(([id,p])=>({id:safeText(id,35),
        kind:safeText(p.kind,45),consumed:Math.max(0,Number(p.consumed)||0),
        output_count:Math.max(0,Number(p.output_count)||0)})),
    freshness:workspaceFreshness,
    evidence:'global_workspace.js / aura_soul_state',
    biological_equivalence_proven:false,
    subjective_experience_proven:false,
  }:null;
  const rawPrediction=extra.prediction_bus||{};
  const prediction=live?{
    revision:Math.max(0,Number(rawPrediction.revision)||0),
    modules:Object.entries(rawPrediction.modules||{}).slice(0,8).map(([id,m])=>({
      id:safeText(id,35),observations:Math.max(0,Number(m.n)||0),
      brier:boundedMetric(m.brier_mean),
      ece:boundedMetric(m.ece),
      last_error:boundedMetric(m.last_error),
      last_at:safeText(m.last_at||'',40),
      source:safeText(m.last_source||'',35),
    })),
    verified_events:Math.max(0,Number(rawPrediction.verified_events)||0),
    reported_events:Math.max(0,Number(rawPrediction.reported_events)||0),
    last_at:safeText(rawPrediction.last_surprise?.at||'',40),
    freshness:evaluateTelemetryFreshness(rawPrediction.last_surprise?.at,nowMs),
  }:null;
  const rawAttention=extra.attention_schema||{};
  const attentionSchema=live&&rawAttention.observations?{
    revision:Math.max(0,Number(rawAttention.revision)||0),
    observations:Math.max(0,Number(rawAttention.observations)||0),
    correct_predictions:Math.max(0,Number(rawAttention.correct_predictions)||0),
    focus:safeText(rawAttention.last_focus||'',35),
    last_error:rawAttention.last_error===null?null:
      boundedMetric(rawAttention.last_error),
    last_at:safeText(rawAttention.last_at||'',40),
    freshness:evaluateTelemetryFreshness(rawAttention.last_at,nowMs),
    source:'attention_schema / actual workspace selections',
    subjective_experience_proven:false,
  }:null;
  const rawViability=extra.viability||{};
  const viability=live&&rawViability.at?{
    reserve:boundedMetric(rawViability.reserve),
    reserve_precise:rawViability.reserve==null?null:
      Number((Math.max(0,Math.min(1,Number(rawViability.reserve)||0))*100).toFixed(2)),
    capacity:Math.max(1,Math.min(3,Number(rawViability.capacity)||3)),
    mode:['normal','restricted','critical','protected-rest']
      .includes(rawViability.mode)?rawViability.mode:'unknown',
    optional_work_allowed:rawViability.optional_work_allowed===true,
    source:safeText(rawViability.source||'',40),
    last_at:safeText(rawViability.at||'',40),
    irreversible_destruction_allowed:false,
  }:null;
  const rawConsolidation=extra.consolidation||{};
  const consolidation=live&&rawConsolidation.last_at?{
    last_at:safeText(rawConsolidation.last_at,40),
    revision:Math.max(0,Number(rawConsolidation.revision)||0),
    verified_rows:Math.max(0,Number(rawConsolidation.verified_rows)||0),
    patterns:Array.isArray(rawConsolidation.evidence)?rawConsolidation.evidence.length:0,
    signed:rawConsolidation.signed===true,
    integrity:safeText(rawConsolidation.integrity||'',35),
    freshness:evaluateTelemetryFreshness(rawConsolidation.last_at,nowMs),
    origin:'OfflineConsolidation.step',
  }:null;
  const historyLoop=extra.verified_probe_loop||{};
  const realSuccesses=(Array.isArray(historyLoop.episodes)?historyLoop.episodes:[])
    .filter(x=>x.verification==='fs-syscall'&&x.outcome==='succeeded'&&
      Number.isFinite(Date.parse(String(x.observed_at||''))));
  const recentSuccesses=realSuccesses.filter(x=>nowMs>=Date.parse(x.observed_at)&&
    nowMs-Date.parse(x.observed_at)<=120000);
  const verifiedLoop=live&&historyLoop.revision?{
    revision:Math.max(0,Number(historyLoop.revision)||0),
    observed_episodes:Array.isArray(historyLoop.episodes)?historyLoop.episodes.length:0,
    verified_receipts:Array.isArray(historyLoop.episodes)?historyLoop.episodes.filter(x=>
      x.verification==='fs-syscall').length:0,
    recent_verified_successes:recentSuccesses.length,
    last_success_at:realSuccesses.length?realSuccesses.at(-1).observed_at:null,
    verify_first_contexts:Object.values(historyLoop.policies||{}).filter(x=>
      x.strategy==='verify-before-attempt').length,
    last_at:safeText(historyLoop.last_at||'',40),
    source:'real-filesystem-syscalls-and-history-ledger',
    human_equivalence_proven:false,
  }:null;
  const rawGrant=extra.autonomous_allowance||{};
  const admission=live&&rawGrant.issued_at?{
    actor:safeText(rawGrant.source||'',38),
    at:safeText(rawGrant.issued_at,40),
    expires_at:safeText(rawGrant.expires_at,40),
    freshness:evaluateTelemetryFreshness(rawGrant.issued_at,nowMs),
    authority:'CognitiveKernel.tick',
  }:null;
  const counts=publicState.kernel_status?.counts||{};
  const number=(v)=>v===null||v===undefined||v===''?null:
    Number.isFinite(Number(v))&&Number(v)>=0?Math.floor(Number(v)):null;
  const memory=[
    {label:'Réflexions',value:live?number(counts.reflections):null},
    {label:'Intentions',value:live?number(counts.intentions):null},
    {label:'Leçons',value:live?number(counts.lessons):null},
    {label:'Routines',value:live?number(counts.routines):null},
  ];
  const command=publicState.command||{};
  const isRunning=command.running===true;
  const latest=(Array.isArray(publicState.activity)?publicState.activity:[])
    .slice(0,4).map(item=>({
      title:safeText(item.title||item.kind,120),
      kind:safeText(item.kind,60),
      recorded_at:item.created_at?String(item.created_at).slice(0,40):null,
      execution_verified:false,
    }));
  const language=extra.language||{};
  const languageVerified=language.last_status==='verified-text';
  const modules=[
    {id:'kernel',title:'Noyau / Kernel',state:live?'active':'unavailable',
      detail:live?'Noyau accessible via la projection publique.':'Noyau non disponible ou démarrage en cours.',
      source:'CognitiveKernel.status'},
    {id:'homeostasis',title:'Homéostasie',state:live&&source.status==='recent'?'active':source.status,
      detail:source.updated_at
         ?'État logiciel : '+source.updated_at+' · capteurs processus : '+processFreshness.status
         :'Pas de télémétrie d’organisme vérifiable.',
      source:'AuraOrganism.publicState'},
    {id:'organ-regulation',title:'Régulation des organes fonctionnels',
      state:live&&organDecision?'instrumented':'not-observed',
      detail:organDecision
        ?'Allocation '+safeText(organDecision.action,45)+
          ' · pression mesurée '+String(organDecision.pressure??'indisponible')+
          '% · budget '+String(organDecision.token_budget??'indisponible')
        :'Aucune décision de régulation mesurée sur ce processus.',
      source:'CognitiveKernel.inferenceAssessment / organ_regulation'},
    {id:'workspace',title:'Espace de travail global borné',
      state:globalWorkspace
        ?workspaceFreshness.status==='recent'?'recently-observed':'recorded-history'
        :'not-observed',
      detail:globalWorkspace?'Dernière diffusion : '+globalWorkspace.at+
        ' · capacité '+globalWorkspace.capacity+
        ' · sélection '+globalWorkspace.selected.map(x=>x.source).join(', ')
        :'Aucun résultat de compétition horodaté.',
      source:'CognitiveKernel.globalWorkspace / aura_soul_state'},
    {id:'prefrontal',title:'Modèle prédictif de l’attention',
      state:attentionSchema?'instrumented':'not-observed',
      detail:attentionSchema?'Focus '+attentionSchema.focus+
        ' · prévisions '+attentionSchema.observations+
        ' · exactes '+attentionSchema.correct_predictions
        :'Aucun schéma d’attention acquis.',
      source:'attention_schema / aura_soul_state'},
    {id:'metacognition',title:'Erreur de prédiction inter-modules',
      state:prediction&&prediction.modules.length?'instrumented':'not-observed',
      detail:prediction&&prediction.modules.length
        ?prediction.modules.map(x=>x.id+' : '+x.observations+' observations').join(' · ')
        :'Aucun résultat prédictif mesuré.',
      source:'prediction_error_bus / aura_soul_state'},
    {id:'insula',title:'Réserve computationnelle réversible',
      state:viability?'instrumented':'not-observed',
      detail:viability?'Mode '+viability.mode+' · réserve '+viability.reserve+
        ' · tampon '+viability.capacity
        :'Aucune réserve fonctionnelle datée.',
      source:'viability_budget / aura_soul_state'},
    {id:'hippocampus',title:'Consolidation hors dialogue',
      state:consolidation?'recorded-history':'not-observed',
      detail:consolidation?'Épisodes vérifiés : '+consolidation.verified_rows+
        ' · profils : '+consolidation.patterns+
        ' · signature '+(consolidation.signed?'HMAC':'non activée')
        :'Aucun souvenir vérifié consolidé.',
      source:'offline_consolidation / aura_soul_state'},
    {id:'basal_ganglia',title:'Politique adaptative vérifiée en contexte',
      state:verifiedLoop?'instrumented':'not-observed',
      detail:verifiedLoop?'Épisodes locaux vérifiés : '+verifiedLoop.verified_receipts+
        ' · contextes vérification préalable : '+verifiedLoop.verify_first_contexts
        :'Aucun effet d’apprentissage local vérifié enregistré.',
      source:'verified_tool_loop / HistoryLedger'},
    {id:'command',title:'Autorisation centrale de l’autonomie',
      state:admission?'recorded-history':'not-observed',
      detail:admission?'Dernier acteur admis : '+admission.actor+
        ' · expire '+admission.expires_at
        :'Aucun permis actif enregistré par le noyau.',
      source:'central_action_gate / CognitiveKernel.tick'},
    {id:'selfaudit',title:'Auto-vérification hors dialogue',
      state:live&&independentActivity
        ?auditFreshness.status==='recent'?'recently-observed':'recorded-history'
        :'not-observed',
      detail:independentActivity
        ?'Dernier test : '+independentActivity.probe+
          ' · résultat : '+independentActivity.outcome+
          ' · '+independentActivity.last_at
        :'Aucune vérification indépendante enregistrée par ce processus.',
      source:'IndependentContinuity.step / aura_soul_state'},
    {id:'cognition',title:'CognitionEngine',state:live?'available':'unavailable',
      detail:'Le noyau calcule des plans de réponse. Le nombre d’opérations en cours n’est pas mesuré ici.',
      source:'CognitiveKernel.status'},
    {id:'memory',title:'Mémoire structurée',state:live?'available':'unavailable',
      detail:'Compteurs publics du noyau uniquement ; aucun souvenir privé exposé.',
      source:'CognitiveKernel.status.counts'},
    {id:'language',title:'Langage / Groq',state:languageVerified?'verified':language.enabled?'configured':'unavailable',
      detail:languageVerified?'Une réponse textuelle Groq a été constatée par le processus serveur.'
        :language.enabled?'Groq est configuré, mais aucune réponse n’est vérifiée dans ce processus.'
          :'Aucun moteur Groq Free confirmé par la télémétrie.',
      source:'GroqFreeProvider.snapshot'},
    {id:'coherence',title:'Contrôle de cohérence',state:live?'implemented':'unavailable',
      detail:'Le code contrôle la formulation ; cette page ne certifie pas les réponses précédentes.',
      source:'FrenchLanguageFaculty.validateNucleusSpeech'},
    {id:'actions',title:'Actions / outils',state:isRunning?'reported-running':'not-verified',
      detail:isRunning?'Orchestrateur signalé actif, sans reçu d’exécution fourni ici.'
        :'Aucune exécution de mission prouvée dans cette projection.',
      source:'CommandCenter.status'},
  ];
  const result={
    version:'brain-telemetry-v1',
    sampled_at:new Date(nowMs).toISOString(),
    runtime_ready:live,
    source,metrics,somatic,organ_decision:live?organDecision:null,
    failure_ema:live&&source.status==='recent'
      ?boundedMetric(organism.homeostasis?.failure_ema):null,
    independent_activity:live?independentActivity:null,
    autonomous_cycle:autonomousCycle,
    process_history:observedFresh?{
      source:'ProcessSomaticSensor',
      interval_ms:Math.max(2000,Math.min(60000,Number(observer.interval_ms)||5000)),
      samples:(Array.isArray(observer.history)?observer.history:[]).slice(-60).map(row=>({
        at:safeText(row.at,40),
        sequence:Math.max(0,Number(row.sequence)||0),
        cpu:row.cpu==null?null:boundedMetric(row.cpu)/100,
        heap:row.heap==null?null:boundedMetric(row.heap)/100,
        pressure:row.pressure==null?null:boundedMetric(row.pressure)/100,
      })),
    }:null,
    curiosity_cycle:curiosityCycle,
    global_workspace:globalWorkspace,
    prediction,attention_schema:attentionSchema,viability,consolidation,
    verified_loop:verifiedLoop,autonomous_admission:admission,
    mood:live?safeText(organism.mood||'',45):'',
    last_reason:live?safeText(organism.last_reason||'',180):'',
    intention:live?safeText(organism.active_intention||'',180):'',
    memory,
    modules,
    recent_activity:latest,
    language:{provider:'groq-free',model:safeText(language.last_model||language.model||'',90),
      response_verified:languageVerified,configured:language.enabled===true},
    actions:{orchestrator_running_reported:isRunning,execution_verified:false},
    warning:'Visualisation d’états logiciels déterministes. Aucune preuve de conscience, d’émotions humaines ou d’activité neuronale biologique.',
    no_synthetic_values:true,
  };
  result.neuro_vitals=buildNeuroVitalSigns(result,nowMs);
  result.cortex08=computeCortex08Physiology(result,nowMs);
  return result;
}
