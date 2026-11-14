// Epistemic boundary for AURA lessons. A reflection or a reported outcome is
// a candidate, not independent evidence, regardless of repetition or score.
// The only promotable proposition is a typed, descriptive observation about
// independently verified, prospective executions in the immutable history.
export const VERIFIED_LESSON_SOURCE='machine-verified-history';
export const LEARNING_CANDIDATE_SCHEMA='aura-epistemic-candidates-v1';
const validTag=(s,n=120)=>typeof s==='string'&&s.length>0&&s.length<=n&&
 /^[a-z0-9_-]+$/i.test(s);
const timestamp=s=>typeof s==='string'&&s.endsWith('Z')&&
 Number.isFinite(Date.parse(s))?Date.parse(s):null;
export function candidateKind(source){
 const s=String(source||'').toLowerCase();
 if(/reflection|evolution|critic|proposal|inference|model/.test(s))
  return 'hypothesis';
 return 'reported';
}
export function evaluateProspectiveLessonEvidence(rows,{
 context_tag,action,candidate_created_at,excluded_episode_ids=[]
}={}){
 const since=timestamp(candidate_created_at);
 if(!validTag(context_tag)||!validTag(action)||since===null||
   !Array.isArray(rows)||rows.length>100)
  return {verified:false,reason:'invalid-evidence-query',independent_runs:0,
    successes:0,failures:0,episode_ids:[]};
 const excluded=new Set(excluded_episode_ids.map(Number));
 const used=new Map();
 const ids=new Set();
 for(const e of rows){
  const id=Number(e.episode_id??e.id);
  const issued=timestamp(e.ts),observed=timestamp(e.observed_at);
  const mission=String(e.mission_id||'');
  if(!Number.isSafeInteger(id)||id<=0||ids.has(id)||excluded.has(id)||
     !mission||mission.length>120||!e.prediction||
     issued===null||observed===null||issued<=since||observed<=issued||
     e.context_tag!==context_tag||e.action!==action||
     e.source!=='machine-verified'||Number(e.ablated)!==0||
     ![0,1].includes(Number(e.success))||
     !/^[a-f0-9]{64}$/i.test(String(e.outcome_hash||'')))
   continue;
  // Independent missions, not two receipts from one run, set the sample size.
  if(used.has(mission))continue;
  ids.add(id);
  used.set(mission,{id,success:Number(e.success),hash:e.outcome_hash});
 }
 const episodes=[...used.values()];
 const successes=episodes.filter(x=>x.success===1).length;
 const failures=episodes.length-successes;
 const verified=episodes.length>=2;
 return {verified,reason:verified?'independent-prospective-machine-receipts':
   'insufficient-independent-prospective-evidence',
   independent_runs:episodes.length,successes,failures,
   episode_ids:episodes.map(x=>x.id),
   // This is an empirical Laplace estimate, never a subjective belief.
   observed_success_estimate:Number(((successes+1)/(episodes.length+2)).toFixed(4))};
}
export function verifiedLessonDescription({context_tag,action},evidence){
 if(!evidence?.verified||!validTag(context_tag)||!validTag(action))
  throw Error('Verified lesson description requires independent prospective receipts');
 return 'Observations techniques vérifiées dans le contexte «'+context_tag+
  '» pour l’action «'+action+'» : '+evidence.successes+
  ' réussite(s) et '+evidence.failures+' échec(s) sur '+
  evidence.independent_runs+' exécutions indépendantes. '
  +'Ce constat ne prouve ni une règle universelle ni un résultat futur.';
}
export function evidenceAblation(rows,options){
 const full=evaluateProspectiveLessonEvidence(rows,options);
 const removed=evaluateProspectiveLessonEvidence(rows,{
  ...options,excluded_episode_ids:full.episode_ids,
 });
 return {full,removed,promotion_depends_on_evidence:
   full.verified===true&&removed.verified===false};
}
