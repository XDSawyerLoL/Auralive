// Decision to initiate an exchange belongs to the cognitive kernel, not the LLM.
// A local counterfactual is not proof of external success or a reason to interrupt.
// This arbiter determines an INTENTION; delivery still needs private opt-in.
const validTime=v=>{const t=Date.parse(String(v||''));return Number.isFinite(t)?t:null;};
const contextPattern=/^(task|dialogue)_[a-z_]{3,50}$/;
export function arbitrateConversationInitiative({
  receipt=null,candidate=null,previous={},now=new Date().toISOString(),
  minimumIntervalMs=6*60*60*1000,
}={}){
  const at=validTime(now);
  const decision={at:at===null?null:new Date(at).toISOString(),
    act:'silence',reason:'no-verified-cognitive-event',
    provenance:'kernel-conversation-arbiter-v1',
    spoken:false,delivered:false,external_success_verified:false};
  if(at===null)return {...decision,reason:'invalid-clock'};
  if(!receipt||receipt.origin!=='kernel-autonomous-test'||
    receipt.probe!=='context_policy_ablation'||receipt.outcome!=='supported'||
    receipt.causal_change!==true||receipt.external_success_verified!==false||
    !contextPattern.test(String(receipt.context||''))||
    !Number.isInteger(Number(receipt.experience_revision))||
    Number(receipt.experience_revision)<=0||
    validTime(receipt.at)===null||validTime(receipt.at)>at)
    return decision;
  const key=String(receipt.context)+':'+String(receipt.experience_revision);
  if(previous?.last_evidence_key===key)
    return {...decision,reason:'evidence-already-considered',evidence_key:key};
  const pending=previous?.pending;
  if(pending&&pending.status==='pending-opt-in')
    return {...decision,reason:'previous-initiative-pending',evidence_key:key};
  const last=validTime(previous?.last_delivered_at||previous?.last_decision_at);
  if(last!==null&&at-last<Math.max(60000,Number(minimumIntervalMs)||0))
    return {...decision,reason:'conversation-cooldown',evidence_key:key};
  if(!candidate||candidate.status!=='pending-opt-in'||
    candidate.source!=='independent-kernel-probe'||
    candidate.evidence_key!==key||candidate.external_success_verified!==false||
    candidate.outbound_action_executed!==false)
    return {...decision,reason:'social-drive-prefers-silence',evidence_key:key};
  // Ask for human review rather than announcing an externally verified finding.
  return {...decision,act:'ask',reason:'verified-local-policy-change-and-social-drive',
    evidence_key:key,candidate_id:candidate.id,
    evidence_scope:'local-counterfactual-only',
    requires_opt_in:true,spoken:false,delivered:false};
}
