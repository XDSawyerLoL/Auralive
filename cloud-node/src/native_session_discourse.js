// AURA: local, session-scoped conversational learning from explicit French utterances.
// Learning means extracting user-attributed facts, revising them and testing retrieval.
// This is NOT a neural language model, subjective experience or open-domain fluency.
import {classifyFrenchEventScope} from './native_event_modality.js';
const fold=s=>String(s??'').toLocaleLowerCase('fr-FR').normalize('NFD')
 .replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'")
 .replace(/\s+/g,' ').trim();
const tidy=s=>String(s??'').replace(/\s+/g,' ').trim()
 .replace(/[.!?]+$/u,'').trim();
const valid=s=>s.length>=2&&s.length<=75&&s.split(/\s+/).length<=9
 &&!/[\n\r<>{}\[\];:]/u.test(s)
 &&!/\b(?:si|parce que|quand|lorsque|avant que|apres que|mais|et si)\b/iu.test(fold(s));
const intro=/^(?:(?:non|en fait|je corrige|correction)[\s,:]+){0,2}/iu;
const names=/^[\p{L}-]{2,35}$/u;
export const NATIVE_SESSION_FACT_SCHEMA='aura-session-discourse-fact-v1';

export function parseNativeSessionDisclosure(message){
 if(typeof message!=='string'||message.length>240||
   /[?？\n\r<>]/u.test(message))return null;
 const scope=classifyFrenchEventScope(message);
 if(!scope.asserted)return null;
 const raw=tidy(message).replace(intro,'').trim();
 if(/\b(?:dit que|pense que|affirme que|imagine que|croit que)\b/iu.test(raw))
  return null;
 const flat=fold(raw);
 let m=flat.match(/^(?:je m'appelle|mon prenom est|mon nom est|moi c'est) ([\p{L}-]{2,35})$/u);
 if(m&&names.test(m[1]))return {
  schema:NATIVE_SESSION_FACT_SCHEMA,kind:'name',key:'name',value:m[1],
  positive:true,provenance:'explicit-user-disclosure',scope:'same-session-only'};
 m=flat.match(/^(?:mon|ma) ([\p{L}-]{2,45}?(?: [\p{L}-]{2,25}){0,2}) (?:prefere|preferee|favori|favorite) (?:est|c'est) (.+)$/u);
 if(m&&valid(m[2])){
  return {schema:NATIVE_SESSION_FACT_SCHEMA,kind:'favorite',
   key:'favorite:'+m[1],value:m[2],positive:true,
   provenance:'explicit-user-disclosure',scope:'same-session-only'};
 }
 m=flat.match(/^je prefere (.+?)(?: (?:au|a la|a l') .+)?$/u);
 if(m&&valid(m[1]))return {schema:NATIVE_SESSION_FACT_SCHEMA,
   kind:'preference',key:'preference',value:m[1],positive:true,
   provenance:'explicit-user-disclosure',scope:'same-session-only'};
 m=flat.match(/^je (n'aime (?:pas|plus|jamais)|aime(?: bien)?) (.+)$/u);
 if(m&&valid(m[2]))return {schema:NATIVE_SESSION_FACT_SCHEMA,
   kind:'like',key:'like:'+m[2],value:m[2],
   positive:m[1].startsWith('aime'),provenance:'explicit-user-disclosure',
   scope:'same-session-only'};
 return null;
}
const label=value=>value.replace(/^./u,s=>s.toLocaleUpperCase('fr-FR'));
const cleanTopic=s=>fold(s).replace(/^(?:le|la|les|l') /u,'');
const factValid=f=>f?.schema===NATIVE_SESSION_FACT_SCHEMA&&
 f.provenance==='explicit-user-disclosure'&&f.scope==='same-session-only'&&
 ['name','favorite','preference','like'].includes(f.kind)&&
 typeof f.value==='string'&&valid(f.value)&&
 typeof f.key==='string'&&f.key.length<=65&&
 typeof f.positive==='boolean';
function buildFacts(history,stored){
 const all=[];
 for(const row of Array.isArray(stored)?stored.slice(-64):[]){
  if(factValid(row))all.push(row);
 }
 // Session SQL records cover long-range learning. The current live window
 // also captures a correction before its persistent write becomes visible.
 for(const row of Array.isArray(history)?history.slice(-32):[]){
  if(row?.role!=='user')continue;
  const value=parseNativeSessionDisclosure(row.content);
  if(value)all.push(value);
 }
 const state=new Map();
 for(const f of all){
  if(f.kind==='like'){
   state.set(f.key,f);
  }else state.set(f.key,f); // Later explicit corrections supersede old values.
 }
 return state;
}
function parseQuestion(question){
 if(typeof question!=='string'||question.length>240||!/[?？]\s*$/u.test(question))
  return null;
 let q=fold(question).replace(/[?？]\s*$/u,'').replace(/^(?:et|alors|du coup)\s+/u,'').trim();
 if(/^(?:comment je m'appelle|comment est ce que je m'appelle|tu te souviens de mon prenom|quel est mon prenom|quel est mon nom)$/.test(q))
  return {kind:'name'};
 if(/^(?:qu'est ce que je prefere|je prefere quoi|qu'est ce que je prefere maintenant|tu sais ce que je prefere)$/.test(q))
  return {kind:'preference'};
 if(/^(?:qu'est ce que j'aime|j'aime quoi|tu te souviens de ce que j'aime|quels sont mes gouts)$/.test(q))
  return {kind:'likes'};
 const like=q.match(/^est ce que j'aime (.+)$/u);
 if(like&&valid(like[1]))return {kind:'likes-yes-no',value:like[1]};
 let fav=q.match(/^(?:quel est|quelle est|c'est quoi) (?:mon|ma) ([\p{L}-]{2,45}?(?: [\p{L}-]{2,25}){0,2}) (?:prefere|preferee|favori|favorite)$/u);
 if(!fav)fav=q.match(/^(?:mon|ma) ([\p{L}-]{2,45}?(?: [\p{L}-]{2,25}){0,2}) (?:prefere|preferee|favori|favorite)$/u);
 if(fav)return {kind:'favorite',key:'favorite:'+cleanTopic(fav[1])};
 return null;
}
export function answerNativeSessionDialogue({question='',history=[],storedFacts=[]}={}){
 const request=parseQuestion(question);
 if(!request)return null;
 const state=buildFacts(history,storedFacts);
 let result='';
 if(request.kind==='name'){
  const v=state.get('name');
  if(v?.positive)result="Tu m'as indiqué t'appeler "+label(v.value)+'.';
 }
 if(request.kind==='preference'){
  const v=state.get('preference');
  if(v?.positive)result="D'après ce que tu m'as dit, tu préfères "+v.value+'.';
 }
 if(request.kind==='favorite'){
  const v=state.get(request.key);
  if(v?.positive)result="Tu m'as indiqué que ton "+request.key.slice(9)+
    ' préféré est '+v.value+'.';
 }
 if(request.kind==='likes'){
  const liked=[...state.values()].filter(v=>v.kind==='like'&&v.positive);
  if(liked.length>0&&liked.length<=3)
   result="D'après ce que tu m'as dit, tu aimes "+
    liked.map(v=>v.value).join(liked.length===2?' et ':', ')+'.';
 }
 if(request.kind==='likes-yes-no'){
  const v=state.get('like:'+request.value);
  if(v)result=v.positive?
   'Oui, tu m’as dit aimer '+v.value+'.':
   'Non, tu m’as dit ne pas aimer '+v.value+'.';
 }
 return result?{text:result,source:'aura-native-session-discourse',
  evidence_scope:'same-session-user-statement-unverified',
  grammar_version:NATIVE_SESSION_FACT_SCHEMA,
  coverage:'explicit-session-facts-and-corrections',pretrained_llm:false}:null;
}