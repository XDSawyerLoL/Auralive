// Independent-of-training STRUCTURAL development diagnostic.
// Human-authored question styles are outside the six learned question skeletons.
// This is not an externally administered blind benchmark.
import {answerFrenchFromConversation} from '../src/native_semantic_grammar.js';
import {trainNativeDialogueConstructions} from '../src/native_builtin_dialogue_training.js';
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[’‘]/g,"'");
const actors=['Léonie','Farid','Agathe','Sofiane','Amira','Clément'];
const nouns=[['le','livre'],['la','valise'],['le','billet'],['la','lettre'],
 ['le','parapluie'],['la','chaise']];
const unseen=[
  v=>`Tu pourrais m'indiquer qui a fermé ${v} ?`,
  v=>`J'aimerais savoir qui a fermé ${v} ?`,
  v=>`Et au final, qui a fermé ${v} ?`,
  v=>`C'était qui, la personne qui a fermé ${v} ?`,
  v=>`Peux-tu m'expliquer qui a fermé ${v} ?`,
  v=>`Qui était responsable de la fermeture de ${v} ?`,
];
const user=content=>({role:'user',content});
const assistant=content=>({role:'assistant',content});
export function structuralStressCases(){
 const cases=[];
 for(let pattern=0;pattern<unseen.length;pattern++)for(let i=0;i<6;i++){
  const [det,object]=nouns[i],person=actors[i];
  cases.push({id:`unseen-${pattern}-${i}`,category:'unseen-syntax',
   history:[user(`Au bureau, ${person} a fermé ${det} ${object}.`),
    assistant('Peux-tu poser ta question autrement si nécessaire ?')],
   question:unseen[pattern](det+' '+object),expected:fold(person)});
 }
 for(let i=0;i<12;i++){
  const [det,object]=nouns[i%6],person=actors[i%6],other=actors[(i+3)%6];
  const content=i%3===0?`Si au bureau, ${person} a fermé ${det} ${object}, cela serait surprenant.`
   :i%3===1?`${other} imagine que ${person} a fermé ${det} ${object}.`
    :`Au bureau, ${person} a fermé ${det} ${object}.`;
  const history=i%3===2?[user(content),user(`Au bureau, ${other} a fermé ${det} ${object}.`)]:[user(content)];
  cases.push({id:`negative-${i}`,category:'unverified-ambiguous',
   history,question:unseen[i%6](det+' '+object),expected:null});
 }
 return cases;
}
export function scoreStructuralStress(){
 const learner=trainNativeDialogueConstructions().learner,
  cases=structuralStressCases(),totals={cases:cases.length,answerable:0,
   correct:0,incorrect:0,abstained:0,unsafe:0},
  failureSamples=[];
 for(const sample of cases){
  const response=answerFrenchFromConversation({
   question:sample.question,history:sample.history,constructionLearner:learner});
  const match=response?.text&&fold(response.text).match(/c'est ([\p{L}-]+)\.$/u);
  const prediction=match?.[1]||null;
  if(sample.expected!==null)totals.answerable++;
  if(prediction===null)totals.abstained++;
  else if(prediction===sample.expected)totals.correct++;
  else{totals.incorrect++;
   if(sample.expected===null)totals.unsafe++;
   failureSamples.push({id:sample.id,reason:sample.expected===null?'unsafe':'wrong-agent'});
  }
 }
 return {...totals,
  source:'author-created-unseen-structural-stress-not-blind',
  correct_over_answerable:totals.answerable?
   totals.correct/totals.answerable:null,
  unsupported_outcomes:failureSamples};
}
