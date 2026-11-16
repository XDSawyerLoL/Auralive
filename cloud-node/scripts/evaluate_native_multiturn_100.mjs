// Frozen-generation diagnostic: 100 held-out combinations and multi-turn cases.
// Author-created synthetic cases, not human-blind evaluation or open dialogue.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {trainNativeDialogueConstructions} from '../src/native_builtin_dialogue_training.js';
import {NativeConstructionLearner} from '../src/native_construction_learning.js';
import {answerFrenchFromConversation} from '../src/native_semantic_grammar.js';
const actors=['Anouk','Basile','Célia','Djamila','Elliot','Farid','Gaëlle','Ilan','Jules','Maya','Nora','Rita'];
const items=[['la','valise'],['le','billet'],['la','lettre'],['le','livre'],['la','statue'],['le','tableau'],
 ['le','parapluie'],['la','chaise'],['le','cahier'],['la','photo']];
const actions=[['fermé','fermer'],['ouvert','ouvrir'],['signé','signer'],['caché','cacher']];
const questions=[
 'Qui a @verb @det @object ?',
 'Qui donc a @verb @det @object ?',
 'Peux-tu me dire qui a @verb @det @object ?',
 'Sais-tu qui a @verb @det @object ?',
 'Tu sais qui a @verb @det @object ?',
 'Pourrais-tu me rappeler qui a @verb @det @object ?',
 "D'après notre échange, qui a @verb @det @object ?"
];
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .replace(/[’‘]/g,"'").toLocaleLowerCase('fr-FR');
const utterance=(actor,verb,det,obj,setting='Au bureau')=>
  setting+', '+actor+' a '+verb+' '+det+' '+obj+'.';
const question=(i,verb,det,obj)=>questions[i%questions.length].replace('@verb',verb)
 .replace('@det',det).replace('@object',obj);
const user=content=>({role:'user',content});
const bot=content=>({role:'assistant',content});
export function frozenNativeMultiturnCases(){
 const cases=[];
 for(let i=0;i<100;i++){
  const actor=actors[i%actors.length],other=actors[(i+5)%actors.length];
  const [det,obj]=items[i%items.length], [verb]=actions[i%actions.length];
  let history=[],prompt='',expected=[];
  if(i<40){
   history=[user(utterance(actor,verb,det,obj)),bot('Quel autre détail souhaites-tu vérifier ?'),
    user('Merci, je vais te poser une question.')];
   prompt=question(i,verb,det,obj);expected=[norm(actor)];
  }else if(i<60){
   history=[user(utterance(actor,verb,det,obj)),bot('J’ai entendu cette indication.'),
    user('Non, '+other+' a '+verb+' '+det+' '+obj+'.'),bot('Compris.')];
   prompt=question(i,verb,det,obj);expected=[norm(other)];
  }else if(i<70){
   history=[user(utterance(actor,verb,det,obj)),bot('D’accord.'),
    user(utterance(other,verb,det,obj))];
   prompt=question(i,verb,det,obj);
  }else if(i<80){
   history=[user(actor+" n'a pas "+verb+' '+det+' '+obj+'.')];
   prompt=question(i,verb,det,obj);
  }else if(i<90){
   history=[user('Si '+utterance(actor,verb,det,obj).replace(/\.$/,'')+
     ', cela serait étonnant.')];
   prompt=question(i,verb,det,obj);
  }else{
   const [otherDet,otherObj]=items[(i+3)%items.length];
   const [otherVerb]=actions[(i+1)%actions.length];
   history=[user(utterance(actor,verb,det,obj,'Ce matin')),bot('Je note ton récit.'),
    user(utterance(other,otherVerb,otherDet,otherObj,'Au bureau'))];
   prompt=question(i,verb,det,obj)+' '+question(i+1,otherVerb,otherDet,otherObj);
   expected=[norm(actor),norm(other)];
  }
  cases.push({id:'multi-'+String(i+1).padStart(3,'0'),
    category:i<40?'single':i<60?'correction':i<70?'ambiguous':
      i<80?'negation':i<90?'conditional':'double',
    history,prompt,expected});
 }
 return cases;
}
function names(response){
 if(!response||response.evidence_scope!=='same-session-user-statement-unverified')
  return response?['__unattributed__']:[];
 return [...norm(response.text).matchAll(/c'est ([\p{L}-]+)\./gu)].map(m=>m[1]);
}
export function evaluateNativeMultiturn({constructionLearner=trainNativeDialogueConstructions().learner}={}){
 const totals={cases:0,answerable:0,correct:0,wrong:0,abstained:0,unsafe:0},
  buckets={},errors=[];
 for(const testCase of frozenNativeMultiturnCases()){
  const reply=answerFrenchFromConversation({history:testCase.history,question:testCase.prompt,
    constructionLearner});
  const got=names(reply),exp=testCase.expected;
  const bucket=buckets[testCase.category]??={cases:0,correct:0,wrong:0,abstained:0};
  bucket.cases++;totals.cases++;
  if(exp.length)totals.answerable++;
  if(!got.length){totals.abstained++;bucket.abstained++}
  else if(got.length===exp.length&&got.every((name,i)=>name===exp[i])){
   totals.correct++;bucket.correct++;
  }else{totals.wrong++;bucket.wrong++;
   errors.push({id:testCase.id,category:testCase.category,predicted:got});
   if(!exp.length)totals.unsafe++;
  }
 }
 return {schema:'aura-native-multiturn-development-100-v1',
  evidence:'synthetic-author-generated-heldout-combinations-not-independent-blind',
  ...totals,answerable_coverage:totals.answerable?
   (totals.correct+totals.wrong-totals.unsafe)/totals.answerable:null,
  unsafe_rate:totals.cases-totals.answerable?
   totals.unsafe/(totals.cases-totals.answerable):null,
  categories:buckets,errors};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const trained=evaluateNativeMultiturn();
 const untrained=evaluateNativeMultiturn({constructionLearner:new NativeConstructionLearner()});
 const report={...trained,ablation_no_training:{
  correct:untrained.correct,wrong:untrained.wrong,
  abstained:untrained.abstained,unsafe:untrained.unsafe}};
 const output=JSON.stringify(report,null,2)+'\n';
 if(process.argv[2])writeFileSync(process.argv[2],output);
 console.log(output);
}
