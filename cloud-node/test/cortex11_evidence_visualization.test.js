import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {ObservedProcessMonitor} from '../src/process_observer.js';
import {buildBrainTelemetry} from '../src/brain_telemetry.js';
import {buildBrainFlowGraph} from '../src/brain_flow.js';
import {CORTEX11_SCRIPT,CORTEX11_CSS} from '../src/cortex11_evidence_render.js';
import {CORTEX06_SCRIPT} from '../src/cortex06_runtime.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';

const now=Date.parse('2026-11-12T09:30:00.000Z');
const iso=ms=>new Date(ms).toISOString();

test('observer samples the actual process on the server with no browser',()=>{
 let current=now,scheduled=null,stopped=false,calls=0;
 const sensor={sample(){return {
  source:'node-process',sampled_at:iso(current),
  cpu_utilization:calls++===0?null:.0243,
  heap_utilization:.5387,compute_pressure:0,rss_bytes:25200000,
 }}};
 const monitor=new ObservedProcessMonitor({
  sensor,clock:()=>current,schedule:(fn,ms)=>{scheduled=fn;assert.equal(ms,5000);return {unref(){}};},
  unschedule:()=>{stopped=true;},
 });
 monitor.start();
 assert.equal(monitor.snapshot().history.length,1);
 current+=5000;scheduled();
 const data=monitor.snapshot();
 assert.equal(data.latest.cpu_utilization,.0243);
 assert.equal(data.history.length,2);
 assert.equal(data.history[1].heap,.5387);
 current+=150000;
 assert.equal(monitor.snapshot().latest,null,'stale readings are not live');
 monitor.stop();assert.equal(stopped,true);
});
test('public telemetry exposes actual per-sample precision rather than rounded static percent',()=>{
 const organ={updated_at:iso(now),stabilite:.7547,
  homeostasis:{sensor:{source:'node-process',sampled_at:iso(now-50000),
    heap_utilization:.45,cpu_utilization:.05,compute_pressure:0}}};
 const obs={interval_ms:5000,latest:{
  source:'node-process',sampled_at:iso(now),cpu_utilization:.0243,
  heap_utilization:.5387,compute_pressure:0,rss_bytes:30000000,
 },history:[{at:iso(now),sequence:2,cpu:.0243,heap:.5387,pressure:0}]};
 const result=buildBrainTelemetry({runtime_ready:true,kernel_status:{organism:organ}},
  {process_monitor:obs},now);
 assert.equal(result.somatic.cpu_precise,2.43);
 assert.equal(result.somatic.heap_precise,53.87);
 assert.equal(result.somatic.cpu_utilization,2);
 assert.equal(result.process_history.samples[0].cpu,.0243);
 assert.equal(result.metrics.find(m=>m.id==='stabilite').precise_value,75.47);
 assert.equal(result.neuro_vitals.sensor_fresh,true);
});
test('CORTEX 11 only illuminates dated real receipts and has no decorative particle field',()=>{
 const context={
  Date,Math,
  c9Bounds:()=>({x:200,y:180,rx:160,ry:160}),
  c9TissuePoint:()=>({x:0,y:0,z:0}),
  c9Project:(p,yaw,b)=>({x:b.x+p.x*b.rx,y:b.y+p.y*b.ry,z:0}),
  c6State:{positions:new Map(),selected:'workspace'},
  $:()=>null,document:{},};
 const api=runInNewContext(CORTEX11_SCRIPT+
  ';({read:c11ObservedHops,paint:c11PaintVolume,metric:c11Number})',context);
 const data={runtime_ready:true,nodes:[
  {id:'memory',group:'memory',last_observed_at:null},
  {id:'selfaudit',group:'memory',last_observed_at:null},
 ],flows:[{steps:[
  {from:'memory',to:'selfaudit',status:'ok',at:iso(now-1000)},
  {from:'memory',to:'selfaudit',status:'attempted',at:iso(now-1000)},
  {from:'memory',to:'selfaudit',status:'ok',at:iso(now-50000)},
 ]}]};
 assert.equal(api.read(data,now).length,1);
 assert.equal(api.read({...data,flows:[]},now).length,0);
 assert.doesNotMatch(CORTEX11_SCRIPT,/c9BuildVolume|c9Volume\.points|c9Volume\.fibres/);
 assert.doesNotMatch(CORTEX11_SCRIPT,/Math\.random|Math\.sin|requestAnimationFrame/);
 assert.match(CORTEX11_CSS,/#cortex07Canvas\{display:none!important\}/);
 assert.match(CORTEX11_CSS,/pointer-events:auto/);
 assert.match(CORTEX11_SCRIPT,/c6State\.replay\?\.steps/);
 assert.match(CORTEX06_SCRIPT,/typeof c11PaintVolume==='function'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/CORTEX11_SCRIPT|function c11PaintVolume/);
 assert.match(BRAIN_OPERATIONS_HTML,/CORTEX 11/);
});
test('one actual autonomous tick yields a source-stamped module hop, not a timer animation',()=>{
 const code=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(code,/source_verified:sampled/);
 assert.match(code,/path,status:'ok',at:timestamp/);
 assert.match(code,/workspace-competition-completed/);
 assert.match(code,/persisted-organism-and-workspace-cycle/);
 assert.match(code,/await this\.saveSoul\(\);\s+\/\/ Each receipt below/);
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/processObserver\.start\(\)/);
 assert.match(server,/process_monitor:bootstrap.runtimeReady\?processObserver\.snapshot\(\):null/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="c10AutonomyTitle"/);
});
test('one real completed kernel tick produces a typed multi-stage route without extra SQL rows',()=>{
 const at=iso(now);
 const row={
   id:42,kind:'brain-hop',created_at:at,
   context:JSON.stringify({
     origin:'CognitiveKernel.tick',status:'ok',at,
     flow_id:'b2df8cc2-b3de-4d72-9871-1d3d88315b1a',
     path:[
       {from:'kernel',to:'homeostasis',stage:'idleTick-completed'},
       {from:'homeostasis',to:'interoception',stage:'process-sampled'},
       {from:'thalamus',to:'workspace',stage:'workspace-competition-completed'},
     ],
   }),
 };
 const graph=buildBrainFlowGraph({telemetry:{runtime_ready:true},traceRows:[row]},now);
 assert.equal(graph.observed_hop_count,3);
 assert.equal(graph.flows[0].step_count,3);
 assert.equal(graph.flows[0].steps[2].to,'workspace');
 // Reject untrusted or hypothetical path expansion.
 const forged={...row,context:JSON.stringify({
   origin:'browser',status:'ok',at,
   path:[{from:'kernel',to:'homeostasis',stage:'pretend'}],
 })};
 const unsafe=buildBrainFlowGraph({telemetry:{runtime_ready:true},traceRows:[forged]},now);
 assert.equal(unsafe.observed_hop_count,0);
});
