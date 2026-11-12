import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {CORTEX10_SCRIPT} from '../src/cortex10_autonomous_live.js';
import {CORTEX09_SCRIPT} from '../src/cortex09_neural_volume.js';
import {CORTEX08_SCENE_SCRIPT} from '../src/cortex08_scene.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {buildBrainTelemetry} from '../src/brain_telemetry.js';
import {buildBrainFlowGraph} from '../src/brain_flow.js';
import {independentInquiryDue} from '../src/independent_continuity.js';

const now=Date.parse('2026-11-12T09:00:00.000Z');
const at=new Date(now).toISOString();
const frame=runInNewContext(CORTEX10_SCRIPT+';c10CycleFrame', {Math,Date});
const sample=(count,date=at)=>({runtime_ready:true,telemetry:{
 autonomous_cycle:{at:date,count,freshness:{status:'recent'}},
}});
test('CORTEX 10 transitions only on a real, dated background cycle',()=>{
 assert.doesNotThrow(()=>new Function(CORTEX10_SCRIPT));
 assert.doesNotMatch(CORTEX10_SCRIPT,/Math\.sin\(/);
 const start=frame(sample(9),now),middle=frame(sample(9),now+5000),
   still=frame(sample(9),now+14500),later=frame(sample(9),now+70000);
 assert.equal(start.transitioning,true);
 assert.equal(middle.transitioning,true);
 assert.equal(still.transitioning,false);
 assert.equal(still.angle,later.angle,'not an infinite sine animation');
 assert.notEqual(start.angle,still.angle);
 assert.notEqual(still.angle,frame(sample(10,new Date(now+70000).toISOString()),now+85000).angle);
 assert.equal(frame(sample(9,new Date(now-130000).toISOString()),now),null);
 assert.equal(frame({runtime_ready:false,telemetry:sample(9).telemetry},now),null);
 assert.equal(frame({runtime_ready:true,telemetry:{}},now),null);
});
test('public telemetry labels a persisted ambient tick, not proof of thought',()=>{
 const organism={updated_at:at,homeostasis:{sensor:{source:'node-process',
    sampled_at:at,cpu_utilization:.03,heap_utilization:.34,compute_pressure:.08}}};
 const model=buildBrainTelemetry({
  runtime_ready:true,kernel_status:{organism},soul:{organism},
 },{
  background_cycle:{background_cycles:44,last_background_tick_at:at},
  independent_probe_seconds:180,
  curiosity_cycle:{last_run_at:at,questions_last_hour:2},
 },now);
 assert.equal(model.autonomous_cycle.count,44);
 assert.equal(model.autonomous_cycle.freshness.status,'recent');
 assert.equal(model.autonomous_cycle.current_task_verified,false);
 assert.equal(model.curiosity_cycle.questions_last_hour,2);
 assert.equal(model.curiosity_cycle.freshness.status,'recent');
 assert.equal(model.autonomous_cycle.activity_kind,'organism-and-workspace-evaluation');
 const stale=buildBrainTelemetry({runtime_ready:true,kernel_status:{organism}},
  {background_cycle:{background_cycles:44,last_background_tick_at:new Date(now-500000).toISOString()}},now);
 assert.equal(stale.autonomous_cycle.freshness.status,'aging');
});
test('real autonomous self-probe interval is bounded, and default remains compatible',()=>{
 const old=new Date(now-190000).toISOString();
 assert.equal(independentInquiryDue({last_probe_at:old},now,180000),true);
 assert.equal(independentInquiryDue({last_probe_at:old},now),false);
 assert.equal(independentInquiryDue({last_probe_at:new Date(now-59000).toISOString()},now,180000),false);
});
test('no overlay-only loop remains and all read-only status DOM is connected',()=>{
 assert.doesNotMatch(CORTEX09_SCRIPT,/Math\.sin\(seconds/);
 assert.match(CORTEX09_SCRIPT,/c10CycleFrame\(data\)/);
 assert.match(CORTEX08_SCENE_SCRIPT,/c10CycleFrame\(c6State\.lastData\)/);
 assert.match(CORTEX08_SCENE_SCRIPT,/cycle\?\.phase\?\?0/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/c10Observe\(data\)/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="c10AutonomyTitle"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="c10AutonomyProbe"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="c10AutonomyWork"/);
 const graph=buildBrainFlowGraph({telemetry:{runtime_ready:true},traceRows:[
   {id:1,kind:'curiosity-question',created_at:at,title:'redacted',context:'{}'}]},now);
 assert.ok(graph.events.some(e=>e.type==='curiosity-question'));
 assert.equal(graph.nodes.find(n=>n.id==='curiosity').activity_verified,true);
 const api=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(api,/background_cycle:bootstrap.runtimeReady/);
 assert.match(api,/curiosity_cycle:bootstrap.runtimeReady\?projection.curiosity:null/);
 assert.match(api,/curiosity_cycle:bootstrap.runtimeReady\?current.curiosity:null/);
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(kernel,/periodMs: config\.independentProbeSeconds \* 1000/);
 assert.match(kernel,/flow_id:autonomousFlowId,from,to,stage,status:'ok'/);
 assert.match(kernel,/void this\.tick\(\{trigger:'startup',force:false\}\)/);
});
