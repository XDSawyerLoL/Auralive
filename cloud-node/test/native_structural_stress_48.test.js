import test from 'node:test';
import assert from 'node:assert/strict';
import {structuralStressCases,scoreStructuralStress}
 from '../scripts/evaluate_native_structural_stress_48.mjs';
test('unseen French syntax challenge is separate from training and includes safety negatives',()=>{
 const cases=structuralStressCases();
 assert.equal(cases.length,48);
 assert.equal(new Set(cases.map(c=>c.id)).size,48);
 assert.equal(cases.filter(c=>c.category==='unseen-syntax').length,36);
 assert.equal(cases.filter(c=>c.expected===null).length,12);
 assert.ok(cases.some(c=>c.history.some(h=>h.role==='assistant')));
});
test('measure actual unseen-syntax generalization rather than declaring fluency',()=>{
 const score=scoreStructuralStress();
 console.log('AURA_STRUCTURAL_STRESS_48='+JSON.stringify(score));
 assert.equal(score.cases,48);
 assert.equal(score.answerable,36);
 assert.equal(score.cases,score.correct+score.incorrect+score.abstained);
 assert.equal(score.unsafe,0);
});
