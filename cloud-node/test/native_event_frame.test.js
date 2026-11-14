import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeEventFrame,isNativeEventAssertable} from '../src/native_event_frame.js';
import {inspectFrenchEventGraph,answerFrenchFromConversation,parseFrenchStatement}
  from '../src/native_semantic_grammar.js';
import {buildNativeEventGraph} from '../src/native_event_modality.js';

test('unified event frame retains roles, tense, polarity and unverified source',()=>{
 const source='Romain a fermé la porte.';
 const result=makeNativeEventFrame(parseFrenchStatement(source),source);
 assert.equal(result.schema,'aura-local-event-frame-v1');
 assert.equal(result.agent,'romain');
 assert.equal(result.predicate,'fermer');
 assert.equal(result.patient,'porte');
 assert.equal(result.tense,'past');
 assert.equal(result.aspect,'completed');
 assert.equal(result.modality,'asserted');
 assert.equal(result.polarity,'positive');
 assert.equal(result.provenance.verification,'unverified');
 assert.equal(result.asserted,true);
 assert.equal(isNativeEventAssertable(result),true);
});
test('future and hypothetical event frames never become realized evidence',()=>{
 const plain={kind:'event',agent:'Romain',predicate:'fermer',
   patient:'porte',polarity:true,voice:'active',source:'user-statement-unverified'};
 for(const [source,scope,modality] of [
  ['Romain fermera la porte.','user-asserted','asserted'],
  ['Demain Romain ferme la porte.','planned','planned'],
  ['Romain aurait fermé la porte.','hypothetical','hypothetical'],
  ['Chaque soir Romain ferme la porte.','habitual','habitual'],
  ['Si Romain ferme la porte.','conditional','conditional']
 ]){
  const e=makeNativeEventFrame(plain,source,{scope});
  assert.equal(e.modality,modality);
  assert.equal(e.asserted,false,source);
  assert.equal(isNativeEventAssertable(e),false);
 }
});
test('conditional event graph keeps both actors but none as realized world events',()=>{
 const graph=inspectFrenchEventGraph('Si Maya ferme la porte, Hugo ouvre le coffre.');
 assert.equal(graph.schema,'aura-native-event-graph-v1');
 assert.equal(graph.scope,'conditional');
 assert.equal(graph.events.length,2);
 assert.deepEqual(graph.events.map(x=>x.agent),['maya','hugo']);
 assert.equal(graph.events[0].relation_role,'condition');
 assert.equal(graph.events[1].relation_role,'consequence');
 assert.equal(graph.relations[0].type,'implies-if');
 assert.ok(graph.events.every(x=>!x.asserted));
 assert.equal(graph.verified_world_facts,0);
});
test('completed before-after graph has temporal edges with only unverified user evidence',()=>{
 const source='Maya a ouvert le coffre une fois que Hugo a fermé la porte.';
 const graph=buildNativeEventGraph(source,parseFrenchStatement);
 assert.equal(graph.scope,'user-asserted');
 assert.equal(graph.events.length,2);
 assert.deepEqual(graph.events.map(x=>x.agent),['hugo','maya']);
 assert.deepEqual(graph.events.map(x=>x.tense),['past','past']);
 assert.deepEqual(graph.events.map(x=>x.aspect),['completed','completed']);
 assert.ok(graph.events.every(x=>x.asserted));
 assert.equal(graph.relations[0].type,'before');
 assert.equal(graph.verified_world_facts,0);
});
test('uncompleted chronology cannot be treated as an accomplished action',()=>{
 const source='Maya ouvre le coffre une fois que Hugo a fermé la porte.';
 const graph=inspectFrenchEventGraph(source);
 assert.equal(graph.scope,'temporal-underspecified');
 assert.ok(graph.events.every(x=>!x.asserted));
 assert.equal(answerFrenchFromConversation({question:'Qui a ouvert le coffre ?',
  history:[{role:'user',content:source}]}),null);
});
test('independent future line does not force a false positive next to an asserted past event',()=>{
 const answer=answerFrenchFromConversation({question:'Qui a ouvert la porte ?',
  history:[{role:'user',content:'Demain Romain ouvre la porte.'},
           {role:'user',content:'Hugo a ouvert la porte.'}]});
 assert.match(answer?.text||'',/Hugo/);
});
