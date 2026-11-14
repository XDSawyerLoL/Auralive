import {readFileSync} from 'node:fs';

const PATH=new URL('../data/fr_ud_dependency_constructions.json',import.meta.url);
const fold=value=>String(value||'').toLocaleLowerCase('fr-FR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim();
const tokenize=value=>fold(value).replace(/[^\p{L}\p{N}' ]/gu,' ')
  .replace(/'/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
const stripArticles=raw=>raw.replace(/^(?:(?:le|la|les|un|une|des|du|de|l|d)\s+)+/u,'').trim();
const AUX=new Set(['a','as','ai','avons','avez','ont','avait','avaient',
  'est','es','suis','sommes','etes','sont','etait','etaient','ete']);
const NEG=new Set(['ne','n','pas','plus','jamais']);
const DET=new Set(['le','la','les','un','une','des','du','ce','cet','cette','ces','mon','ma','mes','ton','ta','tes','son','sa','ses']);
const NEGATIVE=(tokens)=>tokens.includes('pas')||tokens.includes('jamais')||
  tokens.includes('ne')&&tokens.includes('plus');
const MODEL_ID='aura-ud-dependency-constructions-v1';
const LIMIT=300;

export class NativeUDConstructions{
 constructor({data}={}){
  const raw=data||( ()=>{try{return JSON.parse(readFileSync(PATH,'utf8'))}catch{return null}})();
  this.ready=Boolean(raw?.schema==='aura-ud-french-dependency-constructions-v1'&&
    raw.provenance?.split==='train'&&raw.provenance?.license==='CC BY-SA 4.0'&&
    raw.provenance?.blob_sha==='9a15cb3559ca80bb0942909e48e7a752bbcfb026'&&
    raw.stats?.sentences>=14000&&raw.stats?.clauses_with_subject>=10000&&
    Array.isArray(raw?.constructions)&&Array.isArray(raw?.dependency_edges)&&
    Array.isArray(raw?.verb_forms));
  this.counts=new Map();
  this.edges=new Map();
  this.forms=new Map();
  this.stats=this.ready?raw.stats:null;
  if(!this.ready)return;
  for(const [key,n] of raw.constructions){
   if(typeof key==='string'&&Number.isInteger(n)&&n>0)this.counts.set(key,n);
  }
  for(const [key,n] of raw.dependency_edges){
   if(typeof key==='string'&&Number.isInteger(n)&&n>0)this.edges.set(key,n);
  }
  for(const [form,lemma,n] of raw.verb_forms){
   if(typeof form!=='string'||typeof lemma!=='string'||!Number.isInteger(n)||n<1)continue;
   const key=fold(form),candidate={lemma:fold(lemma),n};
   if(!this.forms.has(key)||this.forms.get(key).n<n)this.forms.set(key,candidate);
  }
 }
 status(){
  return {ready:this.ready,model:MODEL_ID,stats:this.stats,
    dependencies:['nsubj','obj','nsubj:pass','obl:agent'],
    provenance:'UD_French-GSD train annotations CC BY-SA 4.0',
    limitations:'Partial dependency-pattern learner, not a general French parser'};
 }
 lemma(form){return this.ready?this.forms.get(fold(form))?.lemma||null:null}
 // The compact UD TRAIN model contains a small but non-zero cleft dependency
 // observation (advcl:cleft). This only licenses a tightly scoped transformation,
 // not a claim that AURA learned unrestricted French cleft syntax.
 evidenceCleft(){
  if(!this.ready)return null;
  const observations=this.edges.get('VERB|advcl:cleft|VERB|right')||0;
  const properSubject=this.edges.get('VERB|nsubj|PROPN|left')||0;
  const object=this.edges.get('VERB|obj|NOUN|right')||0;
  if(observations<3||properSubject<100||object<100)return null;
  return {relation:'advcl:cleft',observations,dependency_support:{
    nsubj_propn_left:properSubject,obj_noun_right:object}};
 }
 // A construction is admitted only if multiple edges and slot geometry
 // were observed repeatedly in the training treebank. We never use a
 // relative corpus frequency as proof of a fact about a person or object.
 evidence({voice,subjectSide='left',objectSide='none',agentSide='none'}={}){
  if(!this.ready)return null;
  const kind=voice==='passive'?'passive':objectSide!=='none'?'active-transitive':'active-intransitive';
  const key=[kind,subjectSide,objectSide,agentSide].join('|');
  const n=this.counts.get(key)||0;
  if(n<30)return null;
  const subjRel=voice==='passive'?'nsubj:pass':'nsubj';
  const subjEvidence=[...this.edges].filter(([key])=>
    key.startsWith('VERB|'+subjRel+'|')&&key.endsWith('|'+subjectSide))
    .reduce((sum,[,v])=>sum+v,0);
  const objEvidence=objectSide==='none'?1:[...this.edges].filter(([key])=>
    key.startsWith('VERB|obj|')&&key.endsWith('|'+objectSide))
    .reduce((sum,[,v])=>sum+v,0);
  const agentEvidence=agentSide==='none'?1:[...this.edges].filter(([key])=>
    key.startsWith('VERB|obl:agent|')&&key.endsWith('|'+agentSide))
    .reduce((sum,[,v])=>sum+v,0);
  if(!subjEvidence||!objEvidence||!agentEvidence)return null;
  return {construction:key,observations:n,dependency_support:{
    [subjRel]:subjEvidence,...(objectSide!=='none'?{obj:objEvidence}:{}),
    ...(agentSide!=='none'?{'obl:agent':agentEvidence}:{})}};
 }
 parseStatement(text){
  const q=fold(text).replace(/[.!]\s*$/u,'');
  if(!this.ready||!q||q.length>LIMIT||/[?？\n.;:{}[\]<>]/u.test(q)||
     /(?:\bsi\b|\bque\b|\bquand\b|\bdont\b|\blequel\b)/u.test(q))return null;
  // Coordinated, causal, subordinate clauses require a separate scope model.
  if(/\b(?:puis|ensuite|parce que|car|mais|et)\b/u.test(q))return null;
  const tokens=tokenize(q);
  if(tokens.length<3||tokens.length>19)return null;
  const negatives=NEGATIVE(tokens);
  // Explicit 'par' + auxiliary 'être' marks an observable passive voice;
  // the model then supplies nsubj:pass / obl:agent semantics and ordering.
  const par=tokens.lastIndexOf('par');
  if(par>=0){
   // A participle immediately preceding "par" is the observable head.
   // Earlier lexical homographs can be NOUNs (e.g. "porte" in "la porte").
   const i=par-1,word=tokens[i],lemma=this.lemma(word);
   if(i<2||!lemma||par===tokens.length-1)return null;
   const v={i,word,lemma};
   const aux=tokens.slice(0,v.i).filter(x=>AUX.has(x));
   if(!aux.some(x=>['est','sont','etait','etaient','ete'].includes(x)))return null;
   const pattern=this.evidence({voice:'passive',subjectSide:'left',objectSide:'none',agentSide:'right'});
   if(!pattern)return null;
   const patient=stripArticles(tokens.slice(0,v.i).filter(x=>!AUX.has(x)&&!NEG.has(x)).join(' '));
   const agent=stripArticles(tokens.slice(par+1).join(' '));
   if(!patient||!agent||agent.split(' ').length>5||patient.split(' ').length>6)return null;
   return {kind:'event',predicate:v.lemma,agent,patient,polarity:!negatives,
      voice:'passive',source:'user-statement-unverified',
      parser:'ud-trained-dependency',dependency_evidence:pattern};
  }
  // For active transitive clauses, map the observed slots by the trained
  // nsubj (left) and obj (right) dependency configurations.
  const candidates=tokens.map((word,i)=>({word,i,lemma:this.lemma(word)}))
    .filter(x=>x.lemma&&!AUX.has(x.word)&&x.i>0&&
      !DET.has(tokens[x.i-1]));
  if(candidates.length!==1)return null;
  const v=candidates[0];
  const pattern=this.evidence({voice:'active',subjectSide:'left',objectSide:'right',agentSide:'none'});
  if(!pattern)return null;
  const before=tokens.slice(0,v.i).filter(x=>!AUX.has(x)&&!NEG.has(x));
  const after=tokens.slice(v.i+1).filter(x=>!AUX.has(x)&&!NEG.has(x));
  const agent=stripArticles(before.join(' '));
  const patient=stripArticles(after.join(' '));
  if(!agent||!patient||before.length>6||after.length>8||
    agent.split(' ').length>5||patient.split(' ').length>7)return null;
  // No coreference or cross-clause inference from pronouns.
  if(/^(?:il|elle|ils|elles|on|lui|leur|en|y)$/u.test(agent))return null;
  return {kind:'event',predicate:v.lemma,agent,patient,polarity:!negatives,
    voice:'active',source:'user-statement-unverified',
    parser:'ud-trained-dependency',dependency_evidence:pattern};
 }
}
export const nativeUDConstructions=new NativeUDConstructions();
