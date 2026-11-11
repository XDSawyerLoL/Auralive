// Bounded, causal functional self-inquiry. The program fixes verifiable
// QUESTIONS and probe contracts, never the answers or a claim of consciousness.
// The optional language model can suggest a probe; only local observations
// can change beliefs. No free-text memories or LLM introspection are stored.
const PROBES=Object.freeze({
 conversation_retrieval:{
  claim:'Je peux retrouver des messages de conversations antérieures.',
  test:'Rechercher des messages effectivement enregistrés avant la question actuelle.',
 },
 state_persistence:{
  claim:'Mes dispositions enregistrées sont accessibles dans mon stockage persistant.',
  test:'Relire un état sauvegardé et comparer sa révision à celle du noyau.',
 },
 history_integrity:{
  claim:'Les épisodes de mon histoire enregistrée forment une chaîne cohérente.',
  test:'Recalculer les empreintes SHA-256 et vérifier la tête de chaîne sur des épisodes réellement stockés.',
 },
});
const clamp=n=>Math.max(0,Math.min(100000,Number.isFinite(Number(n))?Math.floor(Number(n)):0));
const iso=v=>Number.isFinite(Date.parse(String(v||'')))?new Date(v).toISOString():new Date().toISOString();
const PROBE_IDS=Object.keys(PROBES);
export const SELF_PROBE_IDS=Object.freeze([...PROBE_IDS]);
const blank=()=>({
 version:'aura-epistemic-self-model-v1',revision:0,hypotheses:Object.fromEntries(
 PROBE_IDS.map(id=>[id,{observed:0,counterexamples:0,inconclusive:0,last_outcome:'unexamined',last_at:null}])),
 observations:[],
});
export class SelfInquiryEngine {
 defaultState(){return blank();}
 migrate(raw){
  const result=blank();
  if(!raw||typeof raw!=='object')return result;
  result.revision=clamp(raw.revision);
  for(const id of PROBE_IDS){
   const saved=raw.hypotheses?.[id]||{},h=result.hypotheses[id];
   h.observed=clamp(saved.observed);
   h.counterexamples=clamp(saved.counterexamples);
   h.inconclusive=clamp(saved.inconclusive);
   h.last_outcome=['supported','counterexample','inconclusive','unexamined']
    .includes(saved.last_outcome)?saved.last_outcome:'unexamined';
   h.last_at=Number.isFinite(Date.parse(String(saved.last_at||'')))?saved.last_at:null;
  }
  result.observations=(Array.isArray(raw.observations)?raw.observations:[])
   .slice(-24).filter(row=>PROBE_IDS.includes(row?.probe)&&
    ['supported','counterexample','inconclusive'].includes(row?.outcome))
   .map(row=>({probe:row.probe,outcome:row.outcome,
     source:'kernel-probe',at:iso(row.at),revision:clamp(row.revision)}));
  return result;
 }
 chooseProbe(input,{proposal='',topic='',privateView=false}={}){
  if(!privateView)return null;
  const state=this.migrate(input);
  const match=String(proposal||'').match(/(?:^|\n)\s*PROBE\s*[:=]\s*(conversation_retrieval|state_persistence|history_integrity)\b/i);
  if(match)return match[1].toLowerCase();
  const q=String(topic||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(/\b(?:souvenir|conversation|historique|echange|retrouv|memoire)\b/.test(q))
   return 'conversation_retrieval';
  if(/\b(?:chaine|empreinte|hash|integrite|episode)\b/.test(q))
   return 'history_integrity';
  if(/\b(?:sauvegarde|persistance|stockage|enregistr|identite|disposition)\b/.test(q))
   return 'state_persistence';
  return [...PROBE_IDS].sort((a,b)=>{
   const aCount=state.hypotheses[a].observed+state.hypotheses[a].counterexamples+state.hypotheses[a].inconclusive;
   const bCount=state.hypotheses[b].observed+state.hypotheses[b].counterexamples+state.hypotheses[b].inconclusive;
   return aCount-bCount||PROBE_IDS.indexOf(a)-PROBE_IDS.indexOf(b);
  })[0];
 }
 observe(input,{probe,outcome,source='kernel-probe',privateView=false,at=new Date().toISOString()}={}){
  const state=this.migrate(input);
  if(!privateView||source!=='kernel-probe'||!PROBE_IDS.includes(probe)||
    !['supported','counterexample','inconclusive'].includes(outcome))return state;
  const h=state.hypotheses[probe];
  h[outcome==='supported'?'observed':outcome==='counterexample'?'counterexamples':'inconclusive']++;
  h.last_outcome=outcome;h.last_at=iso(at);
  state.revision++;
  state.observations.push({probe,outcome,source:'kernel-probe',at:h.last_at,revision:state.revision});
  state.observations=state.observations.slice(-24);
  return state;
 }
 status(input,id){
  const state=this.migrate(input),h=state.hypotheses[id];
  if(!h)return 'unknown';
  // A single success is evidence of one working retrieval, not unlimited
  // self-knowledge. A latest counterexample preserves uncertainty.
  if(h.last_outcome==='counterexample')return 'contradicted';
  if(h.last_outcome==='inconclusive')return 'inconclusive';
  if(h.observed>0&&h.counterexamples===0)return 'provisionally-supported';
  if(h.observed>0&&h.counterexamples>0)return 'mixed-evidence';
  return 'unexamined';
 }
 summary(input,{probe=null,privateView=false}={}){
  const state=this.migrate(input);
  if(!privateView)return {
   privacy:'not-authenticated',claim:'',status:'unexamined',observation:'',revision:state.revision};
  const id=PROBE_IDS.includes(probe)?probe:PROBE_IDS[0],h=state.hypotheses[id];
  const latest=h.last_outcome;
  const supported={
   conversation_retrieval:'Le noyau a retrouvé des messages antérieurs dans la base de conversation.',
   state_persistence:'Le noyau a relu un état sauvegardé dont la révision correspond à son état actif.',
   history_integrity:'Une vérification cryptographique a confirmé la chaîne des épisodes effectivement contrôlés.',
  };
  const contradicted={
   conversation_retrieval:'La récupération des messages a échoué malgré une tentative explicite.',
   state_persistence:'La lecture de l’état sauvegardé a échoué ou sa révision ne correspond pas.',
   history_integrity:'La vérification cryptographique a signalé une incohérence dans la chaîne.',
  };
  const observation=latest==='supported'?supported[id]
    :latest==='counterexample'?contradicted[id]
    :'L’essai ne permet pas de conclure sur cette capacité.';
  return {
   probe:id,claim:PROBES[id].claim,method:PROBES[id].test,
   status:this.status(state,id),observation,source:latest==='unexamined'?'programmed-hypothesis':'kernel-probe',
   revision:state.revision,
   observed:h.observed,counterexamples:h.counterexamples,inconclusive:h.inconclusive,
   at:h.last_at,
   interpretation:'Ceci mesure une opération précise, pas une conscience ni une capacité générale.',
  };
 }
 advise(input,plan={}){
  const state=this.migrate(input);
  const act=String(plan.act||'');
  const relyOnConversation=['user_recognition','self_identity','self_exploration','self_personality','relationship_understanding'].includes(act);
  const relyOnPersistence=['self_identity','self_exploration','self_personality'].includes(act);
  const caution=(relyOnConversation&&this.status(state,'conversation_retrieval')==='contradicted')
    ||(relyOnPersistence&&this.status(state,'state_persistence')==='contradicted');
  return {
   verify:caution,revision:state.revision,
   evidence_kind:caution?'recent-local-counterexample':'insufficient-or-noncontradictory-evidence',
   limitation:caution?'Une vérification du noyau a contredit une capacité de mémoire que je supposais disponible. Je dois distinguer les souvenirs attestés des suppositions.':'',
  };
 }
 publicState(input){
  const state=this.migrate(input);
  return {
   revision:state.revision,
   probe_counts:Object.fromEntries(PROBE_IDS.map(k=>[k,{
    observed:state.hypotheses[k].observed,
    counterexamples:state.hypotheses[k].counterexamples,
    status:this.status(state,k),
   }])),
   subjective_experience_proven:false,
   claim_source:'bounded-functional-probes-not-LLM-introspection',
  };
 }
}
