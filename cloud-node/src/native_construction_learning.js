// Learn reusable, bounded French syntax from independent annotated examples.
// No generative model, paid API or arbitrary execution. This does NOT infer
// facts: it only converts explicitly asserted utterances into user-claim frames.
import {createHash} from 'node:crypto';
import {nativeUDConstructions} from './native_ud_constructions.js';
import {classifyFrenchEventScope} from './native_event_modality.js';
const norm=s=>String(s||'').toLocaleLowerCase('fr-FR').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').replace(/[’‘]/g,"'").trim();
const tokens=s=>norm(s).replace(/[^a-z0-9'-]+/gu,' ').replace(/'/g,' ')
  .split(/\s+/).filter(Boolean);
const slots=new Set(['@agent','@verb','@patient']);
const uid=s=>createHash('sha256').update(s).digest('hex');
function locate(tokens,values){
 const positions=[];
 for(let i=0;i<=tokens.length-values.length;i++)
   if(values.every((v,j)=>v===tokens[i+j]))positions.push(i);
 return positions.length===1?positions[0]:null;
}
export function abstractAnnotatedEvent(example){
 if(typeof example?.sentence!=='string'||example.sentence.length>280||
   !example.sentence.trim()||/[?？;\n]/u.test(example.sentence)||
   classifyFrenchEventScope(example.sentence).scope!=='user-asserted')return null;
 const words=tokens(example.sentence),actor=tokens(example.agent),
   patient=tokens(example.patient),predicate=norm(example.predicate);
 if(words.length<5||words.length>32||actor.length<1||actor.length>3||
    patient.length<1||patient.length>5||!predicate||!nativeUDConstructions.ready)return null;
 const ai=locate(words,actor),pi=locate(words,patient);
 if(ai===null||pi===null)return null;
 const av=new Set([...Array(actor.length)].map((_,j)=>ai+j));
 const pv=new Set([...Array(patient.length)].map((_,j)=>pi+j));
 if([...av].some(i=>pv.has(i)))return null;
 const verbs=words.map((word,i)=>({word,i,lemma:nativeUDConstructions.lemma(word)}))
   .filter(x=>x.lemma===predicate&&!av.has(x.i)&&!pv.has(x.i));
 if(verbs.length!==1)return null;
 const vi=verbs[0].i,grammar=[];
 for(let i=0;i<words.length;){
  if(i===ai){grammar.push('@agent');i+=actor.length;continue;}
  if(i===pi){grammar.push('@patient');i+=patient.length;continue;}
  if(i===vi){grammar.push('@verb');i++;continue;}
  if(av.has(i)||pv.has(i))return null;
  grammar.push(words[i++]);
 }
 if(!['@agent','@verb','@patient'].every(x=>grammar.filter(y=>x===y).length===1))return null;
 if(grammar.filter(w=>!slots.has(w)).length<2)return null;
 return {signature:grammar.join(' '),grammar,
   example_id:uid(JSON.stringify([norm(example.sentence),norm(example.agent),
      norm(example.patient),predicate])),predicate,agent:norm(example.agent),
      patient:norm(example.patient)};
}
function matchGrammar(grammar,words){
 const answers=[];
 function advance(i,j,slotsFound){
  if(answers.length>1)return;
  if(i===grammar.length){if(j===words.length)answers.push(slotsFound);return;}
  const cur=grammar[i];
  if(!slots.has(cur)){
   if(words[j]===cur)advance(i+1,j+1,slotsFound);
   return;
  }
  // Brute-force matching is bounded by 32 input words and 3 slots.
  // Each segment is anchored by the next literal and constrained length.
  const max=cur==='@verb'?1:cur==='@agent'?3:5;
  for(let k=1;k<=max&&j+k<=words.length;k++)
    advance(i+1,j+k,{...slotsFound,[cur]:words.slice(j,j+k).join(' ')});
 }
 advance(0,0,{});
 return answers.length===1?answers[0]:null;
}
export class NativeConstructionLearner{
 constructor(snapshot=null){
  this.schema='aura-learned-constructions-v1';
  this.groups=new Map();
  if(snapshot!==null)this.restore(snapshot);
 }
 observe(example){
  const observation=abstractAnnotatedEvent(example);
  if(!observation)return {accepted:false,reason:'unsupported-or-unverifiable-annotation'};
  const key=observation.signature;
  const group=this.groups.get(key)||{grammar:observation.grammar,examples:[]};
  // Equal text/annotation cannot increase confidence.
  if(!group.examples.some(x=>x.example_id===observation.example_id))
    group.examples.push({example_id:observation.example_id,
      agent:observation.agent,patient:observation.patient,predicate:observation.predicate});
  if(group.examples.length>50)group.examples=group.examples.slice(-50);
  this.groups.set(key,group);
  return {accepted:true,signature:key,ready:this.licensed(group),examples:group.examples.length};
 }
 licensed(group){
  const rows=group?.examples||[];
  return rows.length>=3&&new Set(rows.map(x=>x.agent)).size>=3&&
    new Set(rows.map(x=>x.patient)).size>=3&&
    new Set(rows.map(x=>x.predicate)).size>=2;
 }
 parse(sentence){
  if(typeof sentence!=='string'||sentence.length>280||
    classifyFrenchEventScope(sentence).scope!=='user-asserted'||/[?？;\n]/u.test(sentence))return null;
  const words=tokens(sentence);
  if(words.length<5||words.length>32)return null;
  const candidates=[];
  for(const [signature,group] of this.groups){
   if(!this.licensed(group))continue;
   const values=matchGrammar(group.grammar,words);
   if(!values||values['@agent'].split(' ').length>3)continue;
   const lemma=nativeUDConstructions.lemma(values['@verb']);
   if(!lemma)continue;
   const agent=values['@agent'],patient=values['@patient'];
   if(!agent||!patient||agent===patient)continue;
   candidates.push({kind:'event',predicate:lemma,agent,patient,polarity:true,
     voice:'active',source:'user-statement-unverified',
     parser:'demonstration-induced-construction',construction:signature,
     evidence:{examples:group.examples.length,distinct_agents:new Set(group.examples.map(x=>x.agent)).size,
       distinct_patients:new Set(group.examples.map(x=>x.patient)).size}});
  }
  if(candidates.length!==1)return null;
  return candidates[0];
 }
 snapshot(){
  return {schema:this.schema,
   groups:[...this.groups].map(([signature,g])=>({signature,grammar:g.grammar,
     examples:g.examples.map(e=>({...e}))}))};
 }
 restore(snapshot){
  if(snapshot?.schema!==this.schema||!Array.isArray(snapshot.groups)||
     snapshot.groups.length>200)throw Error('Unsupported construction snapshot');
  const next=new Map();
  for(const g of snapshot.groups){
   if(!Array.isArray(g.grammar)||g.grammar.length>32||
      g.grammar.join(' ')!==g.signature||!g.grammar.every(x=>
       slots.has(x)||/^[a-z0-9-]+$/.test(x))||
      !['@agent','@verb','@patient'].every(x=>g.grammar.filter(y=>y===x).length===1)||
      !Array.isArray(g.examples)||g.examples.length>50||
      !g.examples.every(x=>/^[a-f0-9]{64}$/.test(x.example_id)&&
       /^[a-z -]{1,90}$/.test(x.agent)&&/^[a-z -]{1,90}$/.test(x.patient)&&
       /^[a-z-]{2,40}$/.test(x.predicate)))throw Error('Invalid learned pattern');
   next.set(g.signature,{grammar:[...g.grammar],examples:g.examples.map(x=>({...x}))});
  }
  this.groups=next;
 }
 ablate(signature){return this.groups.delete(signature);}
 status(){return {schema:this.schema,groups:this.groups.size,
   ready:[...this.groups.values()].filter(x=>this.licensed(x)).length};}
}
