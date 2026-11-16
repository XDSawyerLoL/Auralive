// AURA: computational needs, not biological needs or conscious feelings.
// No "need for a human" or timed instruction to contact anyone.
// Causal utility is learned ONLY from matched, verified outcomes.
export const SOCIAL_HOMEOSTASIS_VERSION='aura-open-action-homeostasis-v1';
export const SOCIAL_ACTIONS=Object.freeze(['silence','inspect_local','consolidate_memory','seek_contact']);
const clamp=x=>Math.min(1,Math.max(0,Number.isFinite(Number(x))?Number(x):0));
const round=x=>Number(x.toFixed(5));
const COST=Object.freeze({silence:0,inspect_local:.014,consolidate_memory:.018,seek_contact:.065});
const initialNeeds=()=>({uncertainty:.35,coherence:.78,novelty_deficit:.22,energy:.76});
const metrics=values=>Object.fromEntries(Object.keys(initialNeeds()).map(k=>
 [k,round(clamp(values?.[k]??initialNeeds()[k]))]));
const weightLoss=needs=>{
 const n=metrics(needs);
 return round(
   .42*Math.max(0,n.uncertainty-.18)**2+
   .30*Math.max(0,.80-n.coherence)**2+
   .23*Math.max(0,n.novelty_deficit-.20)**2+
   .35*Math.max(0,.70-n.energy)**2
 );
};
export function initialSocialHomeostasis(){
 return {version:SOCIAL_HOMEOSTASIS_VERSION,revision:0,needs:initialNeeds(),
  consequences:Object.fromEntries(SOCIAL_ACTIONS.map(a=>[a,{count:0,total_gain:0}])),
  pending:null,last_outcome:null,last_decision:'silence',
  evidence_ids:[],outward_contact_executed:false,
  subjective_experience_proven:false};
}
function readState(input){
 const base=initialSocialHomeostasis();
 const valid=input?.version===base.version?input:{};
 return {...base,...valid,
  needs:metrics(valid.needs),
  consequences:Object.fromEntries(SOCIAL_ACTIONS.map(a=>{
   const row=valid.consequences?.[a]||{};
   return [a,{count:Math.max(0,Math.min(1000,Math.floor(Number(row.count)||0))),
    total_gain:Number.isFinite(Number(row.total_gain))?
      Math.max(-1000,Math.min(1000,Number(row.total_gain))):0}];
  })),
  evidence_ids:Array.isArray(valid.evidence_ids)?valid.evidence_ids.slice(-128):[],
  pending:valid.pending||null};
}
export function advanceSocialHomeostasis(input,{seconds=0,resourcePressure=0,
  observedEvidence=null}={}){
 const state=readState(input);
 const hours=Math.max(0,Math.min(6*3600,Number(seconds)||0))/3600;
 const pressure=clamp(resourcePressure);
 const n={...state.needs};
 // Lack of NEW information ages the model. This is not loneliness.
 n.uncertainty=clamp(n.uncertainty+hours*.018);
 n.novelty_deficit=clamp(n.novelty_deficit+hours*.035);
 // Coherence degrades from contradictions, not from social isolation.
 // Energy conserves/recharges during idle, but pressure drains the reserve.
 n.energy=clamp(n.energy+hours*(.022-pressure*.064));
 const verified=observedEvidence?.verified===true&&
  ['machine-verified-local-information','authenticated-correlated-user-information']
   .includes(observedEvidence?.source);
 if(verified){
  const amount=clamp(observedEvidence.information_gain);
  n.uncertainty=clamp(n.uncertainty-.22*amount);
  n.novelty_deficit=clamp(n.novelty_deficit-.35*amount);
  if(observedEvidence.contradiction===true)
   n.coherence=clamp(n.coherence-.07);
  else if(observedEvidence.consistency_checked===true)
   n.coherence=clamp(n.coherence+.04*amount);
 }
 return {...state,revision:state.revision+1,needs:metrics(n)};
}
// All actions compete on the SAME learned reduction in homeostatic loss.
// Action-dependent costs protect compute budget and the interlocutor's attention.
export function chooseSocialAction(input,{contactConsent=false,
 resourcePressure=0,conversationBusy=false,
 allowLocalInspection=true,allowMemoryConsolidation=true,
 engagementAuthorized=false}={}){
 const state=readState(input),pressure=clamp(resourcePressure);
 const candidates=SOCIAL_ACTIONS.filter(action=>
  action==='silence'||
  (action==='inspect_local'&&allowLocalInspection&&pressure<.85)||
  (action==='consolidate_memory'&&allowMemoryConsolidation&&pressure<.85)||
  (action==='seek_contact'&&contactConsent===true&&engagementAuthorized===true
    &&!conversationBusy&&pressure<.70));
 const ranked=candidates.map(action=>{
  const row=state.consequences[action],mean=row.count?
   row.total_gain/row.count:0;
  // Past improvement matters only if the CURRENT state still has comparable
  // regulatory error. Otherwise a previously useful contact would repeat
  // indefinitely even when nothing needs resolving.
  const currentNeed=Math.min(1,weightLoss(state.needs)/.35);
  const prediction=(row.count/(row.count+2))*mean*currentNeed;
  // No privileged positive social prior. Not knowing the effect of contact
  // is NOT treated as evidence of an automatic reward.
  const intrusion=action==='seek_contact'?.035:0;
  const score=action==='silence'?0:prediction-COST[action]-intrusion;
  return {action,count:row.count,predicted_gain:round(prediction),
   cost:round(COST[action]+intrusion),score:round(score)};
 }).sort((a,b)=>b.score-a.score||SOCIAL_ACTIONS.indexOf(a.action)-SOCIAL_ACTIONS.indexOf(b.action));
 return {action:ranked[0]?.action||'silence',ranked,
  policy:'learned-verified-effects-v1',consent_required:true,
  external_message_authorized:false,resource_pressure:round(pressure),
  subjective_experience_proven:false};
}
export function beginSocialTrial(input,{id,action}={}){
 const state=readState(input);
 if(typeof id!=='string'||!/^trial_[a-z0-9_-]{4,64}$/.test(id)||
  !SOCIAL_ACTIONS.includes(action)||state.pending||
  state.evidence_ids.includes(id))
  return {accepted:false,reason:'invalid-or-outstanding-trial',state};
 return {accepted:true,state:{...state,revision:state.revision+1,
  pending:{id,action,before:metrics(state.needs)},
  last_decision:action}};
}
export function observeSocialTrial(input,{id,after,source,verified=false,
  correlated=false,contactConsent=false}={}){
 const state=readState(input),prior=state.pending;
 if(!prior||id!==prior.id||state.evidence_ids.includes(id)||
  !['machine-verified-local-state','authenticated-correlated-user-feedback'].includes(source)||
  verified!==true||correlated!==true||!after||
  typeof after!=='object'||Object.keys(initialNeeds()).some(k=>
    typeof after[k]!=='number'||!Number.isFinite(after[k])||after[k]<0||after[k]>1)||
  (prior.action==='seek_contact'&&
   (source!=='authenticated-correlated-user-feedback'||contactConsent!==true))||
  (prior.action!=='seek_contact'&&source!=='machine-verified-local-state'))
  return {accepted:false,reason:'unverified-or-uncorrelated-outcome',state};
 const gain=round(weightLoss(prior.before)-weightLoss(after));
 const old=state.consequences[prior.action];
 return {accepted:true,reward:round(gain-COST[prior.action]-
   (prior.action==='seek_contact'?.035:0)),
  state:{...state,revision:state.revision+1,pending:null,
   needs:metrics(after),evidence_ids:[...state.evidence_ids,id].slice(-128),
   consequences:{...state.consequences,[prior.action]:{
    count:old.count+1,total_gain:round(old.total_gain+gain)}},
   last_outcome:{id,action:prior.action,
    verified_source:source,gain,external_success_proven:false}}};
}
export function socialMotivationContext(input,options={}){
 const state=readState(input),decision=chooseSocialAction(state,options);
 return {schema:SOCIAL_HOMEOSTASIS_VERSION,
  functional_state:state.needs,
  objective:'reduce-regulation-error-with-evidence-and-costs',
  regulation_loss:weightLoss(state.needs),
  predictions:decision.ranked,
  selected_action:decision.action,
  action_space:SOCIAL_ACTIONS,
  learned_social_effect_count:state.consequences.seek_contact.count,
  contact_is_not_a_vital_requirement:true,
  no_contact_without_explicit_consent:true,
  no_external_action_from_context:true,
  no_paid_model_required:true,
  biological_feeling_claim:false};
}
