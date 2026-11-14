// Typed, bounded, prospective action/outcome model. A real syscall outcome
// admitted through HistoryLedger is required before an episode becomes
// learning evidence. No human-claim, model text, introspection or sensor
// classification can call this from the private owner probe path.
export const CAUSAL_WORLD_VERSION='aura-causal-world-v1';
const actions=new Set(['respond','verify']);
const safeContext=v=>typeof v==='string'&&/^[a-z0-9_-]{3,70}$/i.test(v);
const date=v=>typeof v==='string'&&v.endsWith('Z')&&Number.isFinite(Date.parse(v))
 ?Date.parse(v):null;
const validId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const compact=s=>({
 ...initialCausalWorld(),...s,
 pending:Array.isArray(s?.pending)?s.pending.slice(-24):[],
 episodes:Array.isArray(s?.episodes)?s.episodes.slice(-128):[]
});
export function initialCausalWorld(){
 return {version:CAUSAL_WORLD_VERSION,revision:0,pending:[],
  episodes:[],last_observed_at:null};
}
function likelihood(rows,context,action){
 const records=rows.filter(e=>e.context===context&&e.action===action);
 const n=records.length,successes=records.filter(e=>e.success===1).length;
 return {n,successes,estimated_probability:Number(((successes+1)/(n+2)).toFixed(4))};
}
export function predictCausalWorld(state,{episodeId,context,action,issuedAt}={}){
 const old=compact(state);
 if(!validId(episodeId)||!safeContext(context)||!actions.has(action)||
    date(issuedAt)===null||old.pending.some(e=>e.episode_id===Number(episodeId))||
    old.episodes.some(e=>e.episode_id===Number(episodeId)))
  return {accepted:false,reason:'invalid-or-duplicate-prospective-episode',state:old};
 const distribution=likelihood(old.episodes,context,action);
 const prediction={episode_id:Number(episodeId),context,action,issued_at:issuedAt,
  expected_success:distribution.estimated_probability,
  observations_before_prediction:distribution.n};
 return {accepted:true,prediction,state:{...old,revision:old.revision+1,
  pending:[...old.pending,prediction].slice(-24)}};
}
export function observeVerifiedCausalWorld(state,{
  episodeId,runId,success,observedAt,proofHash,ledgerReceipt
}={}){
 const old=compact(state),id=Number(episodeId);
 const pending=old.pending.find(p=>p.episode_id===id);
 if(!pending)return {accepted:false,reason:'no-prior-persisted-prediction',state:old};
 if(!validId(episodeId)||typeof runId!=='string'||!runId||
    runId.length>120||typeof success!=='boolean'||
    date(observedAt)===null||date(observedAt)<=date(pending.issued_at)||
    ledgerReceipt?.episode_id!==id||ledgerReceipt?.source!=='machine-verified'||
    ledgerReceipt?.calibrated!==true||
    !/^[a-f0-9]{64}$/i.test(String(proofHash||''))||
    old.episodes.some(e=>e.episode_id===id||e.run_id===runId))
  return {accepted:false,reason:'not-independently-verified-prospective-outcome',state:old};
 const evidence={episode_id:id,run_id:runId,
  context:pending.context,action:pending.action,
  predicted_probability:pending.expected_success,
  success:success?1:0,issued_at:pending.issued_at,
  observed_at:observedAt,proof_hash:proofHash};
 const next={...old,version:CAUSAL_WORLD_VERSION,revision:old.revision+1,
  pending:old.pending.filter(p=>p.episode_id!==id),
  episodes:[...old.episodes,evidence].slice(-128),
  last_observed_at:observedAt};
 return {accepted:true,evidence,state:next};
}
export function causalWorldChoice(state,{
 context,baseline='respond',allowed=['respond','verify'],excludeEpisodeIds=[]
}={}){
 const s=compact(state);
 const disabled=new Set(excludeEpisodeIds.map(Number));
 const data=s.episodes.filter(e=>!disabled.has(Number(e.episode_id))&&
  Number(e.success)>=0&&Number(e.success)<=1);
 const available=allowed.filter(x=>actions.has(x));
 if(!safeContext(context)||!actions.has(baseline)||!available.includes(baseline))
  return {action:baseline,changed:false,reason:'invalid-context-or-baseline',evidence_ids:[]};
 const prior=likelihood(data,context,baseline);
 const candidates=available.filter(x=>x!==baseline).map(x=>{
  const rows=data.filter(e=>e.context===context&&e.action===x);
  const stats=likelihood(data,context,x);
  return {...stats,action:x,
   independent_runs:new Set(rows.map(e=>e.run_id)).size,
   evidence_ids:rows.map(e=>e.episode_id)};
 }).filter(x=>x.independent_runs>=2&&x.estimated_probability>=prior.estimated_probability+0.2)
  .sort((a,b)=>b.estimated_probability-a.estimated_probability||a.action.localeCompare(b.action));
 const choice=candidates[0];
 return {action:choice?.action||baseline,changed:Boolean(choice),
  reason:choice?'prospective-machine-evidence':'insufficient-transfer-evidence',
  evidence_ids:choice?.evidence_ids||[],revision:s.revision,
  baseline_probability:prior.estimated_probability,
  learned_probability:choice?.estimated_probability??null};
}
export function causalWorldAblation(state,options={}){
 const actual=causalWorldChoice(state,options);
 const removed=causalWorldChoice(state,{...options,
  excludeEpisodeIds:actual.evidence_ids});
 return {actual,without_evidence:removed,
  decision_changed:actual.action!==removed.action,
  evidence_count:actual.evidence_ids.length};
}
