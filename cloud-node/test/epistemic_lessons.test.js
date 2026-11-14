import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateKind,evaluateProspectiveLessonEvidence,
 verifiedLessonDescription,evidenceAblation,TRUSTED_LESSONS_SQL}
 from '../src/epistemic_lessons.js';
import {readFileSync} from 'node:fs';
const claim='2026-11-14T10:00:00.000Z';
const item=(id,mission,success,extra={})=>({
 episode_id:id,mission_id:mission,kind:'action',
 ts:'2026-11-14T10:10:00.000Z',
 observed_at:'2026-11-14T10:10:01.000Z',
 context_tag:'docs_readability',action:'verify',prediction:'local-probe-readable',
 source:'machine-verified',ablated:0,success,
 outcome_hash:('a'.repeat(63)+String(id%10)),
 ...extra
});
const options={context_tag:'docs_readability',action:'verify',candidate_created_at:claim};
test('introspection and reported failures are candidates, never verified receipts',()=>{
 assert.equal(candidateKind('reflection'),'hypothesis');
 assert.equal(candidateKind('evolution-cloud'),'hypothesis');
 assert.equal(candidateKind('long-horizon-critic'),'hypothesis');
 assert.equal(candidateKind('automation-outcomes'),'reported');
 const repeated=Array.from({length:30},(_,i)=>item(i+1,'same-mission',1));
 assert.equal(evaluateProspectiveLessonEvidence(repeated,options).verified,false);
 assert.equal(evaluateProspectiveLessonEvidence(repeated,options).independent_runs,1);
});
test('only prospective verified outcomes from different runs promote an empirical observation',()=>{
 const rows=[item(1,'run-a',1),item(2,'run-b',0)];
 const x=evaluateProspectiveLessonEvidence(rows,options);
 assert.equal(x.verified,true);
 assert.equal(x.independent_runs,2);
 assert.equal(x.successes,1);
 assert.equal(x.failures,1);
 assert.equal(x.observed_success_estimate,0.5);
 const description=verifiedLessonDescription(options,x);
 assert.match(description,/1 réussite\(s\) et 1 échec\(s\)/);
 assert.match(description,/ne prouve ni une règle universelle/);
 const ablation=evidenceAblation(rows,options);
 assert.equal(ablation.promotion_depends_on_evidence,true);
 assert.equal(ablation.removed.verified,false);
});
test('prior outcomes, retracted episodes, user reports and retrospective predictions cannot promote',()=>{
 const rows=[
  item(1,'run-a',1,{ts:'2026-11-14T09:00:00.000Z'}),
  item(2,'run-b',1,{ablated:1}),
  item(3,'run-c',1,{source:'external-report'}),
  item(4,'run-d',1,{prediction:null}),
  item(5,'run-e',1,{observed_at:'2026-11-14T10:09:00.000Z'}),
  item(6,'run-f',1,{outcome_hash:'not-a-hash'}),
  item(7,'run-g',1,{context_tag:'different_context'}),
  item(8,'run-h',1,{action:'respond'}),
 ];
 const result=evaluateProspectiveLessonEvidence(rows,options);
 assert.equal(result.verified,false);
 assert.equal(result.independent_runs,0);
});
test('same mission cannot artificially increase confidence',()=>{
 const rows=[item(1,'run-a',1),item(2,'run-a',1),item(3,'run-b',0)];
 const r=evaluateProspectiveLessonEvidence(rows,options);
 assert.equal(r.verified,true);
 assert.equal(r.independent_runs,2);
 assert.equal(r.successes,1);
});
test('trusted lesson retrieval queries recheck proof status and ablation',()=>{
 assert.match(TRUSTED_LESSONS_SQL,/machine-verified-history/);
 assert.match(TRUSTED_LESSONS_SQL,/c.status='verified'/);
 assert.match(TRUSTED_LESSONS_SQL,/e.ablated=0/);
 assert.match(TRUSTED_LESSONS_SQL,/COUNT\(DISTINCT e.mission_id\)/);
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const language=readFileSync(new URL('../src/language_faculty.js',import.meta.url),'utf8');
 const db=readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
 assert.match(kernel,/async learn\(\{lessonKey,content,confidence/);
 assert.match(kernel,/INSERT INTO aura_learning_candidates/);
 assert.match(kernel,/async promoteVerifiedLesson\(/);
 assert.match(kernel,/query\(TRUSTED_LESSONS_SQL/);
 assert.match(language,/TRUSTED_LESSONS_SQL/);
 assert.match(db,/LATEST_SCHEMA_VERSION = 19/);
 assert.match(db,/CREATE TABLE IF NOT EXISTS aura_learning_candidates/);
 assert.match(db,/INSERT IGNORE INTO aura_learning_candidates/);
});
