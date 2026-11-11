// Attention-schema learning from ACTUAL global workspace selections.
// Models a functional attention transition; never reads unbroadcast content,
// never grants permissions and never claims awareness or subjective feeling.
const safe=v=>String(v||'').replace(/[^a-z0-9_-]/gi,'').slice(0,35);
const clamp=v=>Math.max(0,Math.min(1,Number.isFinite(Number(v))?Number(v):0));
export function initialAttentionSchema(){
 return {version:'aura-attention-schema-v1',revision:0,
  last_focus:'none',observations:0,correct_predictions:0,
  transition_counts:{},last_error:null,last_at:null};
}
export function predictAttention(input={},candidates=[]){
 const state={...initialAttentionSchema(),...(input||{})};
 const previous=safe(state.last_focus)||'none';
 const available=[...new Set((Array.isArray(candidates)?candidates:[])
   .map(x=>safe(x.source)).filter(Boolean))];
 const transitions=state.transition_counts?.[previous]||{};
 const count=available.reduce((sum,x)=>sum+Math.max(0,Number(transitions[x])||0),0);
 const ranked=available.map(source=>({
  source,probability:(Math.max(0,Number(transitions[source])||0)+1)/
     (count+Math.max(1,available.length)),
 })).sort((a,b)=>b.probability-a.probability||
   a.source.localeCompare(b.source));
 const top=ranked[0]||null;
 return {
  previous_focus:previous,predicted_focus:top?.source||'none',
  confidence:top?Number(top.probability.toFixed(4)):0,
  supported_by_transitions:count,
  // No self-guided routing without sufficient observed transitions.
  trusted:count>=3&&Boolean(top?.source),
  at:new Date().toISOString(),source:'measured-workspace-transitions',
 };
}
export function steerAttention(candidates=[],prediction={},enabled=true){
 if(!enabled||prediction.trusted!==true)return [...candidates];
 const predicted=safe(prediction.predicted_focus);
 // Small bounded bias may break real competition ties; user ingress priority
 // and the execution-authority gate are unaffected.
 return candidates.map(c=>c.source===predicted?{
  ...c,salience:clamp(Number(c.salience||0)+Math.min(.07,
    clamp(prediction.confidence)*.09)),
 }:c);
}
export function observeAttention(input={},prediction={},workspace={},at=new Date().toISOString()){
 const state={...initialAttentionSchema(),...(input||{})};
 const observed=safe(workspace?.decision?.attention)||'none';
 if(!workspace?.broadcast_enabled||observed==='none')
  return {observed:false,state,reason:'no-actual-broadcast'};
 const previous=safe(prediction.previous_focus)||'none';
 const expected=safe(prediction.predicted_focus)||'none';
 const counts={...(state.transition_counts||{})};
 counts[previous]={...(counts[previous]||{})};
 counts[previous][observed]=Math.min(100000,
   Math.max(0,Number(counts[previous][observed])||0)+1);
 const correct=observed===expected;
 const outcome={
  version:'aura-attention-schema-v1',
  revision:Math.max(0,Number(state.revision)||0)+1,
  last_focus:observed,
  observations:Math.max(0,Number(state.observations)||0)+1,
  correct_predictions:Math.max(0,Number(state.correct_predictions)||0)+(correct?1:0),
  transition_counts:counts,
  last_error:prediction.trusted?Number((1-(correct?1:0)).toFixed(3)):null,
  last_at:at,
 };
 return {observed:true,state:outcome,
  predicted:expected,actual:observed,correct,
  independently_observed:true,
  prediction_qualified:prediction.trusted===true};
}
export function attentionAblation(state,candidates,options){
 const prediction=predictAttention(state,candidates);
 const withBias=steerAttention(candidates,prediction,true);
 const withoutBias=steerAttention(candidates,prediction,false);
 return {prediction,withBias,withoutBias,
  candidate_change:JSON.stringify(withBias)!==JSON.stringify(withoutBias),
  // Actual decision change requires a caller's competition experiment.
 };
}
