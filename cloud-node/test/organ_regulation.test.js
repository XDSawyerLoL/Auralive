import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {organSignals,organRegulate,organAblation,FUNCTIONAL_ORGANS} from '../src/organ_regulation.js';

const NOW=Date.parse('2026-11-09T18:00:00.000Z');
const makeOrganism=(pressure,age=500,failures=.05)=>({
  homeostasis:{
    resource_pressure:pressure,failure_ema:failures,
    sensor:{
      source:'node-process',sampled_at:new Date(NOW-age).toISOString(),
      compute_pressure:pressure,cpu_utilization:pressure,heap_utilization:pressure,
    },
  },
});
const deep={compute_tier:'deep',token_budget:700,risk:.2,novelty:.2};
test('fresh measured resource pressure causally reduces OPTIONAL model budget',()=>{
 const low=organRegulate(deep,makeOrganism(.1),{nowMs:NOW});
 const high=organRegulate(deep,makeOrganism(.92),{nowMs:NOW});
 assert.equal(low.token_budget,700);
 assert.equal(high.token_budget,406);
 assert.equal(high.execution_preference,'conserve');
 assert.equal(high.organ_regulation.source,'node-process');
 assert.equal(high.organ_regulation.optional_computation_reduced,true);
});
test('verified tier and high-risk decisions retain their original verification budget',()=>{
 const pressure=makeOrganism(.95);
 const verified=organRegulate({compute_tier:'verified',token_budget:1000,risk:.9},pressure,{nowMs:NOW});
 assert.equal(verified.token_budget,1000);
 assert.equal(verified.organ_regulation.verification_preserved,true);
 const highRisk=organRegulate({...deep,risk:.8},pressure,{nowMs:NOW});
 assert.equal(highRisk.token_budget,700);
 assert.equal(highRisk.execution_preference,'normal');
});
test('stale or absent process readings cannot falsely change compute decisions',()=>{
 const stale=organRegulate(deep,makeOrganism(1,180001),{nowMs:NOW});
 assert.equal(stale.organ_regulation.source,'no-current-process-reading');
 assert.equal(stale.token_budget,700);
 const synthetic={homeostasis:{resource_pressure:1}};
 assert.equal(organRegulate(deep,synthetic,{nowMs:NOW}).token_budget,700);
});
test('ablation neutralizes precisely the causal signal, not the overall state',()=>{
 const replay=organAblation(deep,makeOrganism(.9),{nowMs:NOW});
 assert.equal(replay.pressure_causal,true);
 assert.equal(replay.failure_causal,false);
 assert.equal(replay.noPressure.token_budget,700);
 assert.equal(replay.actual.token_budget,406);
 assert.equal(replay.deterministic_replay,true);
});
test('high observed failure rate gives a distinct audit preference without false emotions',()=>{
 const elevated=organRegulate(deep,makeOrganism(.05,500,.86),{nowMs:NOW});
 assert.equal(elevated.execution_preference,'verify-failures');
 const replay=organAblation(deep,makeOrganism(.05,500,.86),{nowMs:NOW});
 assert.equal(replay.failure_causal,true);
 assert.equal(elevated.organ_regulation.subjective_emotion_claim,false);
});
test('all organ names map to explicit software functions and code uses real budget',()=>{
 assert.equal(FUNCTIONAL_ORGANS.hippocampus,'evidence_linked_episodes');
 assert.equal(FUNCTIONAL_ORGANS.hypothalamus,'resource_budget_setpoints');
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(kernel,/organRegulate\(/);
 assert.match(kernel,/inference\.organ_regulation/);
 assert.match(kernel,/Math\.max\(120, Number\(inference\.token_budget/);
});
