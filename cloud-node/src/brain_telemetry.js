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
    origin:'AuraOrganism.publicState',
    measured:false, // deterministic software-state index, not a biological reading
  }));
  const counts=publicState.kernel_status?.counts||{};
  const number=(v)=>Number.isFinite(Number(v))&&Number(v)>=0?Math.floor(Number(v)):null;
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
      detail:source.updated_at?'Dernière mise à jour : '+source.updated_at:'Pas de télémétrie d’organisme vérifiable.',
      source:'AuraOrganism.publicState'},
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
  return {
    version:'brain-telemetry-v1',
    sampled_at:new Date(nowMs).toISOString(),
    runtime_ready:live,
    source, metrics,
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
}
