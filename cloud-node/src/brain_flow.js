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
 ['attention','AttentionMap','core','CognitiveKernel.attentionMap'],
 ['inference','ActiveInference','core','active_inference.js'],
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
]);
const CORE_EDGES=Object.freeze([
 ['input','homeostasis'],['homeostasis','memory'],['memory','cognition'],
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
]);
const ids=new Set(BRAIN_NODES.map(n=>n[0]));
const CATEGORIES=Object.freeze({
 'brain-hop':'Parcours horodaté du noyau',
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
export function buildBrainFlowGraph({telemetry={},traceRows=[],commandRows=[],organismRows=[]}={},nowMs=Date.now()){
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
   running_verified:false};
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
