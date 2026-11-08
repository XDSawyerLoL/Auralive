import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProcessSomaticSensor,
  evolveHomeostasis,
  publicSomaticState,
} from '../src/somatic_dynamics.js';
import { AuraOrganism } from '../src/organism.js';
import { buildBrainTelemetry } from '../src/brain_telemetry.js';

const timestamp=Date.parse('2026-11-08T20:00:00Z');
const low={
  source:'node-process',sampled_at:new Date(timestamp).toISOString(),
  heap_used_bytes:25_000_000,rss_bytes:75_000_000,
  heap_utilization:.35,cpu_utilization:.08,compute_pressure:0,coverage:'current-process-only',
};
const high={...low,heap_utilization:.95,cpu_utilization:.96,compute_pressure:.87};

test('measured physical pressure affects state and non-security intention',()=>{
  const organism=new AuraOrganism({sensor:{sample:()=>low}});
  const initial=organism.defaultState();
  const base=evolveHomeostasis(initial,{signal:'event',seconds:180,sensor:low,nowMs:timestamp});
  const underLoad=evolveHomeostasis(initial,{signal:'event',seconds:180,sensor:high,nowMs:timestamp});
  assert.ok(underLoad.stabilite < base.stabilite);
  assert.ok(underLoad.clarte < base.clarte);
  assert.ok(underLoad.besoin_de_silence > base.besoin_de_silence);
  assert.ok(underLoad.homeostasis.resource_pressure > 0);
  const safe=organism.recompute(underLoad,'resource pressure',false);
  const unpressured=organism.recompute(base,'resource pressure',false);
  assert.ok(safe.intention_field.potentials.se_recentrer > unpressured.intention_field.potentials.se_recentrer);
  assert.ok(safe.intention_field.potentials.agir < unpressured.intention_field.potentials.agir);
});

test('verified outcomes affect feedback more than merely generating a sentence',()=>{
  const organism=new AuraOrganism({sensor:{sample:()=>low}});
  const initial=organism.defaultState();
  const success=evolveHomeostasis(initial,{signal:'action_success',seconds:120,sensor:low,nowMs:timestamp});
  const failure=evolveHomeostasis(initial,{signal:'action_failure',seconds:120,sensor:low,nowMs:timestamp});
  const reply=evolveHomeostasis(initial,{signal:'reply_success',seconds:120,sensor:low,nowMs:timestamp});
  assert.ok(success.homeostasis.success_ema > reply.homeostasis.success_ema);
  assert.ok(failure.homeostasis.failure_ema > success.homeostasis.failure_ema);
  assert.ok(failure.frustration > success.frustration);
  assert.ok(failure.confiance < success.confiance);
});

test('idle time produces homeostatic recovery from a failure',()=>{
  const organism=new AuraOrganism({sensor:{sample:()=>low}});
  const initial=organism.defaultState();
  const afterFailure=evolveHomeostasis(initial,{signal:'action_failure',seconds:300,sensor:high,nowMs:timestamp});
  let recovered=afterFailure;
  for(let i=1;i<=12;i++){
    recovered=evolveHomeostasis(recovered,{
      signal:'ambient',seconds:600,sensor:low,nowMs:timestamp+i*600_000,
    });
  }
  assert.ok(recovered.stabilite > afterFailure.stabilite);
  assert.ok(recovered.frustration < afterFailure.frustration);
  assert.ok(recovered.homeostasis.failure_ema < afterFailure.homeostasis.failure_ema);
});

test('bounded algorithmic uncertainty is replayable, persists, and cannot saturate key states',()=>{
  const organism=new AuraOrganism({sensor:{sample:()=>low}});
  const initial=organism.defaultState();
  initial.homeostasis.seed=0x12345678;
  const a=evolveHomeostasis(initial,{signal:'interaction',seconds:60,sensor:low,nowMs:timestamp});
  const b=evolveHomeostasis(initial,{signal:'interaction',seconds:60,sensor:low,nowMs:timestamp});
  assert.deepEqual(a,b);
  assert.notEqual(a.homeostasis.seed,initial.homeostasis.seed);
  const other=structuredClone(initial);
  other.homeostasis.seed=(other.homeostasis.seed^0x9e3779b9)>>>0;
  const c=evolveHomeostasis(other,{signal:'interaction',seconds:60,sensor:low,nowMs:timestamp});
  assert.notEqual(c.stabilite,a.stabilite);
  for(const key of ['stabilite','clarte','satisfaction','confiance','frustration','engagement','agency']){
    assert.ok(a[key]>=.03&&a[key]<=.97,key);
  }
  const saturated=structuredClone(initial);
  saturated.satisfaction=1;saturated.confiance=1;saturated.frustration=0;
  const repaired=organism.recompute(saturated,'legacy',false);
  assert.equal(repaired.satisfaction,.97);
  assert.equal(repaired.confiance,.97);
  assert.equal(repaired.frustration,.03);
});

test('process sensor exposes actual readings but never invents CPU on first sample',()=>{
  let tick=0;
  const sample=new ProcessSomaticSensor({
    memory:()=>({heapUsed:95,heapTotal:100,rss:200}),
    cpu:()=>({user:++tick*600_000,system:0}),
    clock:()=>BigInt(tick)*1_000_000_000n,
    date:()=>timestamp,
  });
  const first=sample.sample();
  assert.equal(first.cpu_utilization,null);
  assert.equal(first.heap_utilization,.95);
  assert.equal(first.compute_pressure,.8333);
  const second=sample.sample();
  assert.equal(second.cpu_utilization,.6);
  assert.equal(second.source,'node-process');
  assert.equal(second.coverage,'current-process-only');
});

test('public telemetry separates process measurement from functional emotional estimates',()=>{
  const organism=new AuraOrganism({sensor:{sample:()=>low}});
  const initial=organism.defaultState();
  const state=evolveHomeostasis(initial,{signal:'action_failure',seconds:60,sensor:low,nowMs:timestamp});
  const publicView=organism.publicState(organism.recompute(state,'test',false));
  assert.equal(publicView.homeostasis.sensor.source,'node-process');
  assert.equal('seed' in publicView.homeostasis,false);
  const published=buildBrainTelemetry({
    runtime_ready:true, soul:{organism:publicView}, kernel_status:{counts:{}},
  },{},timestamp);
  assert.equal(published.somatic.source,'node-process');
  assert.equal(published.somatic.heap_utilization,35);
  assert.equal(published.somatic.compute_pressure,0);
  assert.equal(published.metrics.find(x=>x.id==='satisfaction').measured,false);
  const stale=buildBrainTelemetry({
    runtime_ready:true,soul:{organism:publicView},
  },{},timestamp+400_000);
  assert.equal(stale.somatic.heap_utilization,null);
  assert.equal(stale.somatic.source,'unavailable');
});

test('cognition prioritizes restoring resource stability on measured overload',async()=>{
  const { CognitionEngine } = await import('../src/cognition.js');
  const organism = new AuraOrganism({sensor:{sample:()=>high}});
  const state = organism.defaultState();
  const pressured = evolveHomeostasis(state,{signal:'event',seconds:180,sensor:high,nowMs:timestamp});
  const plan = new CognitionEngine().reflect(
    {stimuli:[],intentions:[],lessons:[],outcomes:[],horizon:''},
    {organism:pressured,current_intention:''},{trigger:'test'},
  );
  assert.equal(plan.title,'Régulation de charge');
  assert.ok(plan.basis.compute_pressure>=.75);
  assert.equal(plan.basis.compute_source,'node-process');
});
