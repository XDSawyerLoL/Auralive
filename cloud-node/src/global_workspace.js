// An explicitly functional (not neuroanatomical) recurrent global workspace.
// A bounded thalamic-like competition gates a cortical-like broadcast.
// No LLM can nominate itself, change permissions or inject arbitrary actions.
// Receipts contain only coded signal labels; never text or private memories.
const clamp=v=>Math.min(1,Math.max(0,Number.isFinite(Number(v))?Number(v):0));
const TYPES=new Set(['perception','interoception','memory','executive',
  'metacognition','prediction_error','reentry']);
const RECIPIENTS=Object.freeze([
  'prefrontal','hippocampus','insula','basal_ganglia','metacognition',
]);
export const WORKSPACE_VERSION='aura-global-workspace-v1';
export const WORKSPACE_CAPACITY=3;
export const WORKSPACE_MAX_CANDIDATES=12;
const actions=new Set(['respond','clarify','verify','attentive','task_first']);
const tag=value=>String(value||'').replace(/[^a-z0-9_-]/gi,'').slice(0,48);
const finiteTime=v=>{
  const time=Date.parse(String(v||''));
  return Number.isFinite(time)?time:null;
};

export function workspaceInput({
  userPresent=false,organism={},plan={},history=null,experience=null,metacognition=null,
  prediction=null,consolidation=null,memoryProposals=[],previous=null,nowMs=Date.now(),
}={}){
  const candidates=[];
  const push=(source,label,salience,confidence,metadata={})=>{
    candidates.push({source,label,salience:clamp(salience),
      confidence:clamp(confidence),at:new Date(nowMs).toISOString(),metadata});
  };
  if(userPresent)push('perception','user-request',1,1,{
    act:tag(plan.act||'respond'),
  });
  push('executive','current-plan',.52,.85,{act:tag(plan.act||'respond')});
  const sensor=organism.homeostasis?.sensor;
  const sensorMs=finiteTime(sensor?.sampled_at);
  const pressure=sensor?.source==='node-process'&&sensorMs!==null&&
    nowMs-sensorMs>=0&&nowMs-sensorMs<=120000
    ?clamp(sensor.compute_pressure):0;
  if(pressure>=.35)push('interoception','resource-pressure',
    .53+pressure*.4,.98,{pressure:Number(pressure.toFixed(3))});
  const error=clamp(organism.homeostasis?.failure_ema);
  if(error>=.3)push('prediction_error','recent-failure',
    .47+error*.45,.7,{error:Number(error.toFixed(3))});
  // The prediction bus contributes only fresh, independently observable error;
  // reports and old surprises never manufacture current attention.
  const pAt=finiteTime(prediction?.at);
  if(pAt!==null&&nowMs-pAt>=0&&nowMs-pAt<=120000&&
    ['machine-observed','machine-verified'].includes(prediction?.source))
    push('prediction_error','cross-module-surprise',
      .50+clamp(prediction.error)*.48,.94,{
        error:Number(clamp(prediction.error).toFixed(3)),
      });
  if(consolidation?.verified_rows>=2&&Array.isArray(consolidation?.evidence)&&
    consolidation.evidence.length>0)
    push('memory','verified-consolidated-pattern',.56,.9,{action:'respond'});
  if(metacognition?.verify===true)push('metacognition','memory-check-required',
    .94,.98,{kind:'verify'});
  // Individual, reference-only candidates. No selected 'memory' category
  // can authorize a different note or an entire conversation transcript.
  for(const m of (Array.isArray(memoryProposals)?memoryProposals:[]).slice(0,3)){
    const ref=String(m.ref||'');
    if(!/^(?:note|message):[0-9a-f-]{1,40}$/i.test(ref))continue;
    const label=ref.startsWith('note:')?'retrieved-note':'retrieved-message';
    push('memory',label,Math.max(.55,Math.min(.87,Number(m.salience)||.62)),
      .94,{ref,action:'respond'});
  }
  if(history?.changed&&history?.eligible)
    push('memory','verified-history-changed-policy',.82,.93,
      {action:actions.has(history.action)?history.action:'respond'});
  // Human feedback can propose an alternative, but its lower confidence
  // cannot silently bypass the workspace as an independently verified fact.
  if(experience?.changed===true)
    push('memory','reported-feedback-policy',.61,.65,
      {action:actions.has(experience.strategy)?experience.strategy:'respond'});
  const last=previous?.selected;
  if(Array.isArray(last)&&last.some(x=>x.source==='prediction_error')){
    push('reentry','unresolved-error',.58,.6,{kind:'recheck'});
  }
  return candidates.slice(0,WORKSPACE_MAX_CANDIDATES);
}

