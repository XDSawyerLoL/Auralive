import test from 'node:test';
import assert from 'node:assert/strict';
import { consolidateLessons } from '../src/memory_consolidation.js';
import { reflexOutcomeRecord, summarizeReflexObservations } from '../src/reflex_metrics.js';

test('founder long-term memory ranks relevant observations and avoids duplicates', () => {
  const results = consolidateLessons([
    {lesson_key:'a',content:'Mission GEKKO : le moteur de rendu a été amélioré',confidence:0.7,evidence_count:2,source:'project',updated_at:'2026-10-01'},
    {lesson_key:'a',content:'Mission GEKKO : le moteur de rendu a été amélioré',confidence:0.7,evidence_count:2,source:'project',updated_at:'2026-10-02'},
    {lesson_key:'b',content:'Langage français AURA nécessite des évaluations',confidence:0.8,evidence_count:2,source:'reflection',updated_at:'2026-10-03'},
  ], 'langage français', 4);
  assert.equal(results.length,1);
  assert.equal(results[0].evidence_status,'stored-lesson-unverified');
  assert.match(results[0].note,/Langage français/);
  assert.deepEqual(consolidateLessons([], 'français'), []);
  assert.deepEqual(consolidateLessons([{content:'Langage français'}], ''), []);
});
test('Reflex cannot attribute a result to another decision', () => {
  const assessment={decision_id:'a',compute_tier:'deep',risk:0.6,novelty:0.8,uncertainty:0.5,difficulty:0.7};
  assert.equal(reflexOutcomeRecord(assessment,{reflex_decision_id:'b',ok:true}),null);
  const result=reflexOutcomeRecord(assessment,{reflex_decision_id:'a',ok:true,evidence_level:'machine-verified'});
  assert.equal(result.outcome_ok,1);
  assert.equal(result.evidence_level,'reported');
});
test('tracking never misrepresents observational counters as calibration or AGI', () => {
  const stats=summarizeReflexObservations([
    {compute_tier:'deep',outcome_ok:0,evidence_level:'reported'},
    {compute_tier:'fast',outcome_ok:1,evidence_level:'reported'},
  ]);
  assert.equal(stats.observations,2);
  assert.equal(stats.by_tier.deep.failures,1);
  assert.equal(stats.calibrated,false);
  assert.equal(stats.machine_verified,0);
});
