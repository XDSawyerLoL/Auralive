import {organSignals} from './organ_regulation.js';

// Autonomy here means bounded work initiated by the running kernel,
// not a simulated experience, unsupervised network call or user message.
const ONE_HOUR=60*60*1000;
const date=v=>{const n=Date.parse(String(v||''));return Number.isFinite(n)?n:null;};
const iso=ms=>new Date(ms).toISOString();
const allowed=new Set(['conversation_retrieval','state_persistence','history_integrity']);
export function independentInquiryDue(state={},nowMs=Date.now(),periodMs=ONE_HOUR){
  const previous=date(state?.last_probe_at);
  if(!Number.isFinite(nowMs))return false;
  return previous===null||nowMs-previous>=Math.max(60000,Number(periodMs)||ONE_HOUR);
}
export class IndependentContinuity {
  constructor({db,selfInquiry,history,clock=()=>Date.now()}={}){
    if(!db||!selfInquiry||!history)throw new Error('Independent inquiry dependencies missing');
    this.db=db;this.selfInquiry=selfInquiry;this.history=history;this.clock=clock;
  }
  async step({soul}={}){
    if(!soul||typeof soul!=='object')throw new Error('Soul required');
    const nowMs=this.clock(),at=iso(nowMs);
    const before=soul.independent_activity||{};
    if(!independentInquiryDue(before,nowMs))
      return {executed:false,reason:'not-due',soul};
    const signal=organSignals(soul.organism||{},nowMs);
    // An autonomous investigation must not compromise an overloaded process.
    if(signal.resource_pressure>=.75)
      return {executed:false,reason:'resource-pressure',soul};
    const probe=this.selfInquiry.chooseProbe(soul.epistemic_self,{
      privateView:true,topic:'',
    });
    if(!allowed.has(probe))
      return {executed:false,reason:'no-valid-probe',soul};
    let outcome='inconclusive',basis='unavailable';
    try{
      if(probe==='conversation_retrieval'){
        const [rows]=await this.db.execute(
          "SELECT id FROM aura_cloud_messages WHERE session_id='private-founder' "+
          "AND role='user' AND created_at<? ORDER BY id DESC LIMIT 1",[at]);
        outcome=rows.length?'supported':'inconclusive';
        basis=rows.length?'database-previous-message':'database-no-previous-message';
      }else if(probe==='state_persistence'){
        const [rows]=await this.db.execute('SELECT state FROM aura_soul_state WHERE id=1');
        let saved=null;
        try{saved=rows[0]?.state?JSON.parse(rows[0].state):null;}catch{saved=null;}
        // A persisted revision can be compared without interpreting LLM output.
        outcome=saved&&saved.seed===soul.seed&&
          Number(saved.emergent_identity?.revision||0)===
          Number(soul.emergent_identity?.revision||0)
          ?'supported':saved?'counterexample':'inconclusive';
        basis='database-soul-revision';
      }else if(probe==='history_integrity'){
        const check=await this.history.verifyChain({maxEpisodes:2000});
        outcome=check.verified&&check.checked>0?'supported':
          check.reason==='broken-chain'||check.reason==='head-mismatch'
            ?'counterexample':'inconclusive';
        basis='bounded-sha256-chain-replay';
      }
    }catch{
      // DB availability problems cannot be mistaken for proof about identity.
      outcome='inconclusive';basis='probe-unavailable';
    }
    // Independently verified task records can give rise to NEW, context-bound
    // hypotheses. Retrospective evidence can create candidates only;
    // promotion still requires future, independently verified outcomes.
    let newCandidates=0;
    if(Math.max(0,Number(before.completed_tests)||0)%3===2){
      try{
        const [contexts]=await this.db.execute(
          'SELECT e.context_tag FROM aura_history_episodes e '+
          'JOIN aura_history_outcomes o ON o.episode_id=e.id '+
          "WHERE e.ablated=0 AND e.kind='action' AND o.source='machine-verified' "+
          'GROUP BY e.context_tag ORDER BY MAX(e.id) DESC LIMIT 3');
        for(const row of contexts){
          const proposals=await this.history.discoverHypotheses({
            context_tag:row.context_tag,limit:1,
          });
          newCandidates+=proposals.filter(p=>p.created===true).length;
        }
      }catch{
        // No database migration or verified evidence: never invent a candidate.
      }
    }
    const epistemic=this.selfInquiry.observe(soul.epistemic_self,{
      probe,outcome,source:'kernel-probe',privateView:true,at,
    });
    const old=soul.epistemic_self?.hypotheses?.[probe]?.last_outcome||'unexamined';
    const changed=old!==outcome;
    const receipt={at,probe,outcome,basis,changed,
      new_hypotheses_proposed:newCandidates,
      origin:'kernel-autonomous-test',external_action:false,
      consciousness_claim:false};
    return {
      executed:true,reason:'measured-self-test',
      soul:{...soul,epistemic_self:epistemic,independent_activity:{
        last_probe_at:at,last_probe:probe,last_outcome:outcome,
        last_evidence_source:basis,last_changed_at:changed?at:before.last_changed_at||null,
        completed_tests:Math.min(100000,Math.max(0,Number(before.completed_tests)||0)+1),
        last_receipt:receipt,
      }},receipt,
    };
  }
}
