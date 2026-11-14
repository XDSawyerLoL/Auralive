import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeConstructionLearner,abstractAnnotatedEvent}
 from '../src/native_construction_learning.js';
import {answerFrenchFromConversation}
 from '../src/native_semantic_grammar.js';

const examples=[
 {sentence:'Devant la gare, Romain a fermé la porte.',agent:'Romain',
  predicate:'fermer',patient:'porte'},
 {sentence:'Devant la gare, Camille a ouvert le tiroir.',agent:'Camille',
  predicate:'ouvrir',patient:'tiroir'},
 {sentence:'Devant la gare, Nadia a déplacé la caisse.',agent:'Nadia',
  predicate:'déplacer',patient:'caisse'},
];
const query={history:[{role:'user',content:'Devant la gare, Luc a ouvert la fenêtre.'}],
 question:'Qui a ouvert la fenêtre ?'};
const train=()=>{const learner=new NativeConstructionLearner();
 for(const x of examples)learner.observe(x);return learner;};

test('induction abstracts annotated agent/verb/patient rather than memorizing names',()=>{
 const x=abstractAnnotatedEvent(examples[0]);
 assert.ok(x);
 assert.ok(x.signature.includes('@agent'));
 assert.ok(x.signature.includes('@patient'));
 assert.ok(x.signature.includes('@verb'));
 assert.equal(x.signature,'devant la gare @agent a @verb la @patient');
 assert.ok(!x.signature.includes('romain'));
 assert.ok(!x.signature.includes('porte'));
});
test('two examples cannot trigger unearned generalization',()=>{
 const learner=new NativeConstructionLearner();
 learner.observe(examples[0]);learner.observe(examples[1]);
 assert.equal(learner.status().ready,0);
 assert.equal(learner.parse(query.history[0].content),null);
});
test('three independent corrections license new actor, verb and object',()=>{
 const learner=train();
 assert.equal(learner.status().ready,1);
 const frame=learner.parse(query.history[0].content);
 assert.equal(frame.agent,'luc');
 assert.equal(frame.predicate,'ouvrir');
 assert.equal(frame.patient,'fenetre');
 assert.equal(frame.parser,'demonstration-induced-construction');
 assert.ok(frame.evidence.examples>=3);
 const output=answerFrenchFromConversation({...query,constructionLearner:learner});
 assert.match(output?.text||'',/Luc/);
});
test('learned construction is causally necessary, and can be ablated',()=>{
 const learner=train();
 const after=answerFrenchFromConversation({...query,constructionLearner:learner});
 assert.match(after?.text||'',/Luc/);
 const before=answerFrenchFromConversation(query);
 assert.ok(before===null||!/\bc’est Luc\./u.test(before.text));
 const key=learner.snapshot().groups[0].signature;
 assert.equal(learner.ablate(key),true);
 const reverted=answerFrenchFromConversation({...query,constructionLearner:learner});
 assert.deepEqual(reverted,before);
});
test('snapshot restores a useful construction without retaining annotated text',()=>{
 const learner=train(),stored=JSON.parse(JSON.stringify(learner.snapshot()));
 assert.equal(stored.groups.length,1);
 assert.ok(!JSON.stringify(stored).includes('Devant la gare'));
 const restored=new NativeConstructionLearner(stored);
 assert.deepEqual(restored.parse(query.history[0].content),
   learner.parse(query.history[0].content));
});
test('duplicate examples, one actor, or one verb cannot inflate learning threshold',()=>{
 const learner=new NativeConstructionLearner();
 for(let i=0;i<8;i++)learner.observe(examples[0]);
 assert.equal(learner.status().ready,0);
 const sameAgent=new NativeConstructionLearner();
 for(const x of examples)sameAgent.observe({...x,agent:examples[0].agent,
   sentence:x.sentence.replace(/Camille|Nadia/u,'Romain')});
 assert.equal(sameAgent.status().ready,0);
});
test('no learned factual events from conditions, future, report or negation',()=>{
 const learner=train();
 for(const source of [
  'Si Devant la gare, Luc a ouvert la fenêtre.',
  'Demain, devant la gare, Luc a ouvert la fenêtre.',
  'Luc affirme que devant la gare, Nadia a ouvert la fenêtre.',
  "Devant la gare, Luc n'a pas ouvert la fenêtre."
 ]){
  assert.equal(learner.parse(source),null,source);
  assert.equal(answerFrenchFromConversation({
   question:'Qui a ouvert la fenêtre ?',constructionLearner:learner,
   history:[{role:'user',content:source}]
  }),null,source);
 }
});
test('training rejects supplied claims without exact verb lemma or clear spans',()=>{
 const learner=new NativeConstructionLearner();
 for(const sample of [
  {...examples[0],predicate:'dormir'},
  {...examples[0],patient:'fenêtre'},
  {...examples[0],agent:'inconnu'},
  {...examples[0],sentence:'Si Romain ferme la porte, Nadia ouvre la fenêtre.'}
 ]){
  assert.equal(learner.observe(sample).accepted,false);
 }
 assert.equal(learner.status().ready,0);
});
