import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeConstructionLearner} from '../src/native_construction_learning.js';
import {frozenNativeMultiturnCases,evaluateNativeMultiturn}
 from '../scripts/evaluate_native_multiturn_100.mjs';

test('100 development conversations are distinct and include complex negative categories',()=>{
 const cases=frozenNativeMultiturnCases();
 assert.equal(cases.length,100);
 assert.equal(new Set(cases.map(c=>c.id)).size,100);
 const categories=Object.fromEntries(['single','correction','ambiguous',
  'negation','conditional','double'].map(category=>[category,
   cases.filter(c=>c.category===category).length]));
 assert.deepEqual(categories,{single:40,correction:20,ambiguous:10,
  negation:10,conditional:10,double:10});
 assert.ok(cases.some(c=>c.history.some(row=>row.role==='assistant')));
 assert.ok(cases.some(c=>c.prompt.includes('D\'après notre échange')));
});
test('native linguistic learning makes a measurable causal difference on multi-turn dialogues',()=>{
 const before=evaluateNativeMultiturn({constructionLearner:new NativeConstructionLearner()});
 const after=evaluateNativeMultiturn();
 console.log('AURA_FRENCH_MULTITURN_EVAL='+JSON.stringify({trained:after,
  ablation:{correct:before.correct,wrong:before.wrong,abstained:before.abstained,
   unsafe:before.unsafe}}));
 assert.equal(after.cases,100);
 assert.equal(after.answerable,70);
 assert.equal(after.correct+after.wrong+after.abstained,100);
 assert.ok(after.correct>before.correct, 'Training must change correctness on genuinely novel combinations');
 assert.equal(after.unsafe,0, 'No invented actors for ambiguity, negation or hypotheticals');
 assert.ok(after.correct>=60,'Conversation competence floor must be falsifiable');
});
