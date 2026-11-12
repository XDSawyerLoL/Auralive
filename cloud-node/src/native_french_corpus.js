import {readFileSync} from 'node:fs';

// AURA's zero-LLM language component. This module is not a chatbot and it
// never learns facts or chooses what to say. It learns surface inflections and
// syntactic evidence from a licensed corpus; the cognitive nucleus alone
// supplies the semantic intent and evidence.
const DATA_URL=new URL('../data/fr_ud_gsd_compact.json',import.meta.url);
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const CATEGORIES=new Set(['AUX','VERB','NOUN','ADJ','DET','PRON','ADV','ADP','INTJ']);
const inflectionMatch=(packed,required)=>{
 const f=new Map(String(packed||'').split('|').filter(Boolean).map(x=>x.split('=')));
 return Object.entries(required).every(([k,v])=>f.get(k)===String(v));
};
export class NativeFrenchCorpus {
 constructor({data=null}={}){
   let input=data;
   if(!input)try{input=JSON.parse(readFileSync(DATA_URL,'utf8'));}catch{input=null;}
   this.valid=Boolean(input?.schema==='aura-french-grammar-corpus-v1'
      &&input.license==='CC BY-SA 4.0'&&input.words_seen>=10000
      &&Array.isArray(input.entries)&&input.entries.length>=1000
      &&Array.isArray(input.pos_trigrams));
   this.stats=this.valid?{
     training_words:input.words_seen,training_sentences:input.sentences_seen,
     lexical_entries:input.entries.length,pos_grammar_patterns:input.pos_trigrams.length,
     dataset:'UD_French-GSD',license:input.license,model_type:'symbolic-morphological-no-llm',
   }:null;
   this.forms=new Map();this.dictionary=new Set();this.trigrams=new Map();
   if(!this.valid)return;
   for(const item of input.entries){
     if(!Array.isArray(item)||item.length!==5)continue;
     const [form,lemma,upos,feats,frequency]=item;
     if(!CATEGORIES.has(upos)||!Number.isInteger(frequency)||frequency<1||
       typeof form!=='string'||typeof lemma!=='string')continue;
     const key=lemma.toLocaleLowerCase('fr')+':'+upos;
     const row={form,lemma,upos,feats,frequency};
     if(!this.forms.has(key))this.forms.set(key,[]);
     this.forms.get(key).push(row);
     this.dictionary.add(form);
   }
   for(const item of input.pos_trigrams){
     if(Array.isArray(item)&&typeof item[0]==='string'&&Number.isInteger(item[1]))
       this.trigrams.set(item[0],item[1]);
   }
 }
 status(){
   return {ready:this.valid,stats:this.stats,
     limitations:'French morphology and constrained realization; no open-domain semantic comprehension'};
 }
 candidates(lemma,upos,features={}){
   const out=(this.forms.get(clean(lemma).toLocaleLowerCase('fr')+':'+upos)||[])
     .filter(row=>inflectionMatch(row.feats,features));
   return out.sort((a,b)=>b.frequency-a.frequency||a.form.localeCompare(b.form,'fr'));
 }
 inflect(lemma,upos,features={}){
   return this.candidates(lemma,upos,features)[0]?.form||null;
 }
 hasSurface(form){return this.dictionary.has(clean(form).toLocaleLowerCase('fr'))}
 // A POS trigram is evidence of common grammar, never a truth score.
 grammarFrequency(posSequence=[]){
   if(!Array.isArray(posSequence)||posSequence.some(x=>!CATEGORIES.has(x)))return 0;
   const p=['^','^',...posSequence,'$'];
   let n=0;for(let i=2;i<p.length;i++)n+=this.trigrams.get(p.slice(i-2,i+1).join('/'))||0;
   return n;
 }
 // Restricted, compositional surface realization. No text from arbitrary user
 // input is admitted as verified content. Unsupported frames fail closed.
 realizeFrame(frame={}){
   if(!this.valid||frame?.origin!=='nucleus-verified-semantic-frame'
     ||frame?.evidence_verified!==true)return null;
   const person=Number(frame.person),number=String(frame.number||'');
   if(![1,2,3].includes(person)||!['Sing','Plur'].includes(number))return null;
   const subjects={
    '1:Sing':'je','2:Sing':'tu','3:Sing':'il',
    '1:Plur':'nous','2:Plur':'vous','3:Plur':'ils',
   };
   const subject=subjects[person+':'+number];
   if(frame.verb!=='être'||frame.complement_kind!=='adjective')return null;
   const complement=clean(frame.complement_lemma).toLocaleLowerCase('fr');
   if(!/^[\p{L}]{2,25}$/u.test(complement))return null;
   const verb=this.inflect('être','AUX',{
     Mood:'Ind',Tense:'Pres',Person:String(person),Number:number,VerbForm:'Fin',
   });
   const adjective=this.inflect(complement,'ADJ',{
     Gender:'Masc',Number:number,
   })||this.inflect(complement,'ADJ',{Number:number});
   if(!verb||!adjective)return null;
   const clauses=[subject,verb,adjective];
   // This is a lexical + morphological realization, not a factual inference.
   return clauses.join(' ').replace(/^./u,x=>x.toLocaleUpperCase('fr'))+'.';
 }
 // Existing kernel plans can be rendered locally only for truly limited,
 // grounded acts. Unknown questions are not answered using random phrases
 // from the corpus.
 realizePlan(plan={}){
   if(!this.valid)return null;
   const act=String(plan.act||'');
   if(act==='greet'&&this.hasSurface('bonjour'))
     return {text:'Bonjour.',coverage:'bounded-salutation',evidence_scope:'language-only'};
   if(act==='self_name')
     return {text:'Je m’appelle AURA.',coverage:'bounded-identity-label',
       evidence_scope:'kernel-defined-name'};
   if(act==='report_internal_state'){
     const mood=clean(plan.mood).toLocaleLowerCase('fr');
     if(!['calme','stable','attentif'].includes(mood))return null;
     const wording=this.realizeFrame({
       origin:'nucleus-verified-semantic-frame',evidence_verified:true,
       person:1,number:'Sing',verb:'être',
       complement_kind:'adjective',complement_lemma:mood,
     });
     if(wording)return {text:wording,coverage:'limited-morphological-state',
       evidence_scope:'nucleus-computational-state-not-human-emotion'};
   }
   if(plan?.native_semantic_frame?.origin==='nucleus-verified-semantic-frame'){
     const wording=this.realizeFrame(plan.native_semantic_frame);
     if(wording)return {text:wording,coverage:'structured-semantic-frame',
       evidence_scope:'nucleus-grounded'};
   }
   return null;
 }
}
export const nativeFrenchCorpus=new NativeFrenchCorpus();
