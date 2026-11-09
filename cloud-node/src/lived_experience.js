import {randomUUID} from 'node:crypto';
import {substantiveRequest,hasGreetingPrelude} from './composite_intent.js';

// Online autobiographical *strategy* learning, never identity prose.
// Neither raw prompts nor private memory enter this bounded history.
// A correction is an observation of dissatisfaction, not proof that
// an alternative strategy is correct or that an external task succeeded.
const STRATEGIES=Object.freeze(['respond','task_first','clarify','verify','attentive']);
const clamp=(v,min=0,max=1)=>Math.min(max,Math.max(min,Number.isFinite(Number(v))?Number(v):min));
const safeDate=v=>Number.isFinite(Date.parse(String(v||'')))?new Date(v).toISOString():new Date().toISOString();
const num=v=>Math.max(0,Math.min(100000,Number(v)||0));
const contextSet=new Set([
 'task_with_greeting','task_technical','task_general',
 'dialogue_ambivalent','dialogue_identity','dialogue_correction',
 'dialogue_social','dialogue_general'
]);
const remedies={
 task_with_greeting:'task_first',task_technical:'verify',task_general:'verify',
 dialogue_ambivalent:'attentive',dialogue_identity:'clarify',
 dialogue_correction:'clarify',dialogue_social:'attentive',
 dialogue_general:'clarify'
};
function fold(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ');
}
export function isExplicitApproval(text){
 const q=fold(text);
 if(/\b(?:pas du tout|c'est faux|ce n'est pas|c'est pas ca|non tu|tu n'as pas)\b/.test(q))return false;
 return /\b(?:tu as raison|c'est exactement ca|tu as bien compris|c'est la bonne reponse|bonne reponse|bien vu|c'est ce que je voulais|oui c'est ca|tu as compris|merci c'est juste)\b/.test(q);
}
export function isExplicitCorrection(text){
 const q=fold(text);
 return /\b(?:ce n'est pas ce que|c'est pas ce que|tu n'as pas compris|tu m'as mal compris|tu te trompes|c'est faux|c'est incorrect|pas ce que j'ai dit|je voulais dire|je parle plutot|tu as mal compris|ca n'a rien a voir|non, je parle|non je parle)\b/.test(q);
}
export function contextForExperience(text,plan={}){
 const q=fold(text);
 if(substantiveRequest(text))
  return hasGreetingPrelude(text)?'task_with_greeting':
    /\b(?:serveur|fichier|site|code|systeme|application|panne|bug|base de donnees)\b/.test(q)
      ?'task_technical':'task_general';
 if(/\b(?:ca peut aller|pas terrible|ca va moyen|bof|pas bien|malheureux|triste|pas top)\b/.test(q))
   return 'dialogue_ambivalent';
 if(['self_identity','self_name','self_personality','self_exploration'].includes(plan.act))
   return 'dialogue_identity';
 if(plan.discourse?.move==='correction'||isExplicitCorrection(text))
   return 'dialogue_correction';
 if(['greet','positive_acknowledgement','reciprocal_wellbeing','user_mixed_wellbeing'].includes(plan.act))
   return 'dialogue_social';
 return 'dialogue_general';
}
function blank(){
 return {version:'aura-lived-experience-v1',revision:0,observations:0,
   cases:{},events:[],pending:null,last_change_at:null};
}
function validStrategy(s){return STRATEGIES.includes(String(s||''))?String(s):'respond';}
export class LivedExperience {
 defaultState(){return blank();}
 migrate(input){
  const result=blank();
  if(!input||typeof input!=='object')return result;
  result.revision=num(input.revision);
  result.observations=num(input.observations);
  for(const [key,value] of Object.entries(input.cases||{}).slice(0,64)){
   if(!contextSet.has(key)||!value||typeof value!=='object')continue;
   const counts={};
   for(const strategy of STRATEGIES){
    const v=value.strategies?.[strategy]||{};
    counts[strategy]={good:num(v.good),bad:num(v.bad),verified:num(v.verified)};
   }
   result.cases[key]={strategies:counts,observations:num(value.observations)};
  }
  for(const row of (Array.isArray(input.events)?input.events:[]).slice(-48)){
   if(!contextSet.has(row?.context))continue;
   const source=String(row.source||'');
   if(!['founder-correction','founder-approval','reported-outcome','machine-verified'].includes(source))continue;
   result.events.push({id:/^[\da-f-]{36}$/i.test(String(row.id||''))?row.id:randomUUID(),
    context:row.context,strategy:validStrategy(row.strategy),
    result:row.result==='success'?'success':'failure',source,
    at:safeDate(row.at)});
  }
  const p=input.pending;
  if(p&&contextSet.has(p.context)&&p.private_founder===true&&
    /^[\da-f-]{36}$/i.test(String(p.id||''))&&Number.isFinite(Date.parse(String(p.at||'')))){
   result.pending={id:p.id,at:p.at,context:p.context,
    strategy:validStrategy(p.strategy),private_founder:true};
  }
  result.last_change_at=typeof input.last_change_at==='string'&&
    Number.isFinite(Date.parse(input.last_change_at))?input.last_change_at:null;
  return result;
 }
 createPending(input,{text='',plan={},privateFounder=false,at=new Date().toISOString()}={}){
  const state=this.migrate(input);
  // Only authenticated founder history can influence the founder's identity.
  state.pending=privateFounder ? {
   id:randomUUID(),at:safeDate(at),context:contextForExperience(text,plan),
   strategy:validStrategy(plan.learned_strategy||plan.strategy||'respond'),
   private_founder:true,
  }:null;
  return state;
 }
 observe(input,{context,strategy,result,source='founder-correction',
   privateFounder=false,at=new Date().toISOString()}={}){
  const state=this.migrate(input);
  if(!privateFounder||!contextSet.has(context)||!STRATEGIES.includes(strategy))return state;
  if(!['founder-correction','founder-approval','reported-outcome','machine-verified'].includes(source))return state;
  if(!['success','failure'].includes(result))return state;
  const item=state.cases[context]||{
    strategies:Object.fromEntries(STRATEGIES.map(name=>[name,{good:0,bad:0,verified:0}])),
    observations:0,
  };
  const entry=item.strategies[strategy];
  // A person's negative feedback deserves attention but is not a ground
  // truth measurement. Reported external outcomes are even weaker.
  const weight=source==='machine-verified'?1:source==='founder-correction'?.65:source==='founder-approval'?.5:.3;
  entry[result==='success'?'good':'bad']=num(entry[result==='success'?'good':'bad']+weight);
  if(source==='machine-verified')entry.verified=num(entry.verified+1);
  item.observations=num(item.observations+1);
  state.cases[context]=item;state.observations=num(state.observations+1);
  state.revision=num(state.revision+1);
  state.last_change_at=safeDate(at);
  state.events.push({id:randomUUID(),context,strategy,result,source,at:state.last_change_at});
  state.events=state.events.slice(-48);
  return state;
 }
 observeFounderApproval(input,{at=new Date().toISOString()}={}){
  const state=this.migrate(input);
  const p=state.pending;state.pending=null;
  if(!p||Math.abs(Date.parse(at)-Date.parse(p.at))>2*3600*1000)return state;
  return this.observe(state,{context:p.context,strategy:p.strategy,
   result:'success',source:'founder-approval',privateFounder:true,at});
 }
 observeFounderCorrection(input,{at=new Date().toISOString()}={}){
  const state=this.migrate(input);
  const p=state.pending;
  state.pending=null;
  if(!p)return state;
  if(Math.abs(Date.parse(at)-Date.parse(p.at))>2*3600*1000)return state;
  return this.observe(state,{context:p.context,strategy:p.strategy,
    result:'failure',source:'founder-correction',privateFounder:true,at});
 }
 select(input,context,defaultStrategy='respond'){
  const state=this.migrate(input);
  const usual=validStrategy(defaultStrategy);
  const item=state.cases[context];
  const prior=remedies[context]||'verify';
  if(!item)return {strategy:usual,changed:false,basis:'no-experience',
   revision:state.revision,context};
  const current=item.strategies[usual];
  if(!current||current.bad<1.2)return {strategy:usual,changed:false,
    basis:'insufficient-feedback',revision:state.revision,context};
  // Explicit contextual counterfactual: choose a cautious alternative when
  // a repeatedly criticized policy has lower observed utility. A subsequent
  // verified result can reverse that choice.
  const proposed=item.strategies[prior];
  const utility=entry=>(1+entry.good)/(2+entry.good+entry.bad);
  const changed=usual!==prior&&utility(proposed)>utility(current)+.10;
  return {strategy:changed?prior:usual,changed,
   basis:changed?'contextual-feedback':'no-demonstrated-alternative',
   revision:state.revision,context,
   source:'founder-correction-or-correlated-outcome',
   evidence_count:item.observations,
   independently_verified:STRATEGIES.some(k=>item.strategies[k].verified>0)};
 }
 publicState(input){
  const state=this.migrate(input);
  return {
   version:state.version,revision:state.revision,observations:state.observations,
   patterns:Object.entries(state.cases).map(([key,val])=>({
    context:key,observations:val.observations,
    independently_verified:Object.values(val.strategies).reduce((a,x)=>a+x.verified,0),
    suggested_strategy:this.select(state,key).strategy,
   })),
   recent_evidence:state.events.slice(-12).map(x=>({...x})),
   last_change_at:state.last_change_at,
   evidence_status:'feedback-and-reports-not-independent-verification',
   subjective_experience_proven:false,
  };
 }
}
