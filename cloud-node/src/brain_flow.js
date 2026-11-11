// Actual AURA module topology + persisted routing observations.
// "installed" is a code capability, NOT evidence of running. Only stored
// brain-hop receipts produce moving edges and actual route animations.
export const BRAIN_NODES=Object.freeze([
 ['input','Entrée utilisateur','conversation','API /api/chat'],
 ['kernel','CognitiveKernel','core','CognitiveKernel.chat'],
 ['homeostasis','AuraOrganism','core','AuraOrganism.beforeInteraction / afterReply'],
 ['memory','Mémoire / Soul','memory','CognitiveKernel.soul + memory retrieval'],
 ['knowledge','KnowledgeVault','memory','knowledge_vault.js'],
 ['journal','Journal de traces','memory','aura_cognitive_traces'],
 ['cognition','CognitionEngine','core','CognitionEngine.planReply'],
 // Human-inspired pathways, not assertions of anatomical equivalence.
 ['thalamus','Filtre thalamique','core','global_workspace.competeInWorkspace'],
 ['workspace','Espace de travail global','core','global_workspace.js'],
 ['prefrontal','Cortex préfrontal fonctionnel','core','global_workspace.decision'],
 ['hippocampus','Hippocampe fonctionnel','memory','workspaceSnapshot / history'],
 ['basal_ganglia','Ganglions de la base fonctionnels','core','gated history strategy'],
 ['insula','Insula fonctionnelle','core','process sensing to attention'],
 ['metacognition','Métacognition et attention','core','SelfInquiryEngine / workspace'],
 ['attention','AttentionMap','core','CognitiveKernel.attentionMap'],
 ['inference','ActiveInference','core','active_inference.js'],
 ['interoception','Régulation interne','core','organ_regulation.js'],
 ['selfaudit','Auto-vérification réelle','memory','independent_continuity.js'],
 ['history','Histoire vérifiée','memory','history_provenance.js'],
 ['semantic','Support sémantique','language','ExpressionLayer.semanticSupport'],
 ['language','Faculté française','language','FrenchLanguageFaculty.generate'],
 ['groq','Groq Free','provider','GroqFreeProvider'],
 ['openrouter','OpenRouter Free','provider','ZeroCostFederation'],
 ['local','llama.cpp local','provider','embedded_language.js'],
 ['coherence','Validation / cohérence','security','validateNucleusSpeech'],
 ['output','Réponse à l’utilisateur','conversation','CognitiveKernel.chat'],
 ['web','WebSubstrate','tools','web_substrate.js'],
 ['fabric','CapabilityFabric','tools','capability_fabric.js'],
 ['toolbox','Toolbox / Skills','tools','toolbox_resources.js + agent_skills.js'],
 ['command','CommandCenter','execution','command_center.js'],
 ['dag','TaskGraphExecutor','execution','task_graph.js'],
 ['agent','AgentRunLedger','execution','agent_runs.js'],
 ['bridge','ExecutionBridge','execution','bridge.js'],
 ['github','GitHub / CI','tools','CommandCenter GitHub API'],
 ['scout','CapabilityScout','research','capability_scout.js'],
 ['curiosity','CuriosityEngine','research','curiosity.js'],
 ['evolution','EvolutionLab','research','evolution.js'],
 ['trading','Trading Lab (paper)','research','trading_lab.js'],
 ['audit','Revenue Audit','tools','revenue_audit.js'],
 ['voice','CloudVoice','language','voice.js'],
 ['peer','PeerMesh','execution','peer_mesh.js'],
 // These modules are concrete imports used by CognitiveKernel / Cloud Node.
 ['dialogue','DialogueStateTracker','core','dialogue_model.js'],
 ['nativelearning','NativePolicyLearner','research','native_learning.js'],
 ['skilllearning','SkillLearningEngine','research','skill_learning.js'],
 ['reflex','ReflexMetrics','research','reflex_metrics.js'],
 ['truth','ActivityTruth','security','activity_truth.js'],
 ['linguisticmemory','LanguageFaculty','memory','language_faculty.js'],
 ['federation','ZeroCostFederation','provider','free_federation.js'],
 ['runtime','RuntimeMetrics','core','metrics.js'],
 ['voicefabric','VoiceStudioProvider','language','voice_fabric.js'],
 ['expert','ExpertBridge','execution','expert_bridge.js'],
 ['horizon','HorizonBridge','execution','horizon.js'],
]);
const CORE_EDGES=Object.freeze([
 ['input','kernel'],['kernel','homeostasis'],['homeostasis','memory'],['memory','cognition'],
 ['cognition','language'],['language','coherence'],['coherence','output'],
 ['cognition','web'],['web','semantic'],['semantic','language'],
 ['language','groq'],['language','openrouter'],['language','local'],
 ['groq','coherence'],['openrouter','coherence'],['local','coherence'],
 ['memory','knowledge'],['kernel','attention'],['kernel','inference'],
 ['cognition','toolbox'],['cognition','command'],['command','dag'],
 ['command','agent'],['command','bridge'],['command','github'],
 ['command','fabric'],['command','audit'],['command','trading'],
 ['kernel','curiosity'],['kernel','scout'],['kernel','evolution'],
 ['kernel','peer'],['output','voice'],['kernel','journal'],
 ['homeostasis','interoception'],['interoception','inference'],['inference','cognition'],
 ['memory','history'],['history','cognition'],['history','basal_ganglia'],
 // Reentrant thalamo-cortical and cortico-striatal analogues.
 ['cognition','thalamus'],['thalamus','workspace'],
 ['workspace','prefrontal'],['workspace','hippocampus'],
 ['workspace','basal_ganglia'],['workspace','insula'],
 ['workspace','metacognition'],
 ['hippocampus','memory'],['prefrontal','cognition'],
 ['basal_ganglia','cognition'],['insula','inference'],
 ['metacognition','thalamus'],
 ['memory','selfaudit'],['selfaudit','cognition'],
 // A verified 'affect-context-provided' hop is persisted by CognitiveKernel.chat.
 ['homeostasis','language'],
 ['cognition','dialogue'],['kernel','nativelearning'],['kernel','skilllearning'],
 ['kernel','reflex'],['kernel','truth'],['memory','linguisticmemory'],
 ['language','federation'],['kernel','runtime'],['voice','voicefabric'],
 ['command','expert'],['command','horizon'],
]);
const ids=new Set(BRAIN_NODES.map(n=>n[0]));
const CATEGORIES=Object.freeze({
 'brain-hop':'Parcours horodaté du noyau',
 'brain-causal':'Bilan causal corrélé à une requête',
 'organ-regulation':'Arbitrage de ressources enregistré',
 'independent-self-test':'Auto-vérification réelle hors dialogue',
 'workspace-broadcast':'Compétition et diffusion attestées',
 'expression':'Formulation enregistrée',
 'web-research':'Recherche web enregistrée',
 'web-research-error':'Échec recherche web',
 'operator':'Commande opérateur enregistrée',
 'agent':'Agent sollicité',
 'swarm':'Collectif d’agents sollicité',
 'reflection':'Réflexion enregistrée',
 'event':'Événement noyau',
});
const safe=(v,max=100)=>String(v??'').replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max);
const parse=(value)=>{try{return typeof value==='object'&&value!==null?value:JSON.parse(String(value||'{}'));}catch{return {};}};
const iso=(value)=>{
 const n=Date.parse(String(value||''));return Number.isFinite(n)?new Date(n).toISOString():null;
};
const validHop=(raw,at,nowMs)=>{
 const context=parse(raw?.context);
 const from=safe(context.from,40),to=safe(context.to,40);
 const dt=iso(context.at||at);
 if(!ids.has(from)||!ids.has(to)||!dt)return null;
 const age=nowMs-Date.parse(dt);
 if(age< -300000||age>86400000)return null;
 return {id:safe(raw.id||'',40),flow_id:safe(context.flow_id||'',80),
  from,to,at:dt,age_ms:Math.max(0,age),
  status:['ok','failed','attempted','unavailable'].includes(context.status)?context.status:'unknown',
  provider:safe(context.provider||'',70),stage:safe(context.stage||'',70),
  evidence:'aura_cognitive_traces.brain-hop'};
};
// Strongly typed public projection: never copy free-form trace context to the browser.
const CAUSAL_METRICS = Object.freeze([
 'stabilite','clarte','confiance','satisfaction','frustration',
 'engagement','agency','besoin_de_silence',
]);
const validFlowId = id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''));
function publicCausalSnapshot(raw={}){
 const metrics={};
 for(const key of CAUSAL_METRICS){
  if(raw?.metrics?.[key]===null||raw?.metrics?.[key]===undefined)continue;
  const n=Number(raw.metrics[key]);
  if(Number.isFinite(n)&&n>=0&&n<=1)metrics[key]=Number(n.toFixed(4));
 }
 const pressure=raw?.process_pressure;
 return {
  metrics,
  process_pressure:pressure!==null&&pressure!==undefined&&Number.isFinite(Number(pressure))
    &&Number(pressure)>=0&&Number(pressure)<=1?Number(Number(pressure).toFixed(4)):null,
  sensor_source:raw?.sensor_source==='node-process'?'node-process':'unavailable',
 };
}
function validCausal(row,nowMs){
 if(row?.kind!=='brain-causal')return null;
 const context=parse(row.context);
 if(!validFlowId(context.flow_id))return null;
 const at=iso(context.at||row.created_at);
 if(!at)return null;
 const age=nowMs-Date.parse(at);
 if(age>86400000||age< -300000)return null;
 const before=publicCausalSnapshot(context.before);
 const after=publicCausalSnapshot(context.after);
 if(!Object.keys(before.metrics).length||!Object.keys(after.metrics).length)return null;
 const delta={};
 for(const key of CAUSAL_METRICS){
  if(before.metrics[key]===undefined||after.metrics[key]===undefined)continue;
  delta[key]=Number((after.metrics[key]-before.metrics[key]).toFixed(4));
 }
 const act=String(context.act||'');
 return {
  flow_id:context.flow_id,at,
  phase:'completed',
  decision:/^[a-z][a-z_]{0,54}$/.test(act)?act:'not-available',
  semantic_support_required:context.semantic_support_required===true,
  language_outcome:['response-produced','response-unavailable'].includes(context.language_outcome)
   ?context.language_outcome:'not-verified',
  action_executed:false,
  before,after,delta,
  evidence:'aura_cognitive_traces.brain-causal',
 };
}
export function buildBrainFlowGraph({telemetry={},traceRows=[],commandRows=[],organismRows=[]}={},nowMs=Date.now()){
 const causalRows=traceRows.map(row=>validCausal(row,nowMs)).filter(Boolean);
 const lastCausalByFlow=new Map();
 for(const receipt of causalRows){
  const older=lastCausalByFlow.get(receipt.flow_id);
  if(!older||Date.parse(receipt.at)>Date.parse(older.at))
   lastCausalByFlow.set(receipt.flow_id,receipt);
 }
 const hops=traceRows.filter(row=>row?.kind==='brain-hop').map(row=>validHop(row,row.created_at,nowMs))
   .filter(Boolean).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-160);
 const flows=new Map();
 for(const hop of hops){
  if(!hop.flow_id)continue;
  if(!flows.has(hop.flow_id))flows.set(hop.flow_id,[]);
  flows.get(hop.flow_id).push(hop);
 }
 const recentFlows=[...flows.entries()].map(([id,steps])=>{
  const last=steps.at(-1);
  return {id,started_at:steps[0].at,updated_at:last.at,
   step_count:steps.length,steps:steps.slice(-22),
   state:steps.some(s=>s.status==='failed'||s.status==='unavailable')?'error':
      last.to==='output'?'completed':'observed-partial',
   // A partial observed route is not evidence of a still-running task.
   running_verified:false,
   causal:lastCausalByFlow.get(id)||null};
 }).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,12);
 const events=[];
 for(const row of traceRows){
  if(row.kind==='brain-hop'||!CATEGORIES[row.kind])continue;
  const when=iso(row.created_at);if(!when||nowMs-Date.parse(when)>86400000)continue;
  events.push({id:'trace-'+safe(row.id,30),at:when,type:safe(row.kind,45),
   label:CATEGORIES[row.kind],source:'aura_cognitive_traces',
   execution_verified:false,flow_id:null});
 }
 for(const row of commandRows){
  const when=iso(row.created_at);if(!when||nowMs-Date.parse(when)>86400000)continue;
  events.push({id:'command-'+safe(row.id,30),at:when,type:'command-event',
   label:'Commande enregistrée : '+safe(row.kind,54),
   source:'aura_command_events',execution_verified:false,flow_id:null});
 }
 for(const row of organismRows){
  const when=iso(row.created_at);if(!when||nowMs-Date.parse(when)>86400000)continue;
  events.push({id:'organism-'+safe(row.id,30),at:when,type:'organism-event',
   label:'Homéostasie : '+safe(row.kind,54),
   source:'aura_organism_events',execution_verified:false,flow_id:null});
 }
 events.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
 const lastByNode=new Map();
 const sourceByNode=new Map();
 function remember(id,at,origin){
  const when=iso(at);if(!ids.has(id)||!when)return;
  const ageMs=Math.max(0,nowMs-Date.parse(when));
  const prev=lastByNode.get(id);
  if(!prev||Date.parse(when)>Date.parse(prev.at)){
    lastByNode.set(id,{at:when,age_ms:ageMs});
    sourceByNode.set(id,origin);
  }
 }
 for(const hop of hops)for(const id of [hop.from,hop.to])
   remember(id,hop.at,'aura_cognitive_traces.brain-hop');
 for(const ev of events){
  const id=ev.type==='web-research'||ev.type==='web-research-error'?'web':
    ev.type==='agent'||ev.type==='swarm'?'agent':
    ev.type==='operator'||ev.type==='command-event'?'command':
    ev.type==='organism-event'?'homeostasis':
    ev.type==='organ-regulation'?'interoception':
    ev.type==='independent-self-test'?'selfaudit':
    ev.type==='workspace-broadcast'?'workspace':
    ev.type==='expression'?'language':
    ev.type==='reflection'?'cognition':ev.type==='event'?'kernel':'';
  if(id)remember(id,ev.at,ev.source);
  if(ev.type==='command-event'&&/github|fleet/i.test(ev.label))remember('github',ev.at,ev.source);
 }
 const TOOL_IDS=new Set(['groq','openrouter','local','web','toolbox','fabric',
  'command','dag','agent','bridge','github','scout','curiosity','evolution',
  'trading','audit','voice','peer']);
 const tools=[...lastByNode].filter(([id])=>TOOL_IDS.has(id))
   .map(([id,hit])=>({
    id,label:BRAIN_NODES.find(n=>n[0]===id)?.[1]||id,
    observed_at:hit.at,source:sourceByNode.get(id),
    status:hit.age_ms<=60000?'observed-recently':'historical-record',
    execution_verified:false,
   })).sort((a,b)=>Date.parse(b.observed_at)-Date.parse(a.observed_at));
 const live=telemetry.runtime_ready===true;
 const sourceState=telemetry.source?.status||'unknown';
 const nodes=BRAIN_NODES.map(([id,label,group,code])=>{
  const hit=lastByNode.get(id);
  const observed=hit&&hit.age_ms<=60000;
  const base=(telemetry.modules||[]).find(m=>m.id===id);
  const configured=id==='groq'?telemetry.language?.configured===true:undefined;
  return {id,label,group,code,
   state:!live?'not-available':observed?'observed-recently':
    id==='homeostasis'?(sourceState==='recent'?'data-recent':sourceState):
    id==='groq'?(configured?'configured':'not-confirmed'):
    base?.state==='active'?'available':
    'installed-not-observed',
   last_observed_at:hit?.at||null,
   // Never turn the presence of a source file into a running status.
   activity_verified:!!observed,evidence:observed?sourceByNode.get(id):'source-code-only'};
 });
 const topology=CORE_EDGES.map(([from,to])=>{
  const matching=hops.filter(h=>h.from===from&&h.to===to);
  const last=matching.at(-1)||null;
  return {from,to,relationship:'declared-architecture',observed_count:matching.length,
    last_observed_at:last?.at||null,
    signal_recent:Boolean(last&&last.age_ms<=20000&&last.status==='ok'),
    signal_status:last?.status||'unobserved',
    // Blueprints are displayed muted. Pulses require actual receipts.
    evidence:last?'aura_cognitive_traces.brain-hop':'declared-code-dependency'};
 });
 const observedUnmodeled=hops.filter(h=>!CORE_EDGES.some(([a,b])=>h.from===a&&h.to===b))
   .map(h=>({from:h.from,to:h.to,relationship:'observed-hop',observed_count:1,
      last_observed_at:h.at,signal_recent:h.age_ms<=20000&&h.status==='ok',
      signal_status:h.status,evidence:'aura_cognitive_traces.brain-hop'}));
 return {version:'brain-flow-v1',sampled_at:new Date(nowMs).toISOString(),
  runtime_ready:live,authorized:true,
  nodes,edges:[...topology,...observedUnmodeled],flows:recentFlows,
  events:events.slice(0,60),
  observed_tools:tools.slice(0,30),
  observed_hop_count:hops.length,
  recent_signal_count:hops.filter(h=>h.age_ms<=20000).length,
  evidence_sources:['aura_cognitive_traces','aura_command_events','aura_organism_events'],
  warning:'Un chemin lumineux correspond à un événement brain-hop réellement persisté. Les connexions grises sont seulement architecturales. Aucun indicateur ne prouve une conscience vécue.',
 };
}

