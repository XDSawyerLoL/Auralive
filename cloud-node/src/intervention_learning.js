// A social initiative can learn usefulness from an explicit, correlated
// human evaluation. Silence is the default until sufficient observations.
// No unverified implicit approval and no automatic external action.
const score=x=>Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
export function defaultInterventionLearning(){
 return {revision:0,helpful:0,unhelpful:0,last_feedback_id:null};
}
export function observeInterventionFeedback(state=defaultInterventionLearning(),{
 candidateId,expectedId,rating,at=new Date().toISOString(),
}={}){
 if(typeof candidateId!=='string'||!candidateId||candidateId!==expectedId||
    state.last_feedback_id===candidateId||!['helpful','unhelpful'].includes(rating)||
    !Number.isFinite(Date.parse(at)))return {accepted:false,state};
 const updated={revision:(Number(state.revision)||0)+1,
    helpful:Math.max(0,Number(state.helpful)||0)+(rating==='helpful'?1:0),
    unhelpful:Math.max(0,Number(state.unhelpful)||0)+(rating==='unhelpful'?1:0),
    last_feedback_id:candidateId};
 return {accepted:true,state:updated};
}
export function evaluateInterventionLearning(state=defaultInterventionLearning(),{
  evidenceScope='unverified-client-model-output',resourcePressure=0,conversationBusy=false,
  consent=false,
}={}){
 const n=(Number(state.helpful)||0)+(Number(state.unhelpful)||0);
 if(resourcePressure>=.7||conversationBusy)return {act:'silence',reason:'context-protects-attention'};
 if(!consent)return {act:'silence',reason:'no-explicit-consent'};
 if(evidenceScope!=='machine-verified-local-change')
   return {act:'observe',reason:'sensory-hypothesis-not-verified',question_allowed:false};
 if(n<4)return {act:'ask',reason:'not-enough-evaluated-initiatives',
   requires_opt_in:true,question_allowed:true};
 const estimated=score(((Number(state.helpful)||0)+1)/(n+2));
 return estimated>=.6
   ?{act:'ask',reason:'explicit-feedback-predicts-utility',requires_opt_in:true,question_allowed:true}
   :{act:'silence',reason:'explicit-feedback-prefers-silence',question_allowed:false};
}
