import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_ORGANISM_V5_HTML,BRAIN_ORGANISM_V5_CSS}
  from '../src/brain_organism_v5.js';
import {BRAIN_ORGANISM_V5_SCRIPT} from '../src/brain_organism_v5_runtime.js';
import {BRAIN_READABLE_CSS} from '../src/brain_readable_theme.js';
import {buildNeuroVitalSigns} from '../src/brain_physiology.js';
import {buildBrainTelemetry} from '../src/brain_telemetry.js';

const t=Date.parse('2026-11-11T18:00:00+01:00'),at=new Date(t).toISOString();
const recent={status:'recent',updated_at:at,age_seconds:0};

test('P0: unavailable sensors never render fake physiology, hormones, pulses or emotions',()=>{
 const data=buildNeuroVitalSigns({runtime_ready:false,somatic:{source:'unavailable'}},t);
 assert.equal(data.sensor_fresh,false);
 assert.equal(data.measured_sensor_count,0);
 assert.equal(data.signals_available,0);
 assert.ok(data.vitals.every(x=>x.value===null&&!x.available&&
  x.biological_measurement===false));
 assert.equal(data.no_fake_heartbeat,true);
 assert.equal(data.pulse_requires_persisted_brain_hop,true);
 assert.equal(data.distinct_from_biological_human,true);
});
test('P0: process-only vitals are measured; analogues explicitly derived',()=>{
 const data=buildNeuroVitalSigns({
  runtime_ready:true,source:recent,failure_ema:30,
  metrics:[{id:'stabilite',value:81},{id:'pression_de_reve',value:54}],
  somatic:{freshness:recent,source:'node-process',
   cpu_utilization:74,heap_utilization:62,compute_pressure:80},
  viability:{reserve:57,source:'node-process',last_at:at},
  global_workspace:{broadcast_enabled:true,freshness:recent,
    at,selected:[{source:'perception',score:91}]},
  verified_loop:{last_success_at:at,recent_verified_successes:2},
 },t);
 const values=Object.fromEntries(data.vitals.map(x=>[x.id,x]));
 assert.equal(values.cpu.value,74);
 assert.equal(values.heap.value,62);
 assert.equal(values.reserve.value,57);
 assert.equal(values.cortisol_like.value,66);
 assert.equal(values.dopamine_like.value,75);
 assert.equal(values.attention.value,91);
 assert.equal(values.melatonin_like.value,54);
 assert.equal(values.serotonin_like.kind,'derived-analogue');
 assert.equal(values.dopamine_like.biological_measurement,false);
 assert.equal(data.measured_sensor_count,2);
});
test('P0: stale sources invalidate the visible sign, never keep the previous glow',()=>{
 const old={status:'stale',updated_at:new Date(t-180000).toISOString(),age_seconds:180};
 const data=buildNeuroVitalSigns({
  runtime_ready:true,source:old,metrics:[{id:'stabilite',value:100}],
  somatic:{freshness:old,source:'node-process',
    cpu_utilization:90,heap_utilization:97,compute_pressure:100},
  viability:{reserve:90,last_at:new Date(t-180000).toISOString(),
    source:'node-process'},
  global_workspace:{broadcast_enabled:true,freshness:old,
    selected:[{score:80}]},
 },t);
 for(const item of data.vitals)
  assert.equal(item.available,false,'stale must be unavailable: '+item.id);
});
test('P0: legacy telemetry attaches verifiable vitality projection without leaking raw user text',()=>{
 const state={runtime_ready:true,kernel_status:{organism:{
  updated_at:at,stabilite:.8,pression_de_reve:.35,
  homeostasis:{failure_ema:.3,sensor:{source:'node-process',
    sampled_at:at,heap_utilization:.6,cpu_utilization:.4,
    compute_pressure:.4,rss_bytes:50000000}},
 }}};
 const result=buildBrainTelemetry(state,{viability:{
  reserve:.9,source:'node-process',at,
 }},t);
 assert.equal(result.neuro_vitals.version,'aura-neuro-vital-signs-v1');
 assert.equal(result.neuro_vitals.vitals.find(x=>x.id==='cpu').value,40);
 assert.equal(result.neuro_vitals.vitals.find(x=>x.id==='stability').value,80);
 assert.equal(result.neuro_vitals.vitals.find(x=>x.id==='reserve').value,90);
 assert.equal(result.neuro_vitals.vitals.find(x=>x.id==='cortisol_like').value,37);
 assert.equal(result.neuro_vitals.vitals.some(x=>x.subjective_experience_proven),false);
});
test('P0: artistic stage is SINGLE-page, graphic and responsive with native interaction',()=>{
 for(const id of [
  'organismObserver','v5EventStream','v5VitalGauges','v5TimelineTrack',
  'v5WorkspaceFocus','v5Evidence','v5ToggleChat','v5ToggleDetails',
 ])assert.ok(BRAIN_OPERATIONS_HTML.includes('id="'+id+'"'),id+' missing');
 for(const attr of ['thalamus','prefrontal','hippocampus',
  'basal_ganglia','insula','metacognition']){
  assert.ok(BRAIN_ORGANISM_V5_HTML.includes('data-organism-module="'+attr+'"'));
 }
 assert.match(BRAIN_ORGANISM_V5_CSS,/\.v5-ring-core/);
 assert.match(BRAIN_ORGANISM_V5_CSS,/\.v5-gauge-meter/);
 assert.match(BRAIN_ORGANISM_V5_CSS,/@media\(max-width:850px\)/);
 assert.match(BRAIN_ORGANISM_V5_CSS,/@media\(prefers-reduced-motion:reduce\)/);
 assert.ok(BRAIN_READABLE_CSS.includes('.v5-neural-legend'));
 assert.ok(BRAIN_OPERATIONS_HTML.includes('id="neuro-lab-details"'));
 assert.ok(BRAIN_OPERATIONS_HTML.includes('id="scienceGenomeCanvas"'));
 assert.equal((BRAIN_OPERATIONS_HTML.match(/id="graphCanvas"/g)||[]).length,1);
});
test('P0: no idle synthetic action, recent real hop needed for traveling flash',()=>{
 assert.match(BRAIN_ORGANISM_V5_SCRIPT,/function v5IngestEvidence/);
 assert.match(BRAIN_ORGANISM_V5_SCRIPT,/if\(v5Primed&&entry\.kind==='hop'/);
 assert.match(BRAIN_ORGANISM_V5_SCRIPT,/age>=0&&age<4000/);
 assert.match(BRAIN_ORGANISM_V5_SCRIPT,/!reduced&&!document\.hidden/);
 assert.match(BRAIN_ORGANISM_V5_SCRIPT,/Number\(edge\.observed_count\|\|0\)<1/);
 assert.match(BRAIN_ORGANISM_V5_SCRIPT,/function v5DrawReceiptPulses/);
 assert.match(BRAIN_ORGANISM_V5_SCRIPT,/state\.v5Pulses/);
 const runtime=readFileSync(new URL('../src/brain_operations_runtime.js',import.meta.url),'utf8');
 const connectome=readFileSync(new URL('../src/brain_connectome_v4.js',import.meta.url),'utf8');
 assert.match(runtime,/v5IngestEvidence\(earlierState,data\)/);
 assert.doesNotMatch(runtime,/One explicit ARCHIVE-labeled playback on first load/);
 assert.match(connectome,/v5DrawReceiptPulses\(\)/);
 assert.match(connectome,/function v5CerebralMorphology/);
 assert.match(connectome,/Static biomorphic outline/);
});
