import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeCortex08Physiology} from '../src/cortex08_physiology.js';
import {buildBrainTelemetry} from '../src/brain_telemetry.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {CORTEX08_MATERIAL_SCRIPT} from '../src/cortex08_material.js';
import {CORTEX08_SCENE_SCRIPT} from '../src/cortex08_scene.js';
import {CORTEX08_FOCUS_SCRIPT} from '../src/cortex08_focus.js';
import {CORTEX08_FLOW_SCRIPT} from '../src/cortex08_flow.js';

const now=Date.parse('2026-11-11T21:00:00Z'),at=new Date(now).toISOString();
const recent={status:'recent',updated_at:at};
function telemetry({cpu=20,heap=40,pressure=30,stability=90,attention=63,
  date=at,enabled=true}={}){
 return {
  runtime_ready:true,source:{status:'recent',updated_at:date},
  somatic:{source:'node-process',
    freshness:{status:'recent',updated_at:date},
    compute_pressure:pressure},
  neuro_vitals:{sensor_fresh:true,
   vitals:[
    {id:'cpu',available:true,value:cpu,observed_at:date},
    {id:'heap',available:true,value:heap,observed_at:date},
    {id:'reserve',available:true,value:70,observed_at:date},
    {id:'stability',available:true,value:stability,observed_at:date},
   ]},
  global_workspace:{at:date,broadcast_enabled:enabled,
   freshness:{status:'recent'},selected:[{source:'memory',score:attention}]},
 };
}
test('CORTEX 08 has continuous but truthful measured-process dynamics',()=>{
 const idle=computeCortex08Physiology(telemetry({cpu:7}),now);
 const stressed=computeCortex08Physiology(telemetry({cpu:95,pressure:98,stability:20,heap:92}),now);
 assert.equal(idle.measured,true);
 assert.equal(stressed.measured,true);
 assert.equal(idle.state,'quiet');
 assert.equal(stressed.state,'strained');
 assert.ok(stressed.controls.movement>idle.controls.movement);
 assert.ok(stressed.controls.tension>idle.controls.tension);
 assert.ok(stressed.controls.ambient_wave_hz>idle.controls.ambient_wave_hz);
 assert.ok(stressed.controls.surface_displacement>idle.controls.surface_displacement);
 assert.ok(stressed.controls.density>idle.controls.density);
 assert.equal(stressed.controls.coherence,.2);
 assert.equal(stressed.controls.focus,.63);
 assert.equal(idle.ambient_motion_is_metric_analogy,true);
 assert.equal(idle.observed_hops_required_for_spikes,true);
 assert.equal(idle.biological_measurement,false);
 assert.equal(idle.consciousness_proven,false);
 assert.deepEqual(idle,computeCortex08Physiology(telemetry({cpu:7}),now));
});
test('CORTEX 08 does not invent motion or read stale process readings',()=>{
 const absent=computeCortex08Physiology({},now);
 assert.equal(absent.measured,false);
 assert.equal(absent.state,'unobserved');
 assert.ok(Object.values(absent.controls).every(v=>v===null));
 const old=new Date(now-121000).toISOString();
 const stale=computeCortex08Physiology(telemetry({date:old,cpu:100}),now);
 assert.equal(stale.measured,false);
 assert.equal(stale.controls.movement,null);
 assert.equal(stale.controls.ambient_wave_hz,null);
 const missing=telemetry();
 missing.neuro_vitals.vitals=missing.neuro_vitals.vitals.filter(x=>x.id!=='cpu');
 assert.equal(computeCortex08Physiology(missing,now).measured,false);
});
test('workspace focus is only a recorded broadcast, not a guessed attention',()=>{
 const admitted=computeCortex08Physiology(telemetry(),now);
 assert.equal(admitted.focus_source,'memory');
 assert.equal(admitted.controls.focus,.63);
 const unbroadcast=computeCortex08Physiology(telemetry({enabled:false}),now);
 assert.equal(unbroadcast.focus_source,null);
 assert.equal(unbroadcast.controls.focus,null);
});
test('prediction error modulation requires a timestamped observation',()=>{
 const base=telemetry(),fresh={...base,prediction:{
  modules:[{id:'a',last_error:85,last_at:at},{id:'b',last_error:15,last_at:at}]}};
 assert.equal(computeCortex08Physiology(fresh,now).controls.instability,.85);
 const stale={...base,prediction:{
  modules:[{id:'a',last_error:100,last_at:new Date(now-240000).toISOString()}]}};
 assert.equal(computeCortex08Physiology(stale,now).controls.instability,null);
});
test('server brain projection includes CORTEX08 but retains old telemetry contract',()=>{
 const state={runtime_ready:true,kernel_status:{organism:{
  updated_at:at,stabilite:.82,homeostasis:{failure_ema:.22,
   sensor:{source:'node-process',sampled_at:at,
    cpu_utilization:.37,heap_utilization:.41,compute_pressure:.39}},
 }}};
 const result=buildBrainTelemetry(state,{},now);
 assert.equal(result.neuro_vitals.version,'aura-neuro-vital-signs-v1');
 assert.equal(result.cortex08.version,'cortex08-visual-physiology-v1');
 assert.equal(result.cortex08.measured,true);
 assert.equal(result.cortex08.metrics.cpu,.37);
});
test('shaders and frames cannot synthesize spikes and stop on stale sensors',()=>{
 for(const script of [
  CORTEX08_MATERIAL_SCRIPT,CORTEX08_SCENE_SCRIPT,
  CORTEX08_FLOW_SCRIPT,CORTEX08_FOCUS_SCRIPT,
 ]){
  assert.doesNotThrow(()=>new Function(script));
  assert.doesNotMatch(script,/Math\.random\(/);
 }
 assert.match(CORTEX08_SCENE_SCRIPT,/function c8Fresh\(/);
 assert.match(CORTEX08_SCENE_SCRIPT,/if\(!c8Fresh\(\)\)/);
 assert.match(CORTEX08_SCENE_SCRIPT,/document\.hidden/);
 assert.match(CORTEX08_SCENE_SCRIPT,/prefers-reduced-motion/);
 assert.match(CORTEX08_SCENE_SCRIPT,/c8Stage\.snapshot=data\?\.telemetry\?\.cortex08/);
 assert.match(CORTEX08_MATERIAL_SCRIPT,/canvas\.getContext\('webgl'/);
 assert.match(CORTEX08_MATERIAL_SCRIPT,/getContext\('2d'/);
 assert.match(CORTEX08_FLOW_SCRIPT,/source:'persisted-brain-hop'/);
 assert.match(CORTEX08_FLOW_SCRIPT,/9000/);
 assert.match(CORTEX08_FOCUS_SCRIPT,/broadcast_enabled/);
});
test('one page contains visible status and real-event overlays',()=>{
 for(const id of [
  'cortex07Canvas','cortex07PosterImage','c8PhysiologyStatus',
  'c8PhysiologyLabel','c8SensorAge','c8FocusState',
 ])assert.ok(BRAIN_OPERATIONS_HTML.includes('id="'+id+'"'),id);
 assert.match(BRAIN_OPERATIONS_HTML,/#cortex07Canvas\{display:block!important/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/c8Observe\(data\)/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/function c8Observe\(/);
 const old=readFileSync(new URL('../src/cortex06_runtime.js',import.meta.url),'utf8');
 assert.match(old,/c8DrawAfterglow\(ctx\)/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="chatInput"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="neuro-lab-details"/);
});