/**
 * Public, read-only projection of verifiable module telemetry.
 * Never ship trace context, titles, SQL IDs, user prompts, command details,
 * secret-bearing provider labels, or raw non-UUID correlation identifiers.
 */
const PUBLIC_FLOW_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_PROVIDERS=new Set(['groq-free','groq','openrouter','openrouter-free','local','llama.cpp','embedded','qwen3']);
export function toPublicBrainFlowGraph(graph){
 return {
  ...graph,
  flows:(graph.flows||[]).map((flow,index)=>({
   id:PUBLIC_FLOW_UUID.test(flow.id)?flow.id:'trajet-'+String(index+1).padStart(2,'0'),
   started_at:flow.started_at,
   updated_at:flow.updated_at,
   step_count:flow.step_count,
   state:flow.state,
   running_verified:false,
   causal:flow.causal ? {
      phase:'completed',
      at:flow.causal.at,
      decision:flow.causal.decision,
      semantic_support_required:flow.causal.semantic_support_required,
      language_outcome:flow.causal.language_outcome,
      action_executed:false,
      before:flow.causal.before,
      after:flow.causal.after,
      delta:flow.causal.delta,
      evidence:'aura_cognitive_traces.brain-causal',
   } : null,
   steps:(flow.steps||[]).map(step=>({
    from:step.from,to:step.to,at:step.at,status:step.status,
    provider:PUBLIC_PROVIDERS.has(step.provider)?step.provider:'',
   })),
  })),
  events:(graph.events||[]).map((event,index)=>({
   id:'event-'+(index+1),
   at:event.at,
   type:event.type,
   label:event.type==='command-event'?'Commande enregistrée':
    event.type==='organism-event'?'Événement de l’organisme':
    CATEGORIES[event.type]||'Événement enregistré',
   source:event.source,
   execution_verified:false,
  })),
  observed_tools:(graph.observed_tools||[]).map(tool=>({
   id:tool.id,label:tool.label,observed_at:tool.observed_at,
   source:tool.source,status:tool.status,execution_verified:false,
  })),
 };
}
