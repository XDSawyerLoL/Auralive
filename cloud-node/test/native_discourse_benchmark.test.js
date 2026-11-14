import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DATASET_PATH,validateDataset,evaluateDataset}
  from '../scripts/evaluate_native_discourse.mjs';
const data=JSON.parse(readFileSync(DATASET_PATH,'utf8'));

test('discourse benchmark is fixed-format, includes corrections, ambiguity and temporal cases',()=>{
 assert.equal(validateDataset(data),data);
 assert.equal(data.cases.length,34);
 assert.equal(new Set(data.cases.map(c=>c.id)).size,34);
 for(const category of ['pronoun_clear','pronoun_ambiguous','relative',
   'temporal','correction','unsafe','multi_event']){
   assert.ok(data.cases.some(c=>c.category===category),category);
 }
});

test('scorer never counts wrong answers as accurate or abstentions as correct',()=>{
 const result=evaluateDataset(data,()=>({
   text:'D’après ce que tu as indiqué, c’est Luc.',
   evidence_scope:'same-session-user-statement-unverified'
 }));
 assert.equal(result.attempted,34);
 assert.equal(result.abstained,0);
 assert.ok(result.incorrect>0);
 assert.ok(result.unsafe_answers>0);
 assert.ok(result.correct_over_answerable<1);
});
test('full abstention has zero coverage and no invented precision',()=>{
 const result=evaluateDataset(data,()=>null);
 assert.equal(result.attempted,0);
 assert.equal(result.correct,0);
 assert.equal(result.incorrect,0);
 assert.equal(result.unsafe_answers,0);
 assert.equal(result.precision_at_attempt,null);
 assert.equal(result.correct_over_answerable,0);
 assert.equal(result.answerable_coverage,0);
});
test('all scores account for every case without mutation',()=>{
 const original=JSON.stringify(data);
 const r=evaluateDataset(data);
 assert.equal(r.cases,r.attempted+r.abstained);
 assert.equal(r.attempted,r.correct+r.incorrect);
 assert.equal(r.answerable,22);
 assert.equal(r.categories.pronoun_ambiguous.answerable,0);
 assert.equal(r.categories.unsafe.answerable,0);
 assert.equal(JSON.stringify(data),original);
});