export function competeInWorkspace(candidates=[],{
  capacity=WORKSPACE_CAPACITY,broadcast=true,
  nowMs=Date.now(),previous=null,
}={}){
  const size=Math.max(1,Math.min(5,Math.floor(Number(capacity)||WORKSPACE_CAPACITY)));
  const normalized=(Array.isArray(candidates)?candidates:[])
    .slice(0,WORKSPACE_MAX_CANDIDATES)
    .filter(c=>TYPES.has(c?.source)&&/^[a-z][a-z0-9_-]{1,47}$/.test(c?.label||''))
    .map((c,index)=>{
      const time=finiteTime(c.at);
      const age=time===null?Infinity:nowMs-time;
      // A stale measurement cannot win attention by its historical score.
      const fresh=age>=0&&age<=120000;
      const base=clamp(c.salience)*(.65+.35*clamp(c.confidence));
      const lastChosen=(previous?.selected||[]).some(p=>
        p.source===c.source&&p.label===c.label);
      const persistence=lastChosen&&fresh?.015:0;
      return {source:c.source,label:c.label,
        score:fresh?Math.min(1,base+persistence):0,confidence:clamp(c.confidence),
        priority:c.source==='perception'&&c.label==='user-request'?1:0,
        metadata:parseMetadata(c.source,c.metadata),
        ordinal:index,
      };
    })
    .filter(c=>c.score>0)
    .sort((a,b)=>b.priority-a.priority||b.score-a.score||a.ordinal-b.ordinal);
  const selected=normalized.slice(0,size).map(x=>({
    source:x.source,label:x.label,score:Number(x.score.toFixed(4)),
    confidence:x.confidence,metadata:x.metadata,
  }));
  const delivered=broadcast?RECIPIENTS.map(recipient=>({
    recipient,content:selected,
  })):[];
  const received=Object.fromEntries(RECIPIENTS.map(recipient=>[
    recipient,broadcast?selected:[],
  ]));
  // Only an actual delivery affects decision selection; a rendered candidate
  // list alone must have no causal authority.
  const seen=received.prefrontal;
  const verify=seen.some(c=>c.source==='metacognition')||
    seen.some(c=>c.source==='prediction_error'&&c.score>=.7);
  const reserve=seen.some(c=>c.source==='interoception'&&
    Number(c.metadata.pressure)>=.75);
  const attention=seen[0]?.source||'none';
  return {
    version:WORKSPACE_VERSION,capacity:size,
    candidates_considered:normalized.length,selected,
    suppressed:Math.max(0,normalized.length-selected.length),
    broadcast_enabled:Boolean(broadcast),
    broadcasts:delivered.map(d=>({recipient:d.recipient,
      received_count:d.content.length})),
    received,
    decision:{attention,control:verify?'verify':reserve?'conserve':'normal',
      verification_required:verify,
      optional_compute_deferred:reserve,
      information_available:seen.length>0},
    recorded_at:new Date(nowMs).toISOString(),
    brain_analogy:'functional-cortico-thalamo-cortical-not-neurons',
    subjective_experience_proven:false,
  };
}
function parseMetadata(source,metadata={}){
  if(source==='perception'||source==='executive')
    return {act:actions.has(metadata.act)?metadata.act:'respond'};
  if(source==='interoception')return {pressure:clamp(metadata.pressure)};
  if(source==='prediction_error')return {error:clamp(metadata.error)};
  if(source==='memory')return {
    action:actions.has(metadata.action)?metadata.action:'respond',
    ref:/^(?:note|message):[0-9a-f-]{1,40}$/i.test(String(metadata.ref||''))
      ?String(metadata.ref):'',
  };
  if(source==='metacognition'||source==='reentry')return {kind:tag(metadata.kind)};
  return {};
}
// Persist a strict, content-free snapshot; the full routed object is transient.
export function workspaceSnapshot(cycle,previous={}){
  const base={revision:Math.max(0,Number(previous?.revision)||0)+1,
    at:cycle.recorded_at,capacity:cycle.capacity,
    broadcast_enabled:cycle.broadcast_enabled,
    selected:cycle.selected.map(({source,label,score})=>({source,label,score})),
    action_control:cycle.decision.control,
    attentional_focus:cycle.decision.attention,
    suppressed:cycle.suppressed,
    receivers:cycle.broadcasts.map(x=>x.recipient),
  };
  return base;
}
export function broadcastAblation(candidates,options={}){
  const withBroadcast=competeInWorkspace(candidates,{...options,broadcast:true});
  const withoutBroadcast=competeInWorkspace(candidates,{...options,broadcast:false});
  const oneSlot=competeInWorkspace(candidates,{...options,broadcast:true,capacity:1});
  return {withBroadcast,withoutBroadcast,oneSlot,
    broadcast_causal:withBroadcast.decision.control!==withoutBroadcast.decision.control||
      withBroadcast.decision.attention!==withoutBroadcast.decision.attention,
    capacity_causal:withBroadcast.decision.control!==oneSlot.decision.control||
      withBroadcast.decision.attention!==oneSlot.decision.attention,
    no_automatic_consciousness_inference:true,
  };
}
