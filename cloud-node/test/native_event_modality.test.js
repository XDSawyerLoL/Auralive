import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFrenchEventScope,analyzeFrenchEventRelations}
 from '../src/native_event_modality.js';
import {parseFrenchStatement,answerFrenchFromConversation,inspectFrenchEventRelations}
 from '../src/native_semantic_grammar.js';

test('modality distinguishes condition, plan, hypothesis, habit, report, and asserted claim',()=>{
 const pairs=[
  ['Si Maya ferme la porte, Hugo ouvre le coffre.','conditional'],
  ['Demain, Maya ouvre la porte.','planned'],
  ['Maya pourrait ouvrir la porte.','hypothetical'],
  ['Chaque matin, Maya ouvre la porte.','habitual'],
  ['Hugo affirme que Maya ouvre la porte.','reported'],
  ['Maya a ouvert la porte.','user-asserted'],
  ['Maya ouvre le coffre une fois que Hugo a fermé la porte.','temporal-underspecified']
 ];
 for(const [source,scope] of pairs){
   const result=classifyFrenchEventScope(source);
   assert.equal(result.scope,scope,source);
   assert.equal(result.asserted,scope==='user-asserted',source);
 }
});
test('conditional if-then edges retain both actors without asserting either event',()=>{
 const analysis=inspectFrenchEventRelations('Si Maya ferme la porte, Hugo ouvre le coffre.');
 assert.equal(analysis.scope,'conditional');
 assert.equal(analysis.events.length,2);
 assert.equal(analysis.events[0].agent,'maya');
 assert.equal(analysis.events[1].agent,'hugo');
 assert.deepEqual(analysis.relations,[{type:'implies-if',from:0,to:1}]);
 assert.ok(analysis.events.every(e=>e.asserted===false));
});
test('completed temporal edges assert only when both clauses support completion',()=>{
 const positive=analyzeFrenchEventRelations(
   'Maya a ouvert le coffre une fois que Hugo a fermé la porte.',parseFrenchStatement);
 assert.equal(positive.scope,'user-asserted');
 assert.deepEqual(positive.relations,[{type:'before',from:0,to:1}]);
 assert.deepEqual(positive.events.map(e=>e.agent),['hugo','maya']);
 assert.ok(positive.events.every(e=>e.asserted));
 const uncertain=analyzeFrenchEventRelations(
   'Maya ouvre le coffre une fois que Hugo a fermé la porte.',parseFrenchStatement);
 assert.equal(uncertain.scope,'temporal-underspecified');
 assert.ok(uncertain.events.every(e=>!e.asserted));
});
test('unrealized, habitual and reported actions do not enter factual question answering',()=>{
 const sources=[
  'Si Hugo ferme la porte, Maya ouvre le coffre.',
  'Maya pourrait ouvrir le coffre.',
  'Demain Maya ouvre le coffre.',
  'Chaque matin Maya ouvre le coffre.',
  'Hugo affirme que Maya ouvre le coffre.',
  'Maya ouvre le coffre une fois que Hugo a fermé la porte.',
 ];
 for(const content of sources)assert.equal(answerFrenchFromConversation({
   history:[{role:'user',content}],question:'Qui a ouvert le coffre ?'
 }),null,content);
});
test('modal line does not poison a separate independently asserted line',()=>{
 const answer=answerFrenchFromConversation({
  history:[
   {role:'user',content:'Demain Maya ferme la porte.'},
   {role:'user',content:'Hugo ouvre le coffre.'}
  ],
  question:'Qui a ouvert le coffre ?'
 });
 assert.match(answer?.text||'',/Hugo/);
});
test('focus bien accepts new named actor while preserving negative and hypothetical abstentions',()=>{
 assert.match(answerFrenchFromConversation({
  history:[{role:'user',content:"C'est bien Romain qui ouvre la fenêtre."}],
  question:'Qui a ouvert la fenêtre ?'
 })?.text||'',/Romain/);
 for(const source of [
  "Ce n'est pas bien Romain qui ouvre la fenêtre.",
  "Si c'est bien Romain qui ouvre la fenêtre, Mélanie ferme la porte."
 ])assert.equal(answerFrenchFromConversation({
  history:[{role:'user',content:source}],
  question:'Qui a ouvert la fenêtre ?'
 }),null);
});
