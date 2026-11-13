import { nativeFrenchCorpus } from './native_french_corpus.js';
import {nativeUDConstructions} from './native_ud_constructions.js';
import {parseBoundedDiscourse} from './native_discourse_context.js';

// Bounded, auditable, local interpretation of user-declared French facts.
// This is NOT open-domain NLU and MUST NOT execute commands or infer ground truth.
export const LOCAL_SEMANTIC_VERSION = 'aura-local-semantic-grammar-v1';
const fold = value => String(value ?? '').toLocaleLowerCase('fr-FR')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
const words = value => fold(value).replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim();
const articles = /^(?:(?:le|la|les|un|une|des|du|de la|d'|l')\s*)+/;
const entity = value => words(value).replace(articles, '').replace(/\s+(?:ne|n)$/,'').trim();
const publicLabel = value => String(value || '').replace(/^./u, c => c.toLocaleUpperCase('fr-FR'));
const AUXILIARIES = new Set(['a','as','ai','avons','avez','ont','avait','avaient','est','es','suis','sommes','etes','sont','etait','etaient']);
const NEGATIONS = /\b(?:ne|n')\b[\s\S]*?\b(?:pas|jamais|plus|aucun)\b|\bn'[^\s]+\s+(?:pas|jamais|plus)\b/u;
const STOP = new Set(['ne','n','pas','jamais','plus','a','ont','as','ai','avait','ont','de','du','des','le','la','les','un','une','l','d','par','et','puis']);

// Reverse the actual licensed morphology (including participles) once.
let surfaceIndex;
function lexicon(){
  if(surfaceIndex)return surfaceIndex;
  surfaceIndex=new Map();
  for(const rows of nativeFrenchCorpus.forms.values())for(const row of rows){
    if(row.upos!=='VERB')continue;
    const form=fold(row.form);
    const prior=surfaceIndex.get(form);
    const weight=Number(row.frequency)||0;
    if(!prior||prior.weight<weight)surfaceIndex.set(form,{lemma:fold(row.lemma),weight,feats:row.feats});
  }
  return surfaceIndex;
}
const verb = token => nativeUDConstructions.lemma(token)||lexicon().get(fold(token))?.lemma||null;
const cleanObject = value => entity(value.replace(/^(?:pas|plus|jamais|en|y)\s+/u,''));
const eventKey = frame => [frame.predicate,frame.patient].join(':');

export function parseFrenchStatement(text){
  // Unsupported complements cannot be reinterpreted as flat SVO facts.
  if(/\b(?:dit|pense|sait|croit|affirme|veut)\s+que\b|\bsi\b/iu.test(fold(text)))return null;
  const acquired=nativeUDConstructions.parseStatement(text);
  if(acquired)return acquired;
  const source=words(text).replace(/^non\s+(?:je corrige\s+)?/u,'')
    .replace(/^je corrige\s+/u,'').replace(/^c'est\s+/u,'');
  if(!source||source.length>300||/[<>={}]/u.test(source))return null;
  const clause=source.split(/\s+parce que\s+|\s+car\s+|\s+puis\s+|\s+ensuite\s+/u)[0].replace(/\s*,?\s+pas\s+\p{L}+$/u,'').trim();
  // Passive: grammatical subject is the patient, 'par' introduces the agent.
  const passive=clause.match(/^(.+?)\s+(?:a ete|ont ete|est|sont|etait)\s+(\p{L}+)\s+par\s+(.+)$/u);
  if(passive){
    const predicate=verb(passive[2]);
    const patient=entity(passive[1]),agent=entity(passive[3]);
    if(predicate&&patient&&agent)return {kind:'event',predicate,agent,patient,
      polarity:!NEGATIONS.test(clause),voice:'passive',source:'user-statement-unverified'};
  }
  // Copula: property belongs to grammatical subject, not to a previous actor.
  const copula=clause.match(/^(.+?)\s+(?:n'|ne\s+)?(?:est|sont|etait|etaient)\s+(.+)$/u);
  if(copula){
    const subject=entity(copula[1]),attribute=cleanObject(copula[2]);
    if(subject&&attribute&&attribute.split(' ').length<=3)
      return {kind:'property',predicate:'etre',agent:subject,patient:attribute,
        polarity:!NEGATIONS.test(clause),voice:'copular',source:'user-statement-unverified'};
  }
  const tokens=clause.replace(/'/g,' ').split(/\s+/).filter(Boolean);
  // Handle compound past tenses and remove only known function words.
  const index=tokens.findIndex((token,i)=>i>0&&verb(token)&&!AUXILIARIES.has(token));
  if(index<1)return null;
  const predicate=verb(tokens[index]);
  const subject=entity(tokens.slice(0,index).filter(x=>!STOP.has(x)).join(' '));
  const object=cleanObject(tokens.slice(index+1).filter(x=>!STOP.has(x)).join(' '));
  if(!predicate||!subject||!object||subject.split(' ').length>4||object.split(' ').length>6)return null;
  return {kind:'event',predicate,agent:subject,patient:object,
    polarity:!NEGATIONS.test(clause),voice:'active',source:'user-statement-unverified'};
}

export function parseFrenchQuestion(text){
  const q=words(text).replace(/\?$/,'').trim();
  if(!/[?？]\s*$/u.test(String(text).trim())&&!/^(?:qui|pourquoi|de quelle couleur|est ce que)/.test(q))return null;
  let m=q.match(/^qui\s+(?:a|ont|avait)?\s*(\p{L}+)\s+(.+)$/u);
  if(m&&verb(m[1]))return {kind:'actor',predicate:verb(m[1]),patient:cleanObject(m[2])};
  m=q.match(/^de quelle couleur (?:est|etait)\s+(.+)$/u);
  if(m)return {kind:'property',agent:entity(m[1]),predicate:'etre'};
  m=q.match(/^est ce que\s+(.+)$/u);
  if(m){const frame=parseFrenchStatement(m[1]);if(frame)return {kind:'yes-no',frame};}
  m=q.match(/^que se passe t il apres que\s+(.+)$/u);
  if(m){const frame=parseFrenchStatement(m[1]);if(frame)return {kind:'after',frame};}
  m=q.match(/^pourquoi\s+(.+)$/u);
  if(m){const frame=parseFrenchStatement(m[1]);if(frame)return {kind:'cause',frame};}
  return null;
}

export function parseFrenchRelation(text){
  const source=String(text||'').trim();
  const normalized=fold(source);
  const relation=normalized.match(/^(.+?)\s+(parce que|car|puis|ensuite)\s+(.+)$/u);
  if(!relation)return null;
  const before=parseFrenchStatement(relation[1]);
  const after=parseFrenchStatement(relation[3]);
  if(!before||!after)return null;
  return {kind:relation[2]==='parce que'||relation[2]==='car'?'cause':'sequence',
    first:before,second:after,explanation:words(relation[3]).slice(0,140),
    source:'user-statement-unverified'};
}
const sameFrame=(a,b)=>a?.kind===b?.kind&&a?.predicate===b?.predicate&&
  a?.agent===b?.agent&&a?.patient===b?.patient;

export function parseFrenchCorrection(text){
  const q=words(text);
  if(!/^(?:non[, :]|je corrige\b|correction\b|en fait\b|c'est plutot\b)/u.test(q))return null;
  // Metalinguistic repair without a grammatical proposition is not a fact.
  if(/^(?:non\s+)?je\s+(?:voulais|veux|souhaite)\s+dire\b/u.test(q))return null;
  const rewrite=q.match(/^non\s+c'est\s+(.+?)\s+qui\s+(.+)$/u);
  const candidate=rewrite ? rewrite[1]+' '+rewrite[2] : q
    .replace(/^(?:non|je corrige|correction|en fait|c'est plutot)\s*(?::|,)?\s*/u,'');
  const frame=parseFrenchStatement(candidate.replace(/\s+pas\s+\p{L}+$/u,''));
  if(!frame)return null;
  return {schema:LOCAL_SEMANTIC_VERSION,type:'user-correction',frame,
    evidence_status:'user-statement-unverified'};
}

function splitAssertions(value){
  // Explicit conjunctions only. Never silently transform a question into evidence.
  const s=String(value||'').trim();
  if(/[?？]/u.test(s))return [];
  return s.split(/\s+mais\s+|[.;]\s*/iu).filter(Boolean);
}
function collect(history=[],stored=[]){
  const frames=[];
  for(const row of history.slice(-10)){
    if(row?.role!=='user')continue;
    for(const part of splitAssertions(row.content)){
      const correction=parseFrenchCorrection(part);
      // Resolve coordinated clauses as one bounded discourse before assigning actors.
      // Preserve the original behavior for explicit corrections and unsupported syntax.
      const parsed=correction?[{frame:correction.frame}]:
        parseBoundedDiscourse(part,parseFrenchStatement);
      for(const item of parsed){
        const frame=item.frame;
        if(!frame)continue;
        if(correction)for(let i=frames.length-1;i>=0;i--){
          if(frame.kind===frames[i].kind&&(frame.kind==='property'&&frame.agent===frames[i].agent
             ||frame.kind==='event'&&eventKey(frame)===eventKey(frames[i])))frames.splice(i,1);
        }
        frames.push(frame);
      }
    }
  }
  for(const entry of stored.slice(-10)){
    const record=typeof entry==='string'?JSON.parse(entry):entry;
    if(record?.schema!==LOCAL_SEMANTIC_VERSION||record?.type!=='user-correction')continue;
    const f=record.frame;
    if(!['event','property'].includes(f?.kind)||!['user-statement-unverified'].includes(f?.source))continue;
    for(let i=frames.length-1;i>=0;i--){
      if(f.kind===frames[i].kind&&(f.kind==='property'&&f.agent===frames[i].agent
         ||f.kind==='event'&&eventKey(f)===eventKey(frames[i])))frames.splice(i,1);
    }
    frames.push(f);
  }
  return frames;
}

export function answerFrenchFromConversation({question='',history=[],storedCorrections=[]}={}){
  const request=parseFrenchQuestion(question);
  if(!request)return null;
  let frames;
  try{frames=collect(Array.isArray(history)?history:[],Array.isArray(storedCorrections)?storedCorrections:[]);}
  catch{return null;}
  let text=null;
  if(request.kind==='cause'||request.kind==='after'){
    const expected=request.kind==='cause'?'cause':'sequence';
    const relations=(Array.isArray(history)?history:[])
      .filter(row=>row?.role==='user')
      .map(row=>parseFrenchRelation(row.content)).filter(Boolean)
      .filter(row=>row.kind===expected&&sameFrame(row.first,request.frame));
    if(relations.length===1)text='D’après ce que tu as indiqué, '+
      (expected==='cause'?'parce que ':'ensuite ')+relations[0].explanation+'.';
  }
  if(request.kind==='actor'){
    const candidates=frames.filter(f=>f.kind==='event'&&f.predicate===request.predicate&&
      f.patient===request.patient&&f.polarity===true);
    const distinct=[...new Set(candidates.map(f=>f.agent))];
    if(distinct.length===1)text='D’après ce que tu as indiqué, c’est '+publicLabel(distinct[0])+'.';
  }else if(request.kind==='property'){
    const values=frames.filter(f=>f.kind==='property'&&f.agent===request.agent&&f.polarity)
      .map(f=>f.patient);
    const distinct=[...new Set(values)];
    if(distinct.length===1)text='D’après ce que tu as indiqué, '+request.agent+' est '+distinct[0]+'.';
  }else if(request.kind==='yes-no'){
    const f=request.frame;
    const candidates=frames.filter(row=>row.kind===f.kind&&row.predicate===f.predicate&&
      row.agent===f.agent&&row.patient===f.patient);
    const polarities=[...new Set(candidates.map(row=>row.polarity))];
    if(polarities.length===1)text=(polarities[0]===f.polarity?'Oui':'Non')+', d’après ton indication précédente.';
  }
  return text ? {text,source:'aura-native-local-semantics',evidence_scope:'same-session-user-statement-unverified',
    grammar_version:LOCAL_SEMANTIC_VERSION,coverage:'bounded-grammatical-question-answering'} : null;
}
