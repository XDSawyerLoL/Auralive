import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyHeldout,scoreHeldout} from '../scripts/evaluate_discourse_heldout_100.mjs';

const v1=JSON.parse(readFileSync(new URL('../benchmarks/fr_discourse_heldout_100_v1.json',import.meta.url)));
const v2=JSON.parse(readFileSync(new URL('../benchmarks/fr_discourse_stress_100_v2.json',import.meta.url)));
test('second cohort has 100 frozen cases with a separate semantic-family balance',()=>{
 assert.equal(verifyHeldout(v2),v2);
 assert.equal(v2.cases.length,100);
 assert.equal(v2.source,'fresh-authored-structural-stress-not-external-blind');
 const families=new Map();
 for(const item of v2.cases)families.set(item.category,(families.get(item.category)||0)+1);
 assert.equal(families.size,10);
 assert.ok([...families.values()].every(n=>n===10));
});
test('no exact same question and conversation leaked from first cohort',()=>{
 const key=x=>JSON.stringify([x.history,x.question]);
 const prior=new Set(v1.cases.map(key));
 assert.equal(v2.cases.filter(x=>prior.has(key(x))).length,0);
});
test('second cohort scorer reports all abstentions as missed on answerable questions',()=>{
 const outcome=scoreHeldout(v2,()=>null);
 assert.equal(outcome.totals.cases,100);
 assert.equal(outcome.totals.attempted,0);
 assert.equal(outcome.totals.correct,0);
 assert.equal(outcome.totals.wrong,0);
 assert.equal(outcome.missed_case_ids.length,outcome.totals.answerable);
 assert.equal(outcome.correct_over_answerable_percent,0);
});
test('second cohort never overclaims blind external annotation',()=>{
 const outcome=scoreHeldout(v2);
 assert.equal(outcome.dataset_schema,v2.schema);
 assert.match(outcome.caveat,/NOT independent/i);
 assert.equal(outcome.totals.attempted+outcome.totals.abstained,100);
 assert.equal(outcome.totals.correct+outcome.totals.wrong,outcome.totals.attempted);
});
