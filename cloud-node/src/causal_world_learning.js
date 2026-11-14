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
const normalizedAffordances=value=>{
 if(!Array.isArray(value)||value.length>12)return [];
 return [...new Set(value.map(x=>String(x||'').toLowerCase().trim())
   .filter(x=>/^[a-z][a-z0-9_-]{2,35}$/.test(x)))].sort();
};
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
export function predictCausalWorld(state,{episodeId,context,action,issuedAt,affordances=[]}={}){
 const old=compact(state);
 if(!validId(episodeId)||!safeContext(context)||!actions.has(action)||
    date(issuedAt)===null||old.pending.some(e=>e.episode_id===Number(episodeId))||
    old.episodes.some(e=>e.episode_id===Number(episodeId)))
  return {accepted:false,reason:'invalid-or-duplicate-prospective-episode',state:old};
 const distribution=likelihood(old.episodes,context,action);
 const prediction={episode_id:Number(episodeId),context,action,issued_at:issuedAt,
  expected_success:distribution.estimated_probability,
  observations_before_prediction:distribution.n,
  affordances:normalizedAffordances(affordances)};
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
  observed_at:observedAt,proof_hash:proofHash,
  affordances:pending.affordances||[]};
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


// Transfer a safe precheck preference across DIFFERENT observed contexts only
// when independent machine-verifiable successes share concrete affordances.
// It cannot transfer permissions, execute tools or claim success in target.
export function proposeCausalPolicyTransfer(state,{
 targetContext,affordances=[],excludeEpisodeIds=[],
}={}){
 const s=compact(state);
 const features=normalizedAffordances(affordances);
 if(!safeContext(targetContext)||features.length<2)
  return {transferred:false,reason:'insufficient-target-affordances'};
 const excluded=new Set(excludeEpisodeIds.map(Number));
 const candidates=s.episodes.filter(e=>
  !excluded.has(Number(e.episode_id))&&e.context!==targetContext&&
  e.action==='verify'&&[0,1].includes(e.success)&&
  Array.isArray(e.affordances)&&e.affordances.length>=2)
  .map(e=>{
   const known=normalizedAffordances(e.affordances);
   const common=known.filter(x=>features.includes(x));
   const union=new Set([...known,...features]);
   return {...e,similarity:union.size?common.length/union.size:0,
    shared_features:common};
  }).filter(e=>e.similarity>=0.6&&e.shared_features.length>=2);
 const sourceContexts=new Set(candidates.map(x=>x.context));
 const independentRuns=new Set(candidates.map(x=>x.run_id));
 const wins=candidates.filter(e=>e.success===1).length;
 const failures=candidates.length-wins;
 if(sourceContexts.size<2||independentRuns.size<2||wins<2||failures>0)
  return {transferred:false,reason:'insufficient-independent-machine-domain-proofs',
   positive_outcomes:wins,contrary_outcomes:failures,
   source_domains:[...sourceContexts]};
 return {transferred:true,status:'safe-precheck-proposal',
  target_context:targetContext,action:'verify',
  source_domains:[...sourceContexts].sort(),
  evidence_ids:candidates.map(e=>e.episode_id),
  evidence_count:candidates.length,
  shared_affordances:[...new Set(candidates.flatMap(e=>e.shared_features))].sort(),
  safety:'only-add-precheck-after-private-authorized-probe',
  target_outcome_verified:false};
}
export function causalPolicyTransferAblation(state,options={}){
 const actual=proposeCausalPolicyTransfer(state,options);
 const without=proposeCausalPolicyTransfer(state,{
  ...options,excludeEpisodeIds:actual.evidence_ids||[]});
 return {actual,without,
  transfer_depends_on_verified_history:Boolean(actual.transferred&&!without.transferred)};
}
