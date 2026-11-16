import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeConstructionLearner} from '../src/native_construction_learning.js';
import {curatedFrenchDialogueExamples,trainNativeDialogueConstructions}
 from '../src/native_builtin_dialogue_training.js';
import {getNativeRuntimeConstructionLearner,nativeRuntimeConstructionStatus}
 from '../src/native_construction_runtime.js';
import {answerFrenchFromConversation,parseFrenchQuestion}
 from '../src/native_semantic_grammar.js';

const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
 .toLowerCase().replace(/[’‘]/g,"'");
const actorOf=answer=>fold(answer?.text).match(/c'est ([a-z -]+)\.$/u)?.[1]||null;
const people=['Élise','Victor','Fatou','Omar','Léa','Noah','Mina','Pauline','Ibrahim','Simon'];
const objects=[['le','contrat'],['la','lettre'],['la','clé'],['le','billet'],
 ['le','cadeau'],['le','stylo'],['le','livre'],['la','photo']];
const verbs=['fermé','ouvert','déplacé','signé','caché'];

test('168 annotated French examples reproducibly acquire 14 reusable constructions',()=>{
 const examples=curatedFrenchDialogueExamples();
 const {learner,audit}=trainNativeDialogueConstructions();
 assert.equal(examples.length,168);
 assert.equal(audit.accepted,168);
 assert.equal(audit.acquired_constructions,14);
 assert.equal(audit.pretrained_llm,false);
 const replay=new NativeConstructionLearner();
 for(const example of examples)assert.equal(replay.observe(example).accepted,true);
 assert.deepEqual(replay.snapshot(),learner.snapshot());
 assert.equal(getNativeRuntimeConstructionLearner().status().ready,14);
 assert.equal(nativeRuntimeConstructionStatus().external_inference,false);
});
test('70 unseen actor-object combinations transfer by composition versus no training',()=>{
 const trained=trainNativeDialogueConstructions().learner;
 const base=new NativeConstructionLearner();
 let right=0,baselineRight=0;
 for(const [j,group] of trained.snapshot().groups.entries())for(let k=0;k<5;k++){
  const person=people[(j+k)%people.length];
  const verb=verbs[(k+j)%verbs.length];
  const [det,object]=objects[(k*2+j)%objects.length];
  const sentence=group.signature.replace('@agent',person)
   .replace('@verb',verb).replace('@det',det).replace('@patient',object)+'.';
  const question='Et qui a '+verb+' '+det+' '+object+' ?';
  const query={history:[{role:'user',content:sentence}],question};
  if(actorOf(answerFrenchFromConversation({...query,constructionLearner:trained}))===fold(person))right++;
  if(actorOf(answerFrenchFromConversation({...query,constructionLearner:base}))===fold(person))baselineRight++;
 }
 assert.equal(right,70);
 assert.ok(right>baselineRight,{right,baselineRight});
});
test('16-turn correction and follow-up remain attributable, without Qwen',()=>{
 const trained=trainNativeDialogueConstructions().learner;
 const history=[{role:'user',content:'Au bureau, Élise a fermé le contrat.'},
  ...Array.from({length:15},()=>({role:'user',content:'Coucou.'})),
  {role:'user',content:'Non, Fatou a fermé le contrat.'}];
 assert.equal(actorOf(answerFrenchFromConversation({
  question:'Et qui a fermé le contrat ?',history,constructionLearner:trained
 })),'fatou');
 assert.equal(parseFrenchQuestion('Et qui a ouvert la lettre ?')?.patient,'lettre');
});
test('negation, future, ambiguity and hypothetical cannot be asserted as actual facts',()=>{
 const trained=trainNativeDialogueConstructions().learner;
 for(const content of [
  'Si Ce matin, Élise a fermé la lettre.',
  'Demain, Ce matin, Élise a fermé la lettre.',
  "Au bureau, Élise n'a pas fermé la lettre.",
  'Mina pense que Au bureau, Élise a fermé la lettre.'
 ]){
  assert.equal(answerFrenchFromConversation({
   question:'Qui a fermé la lettre ?',history:[{role:'user',content}],
   constructionLearner:trained
  }),null,content);
 }
 const history=[{role:'user',content:'Au bureau, Élise a fermé le contrat.'},
  {role:'user',content:'Au bureau, Fatou a fermé le contrat.'}];
 assert.equal(answerFrenchFromConversation({
  question:'Qui a fermé le contrat ?',history,constructionLearner:trained
 }),null);
});
test('native-acquired mode does not invoke any pretrained local or cloud generator',async()=>{
 const {ExpressionLayer}=await import('../src/expression.js');
 const before=process.env.AURA_NATIVE_FRENCH_MODE;
 process.env.AURA_NATIVE_FRENCH_MODE='native-acquired';
 let calls=0;
 try{
  const ai={enabled:true,generate:async()=>{calls++;return 'external';}};
  const layer=new ExpressionLayer(ai,{deterministicReply:()=>''});
  layer.language.generate=async()=>{calls++;return 'pretrained';};
  const identity=await layer.verbalize({act:'self_name',facts:[],user_text:'Comment tu t’appelles ?'});
  assert.equal(identity,'Je m’appelle AURA.');
  const unknown=await layer.verbalize({act:'respond',facts:[],user_text:'Explique la mécanique quantique en détail'});
  assert.equal(unknown,'');
  assert.equal(layer.lastMode,'native-acquired-out-of-coverage');
  assert.equal(calls,0);
 }finally{
  if(before===undefined)delete process.env.AURA_NATIVE_FRENCH_MODE;
  else process.env.AURA_NATIVE_FRENCH_MODE=before;
 }
});


test('composes two different evidenced questions in one 16-turn dialogue',()=>{
 const trained=trainNativeDialogueConstructions().learner;
 const history=[{role:'user',content:'Ce matin, Victor a signé le contrat.'},
  ...Array.from({length:14},()=>({role:'user',content:'Bonjour.'})),
  {role:'user',content:'Après la réunion, Léa a fermé la porte.'}];
 const both=answerFrenchFromConversation({
  question:'Qui a signé le contrat ? Et qui a fermé la porte ?',
  history,constructionLearner:trained
 });
 assert.equal(both?.coverage,'bounded-two-question-composition');
 assert.match(fold(both?.text),/victor/);
 assert.match(fold(both?.text),/lea/);
 // A single unsupported question invalidates the whole compound response.
 assert.equal(answerFrenchFromConversation({
  question:'Qui a signé le contrat ? Et qui a ouvert la lune ?',
  history,constructionLearner:trained
 }),null);
});
