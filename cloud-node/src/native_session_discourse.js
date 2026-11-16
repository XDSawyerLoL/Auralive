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
 // Keep the user's French diacritics and proper-noun capitalization in the
 // utterance; the folded form is used only for matching and comparison.
 const surface=value=>{
  const pos=flat.indexOf(value);
  return pos>=0?raw.slice(pos,pos+value.length):value;
 };
 let m=flat.match(/^(?:je m'appelle|mon prenom est|mon nom est|moi c'est) ([\p{L}-]{2,35})$/u);
 if(m&&names.test(m[1]))return {
  schema:NATIVE_SESSION_FACT_SCHEMA,kind:'name',key:'name',value:surface(m[1]),
  positive:true,provenance:'explicit-user-disclosure',scope:'same-session-only'};
 m=flat.match(/^(?:mon|ma) ([\p{L}-]{2,45}?(?: [\p{L}-]{2,25}){0,2}) (?:prefere|preferee|favori|favorite) (?:est|c'est) (.+)$/u);
 if(m&&valid(m[2])){
  return {schema:NATIVE_SESSION_FACT_SCHEMA,kind:'favorite',
   key:'favorite:'+m[1],value:surface(m[2]),positive:true,
   provenance:'explicit-user-disclosure',scope:'same-session-only'};
 }
 m=flat.match(/^je prefere (.+?)(?: (?:au|a la|a l') .+)?$/u);
 if(m&&valid(m[1]))return {schema:NATIVE_SESSION_FACT_SCHEMA,
   kind:'preference',key:'preference',value:surface(m[1]),positive:true,
   provenance:'explicit-user-disclosure',scope:'same-session-only'};
 m=flat.match(/^(?:(j'aime(?: bien)?)|(je n'aime (?:pas|plus|jamais))|(je aime(?: bien)?)) (.+)$/u);
 if(m&&valid(m[4]))return {schema:NATIVE_SESSION_FACT_SCHEMA,
   kind:'like',key:'like:'+m[4],value:surface(m[4]),
   positive:Boolean(m[1]||m[3]),provenance:'explicit-user-disclosure',
   scope:'same-session-only'};
 // An intention is testimony about a desired action, never evidence that
 // the action has already happened.
 m=flat.match(/^(?:mon objectif est de|je veux|je souhaite|j'ai l'intention de) (.+)$/u);
 if(m&&valid(m[1]))return {schema:NATIVE_SESSION_FACT_SCHEMA,
  kind:'goal',key:'goal',value:surface(m[1]),positive:true,
  modality:'desired-not-completed',provenance:'explicit-user-disclosure',
  scope:'same-session-only'};
 m=flat.match(/^je ne veux plus (.+)$/u);
 if(m&&valid(m[1]))return {schema:NATIVE_SESSION_FACT_SCHEMA,
  kind:'goal',key:'goal',value:surface(m[1]),positive:false,
  modality:'retracted-goal',provenance:'explicit-user-disclosure',
  scope:'same-session-only'};
 return null;
}
const label=value=>value.replace(/^./u,s=>s.toLocaleUpperCase('fr-FR'));
const cleanTopic=s=>fold(s).replace(/^(?:le|la|les|l') /u,'');
const factValid=f=>f?.schema===NATIVE_SESSION_FACT_SCHEMA&&
 f.provenance==='explicit-user-disclosure'&&f.scope==='same-session-only'&&
 ['name','favorite','preference','like','goal'].includes(f.kind)&&
 typeof f.value==='string'&&valid(f.value)&&
 typeof f.key==='string'&&f.key.length<=65&&
 typeof f.positive==='boolean';
function buildFacts(history,stored){
 const all=[];
 // Live history can contain a disclosure not yet persisted. The SQL
 // experience log is then applied last and wins on later explicit corrections.
 let precedingAssistant='';
 for(const row of Array.isArray(history)?history.slice(-32):[]){
  if(row?.role==='assistant'){
   precedingAssistant=String(row.content||'');
   continue;
  }
  if(row?.role!=='user'){precedingAssistant='';continue;}
  const value=parseNativeSessionDisclosure(row.content)||
    parseNativeReplyToLearningPrompt(row.content,precedingAssistant);
  if(value)all.push(value);
  precedingAssistant=''; // A prompt can only supervise the next user turn.
 }
 for(const row of Array.isArray(stored)?stored.slice(-64):[]){
  if(factValid(row))all.push(row);
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
 let q=fold(question).replace(/-/g,' ').replace(/[?？]\s*$/u,'').replace(/^(?:et|alors|du coup)\s+/u,'').trim();
 if(/^(?:comment je m'appelle|comment est ce que je m'appelle|tu te souviens de mon prenom|quel est mon prenom|quel est mon nom)$/.test(q))
  return {kind:'name'};
 if(/^(?:qu'est ce que je prefere|je prefere quoi|qu'est ce que je prefere maintenant|tu sais ce que je prefere)$/.test(q))
  return {kind:'preference'};
 if(/^(?:qu'est ce que j'aime|j'aime quoi|tu te souviens de ce que j'aime|quels sont mes gouts)$/.test(q))
  return {kind:'likes'};
 if(/^(?:quel est mon objectif|et mon objectif|tu te souviens de mon objectif|qu'est ce que je veux faire|qu'est ce que je souhaite faire)$/.test(q))
  return {kind:'goal'};
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
 if(request.kind==='goal'){
  const v=state.get('goal');
  if(v?.positive)result="Tu m'as dit vouloir "+v.value+'.';
  else if(v&&!v.positive)result="Tu m'as dit ne plus vouloir "+v.value+'.';
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

// Communication-driven acquisition: AURA asks for missing evidence, then
// can learn the short reply only when its own immediately previous prompt
// matches an explicit bounded question. These prompts are PROGRAMMED, not
// self-generated by an LLM or proof of unrestricted language learning.
export function nativeSessionLearningPrompt({question='',history=[],storedFacts=[]}={}){
 const request=parseQuestion(question);
 if(!request||request.kind==='likes-yes-no')return null;
 if(answerNativeSessionDialogue({question,history,storedFacts}))return null;
 let text='';
 if(request.kind==='name')
  text="Je ne connais pas ton prénom dans cette conversation. Comment souhaites-tu que je t'appelle ?";
 if(request.kind==='preference')
  text="Tu ne m'as pas encore indiqué de préférence. Que préfères-tu ?";
 if(request.kind==='likes')
  text="Tu ne m'as pas encore dit ce que tu aimes. Qu'est-ce que tu aimes ?";
 if(request.kind==='goal')
  text="Tu ne m'as pas encore indiqué ton objectif. Qu'aimerais-tu accomplir ?";
 if(request.kind==='favorite'){
  const topic=request.key?.slice(9)||'';
  if(!/^[a-z-]{2,42}$/u.test(topic))return null;
  const feminine=/\b(?:quelle est|ma)\b/u.test(fold(question));
  text="Tu ne me l'as pas encore indiqué. "+
    (feminine?'Quelle est ta ':'Quel est ton ')+topic+
    (feminine?' préférée ?':' préféré ?');
 }
 return text?{text,source:'aura-native-teaching-question',
  pretrained_llm:false,coverage:'programmed-guided-learning'}:null;
}
export function parseNativeReplyToLearningPrompt(answer='',previousAssistant=''){
 if(typeof answer!=='string'||typeof previousAssistant!=='string'||
   answer.length>90||previousAssistant.length>230||
   /[?？\r\n<>]/u.test(answer))return null;
 const raw=tidy(answer);
 const q=fold(previousAssistant);
 if(!valid(raw)||/^(?:non|je|tu|il|elle|vous|nous|pourquoi|comment|ignore|oublie|efface|supprime|execute|reponds|modifie|change)\b/u.test(fold(raw)))
  return null;
 let kind='',key='';
 if(q==="je ne connais pas ton prenom dans cette conversation. comment souhaites-tu que je t'appelle ?"){
  if(!names.test(raw))return null;
  kind='name';key='name';
 }else if(q==="tu ne m'as pas encore indique de preference. que preferes-tu ?"){
  kind='preference';key='preference';
 }else if(q==="tu ne m'as pas encore dit ce que tu aimes. qu'est-ce que tu aimes ?"){
  kind='like';key='like:'+fold(raw);
 }else if(q==="tu ne m'as pas encore indique ton objectif. qu'aimerais-tu accomplir ?"){
  kind='goal';key='goal';
 }else{
  const m=q.match(/^tu ne me l'as pas encore indique\. (?:quel est ton|quelle est ta) ([a-z-]{2,42}) prefere?e? \?$/u);
  if(!m)return null;
  kind='favorite';key='favorite:'+m[1];
 }
 return {schema:NATIVE_SESSION_FACT_SCHEMA,kind,key,value:raw,
   positive:true,provenance:'explicit-user-disclosure',
   scope:'same-session-only',acquired_from:'explicit-answer-to-aura-question'};
}
