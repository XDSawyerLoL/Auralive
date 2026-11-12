import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MillisecondReflex} from '../src/millisecond_reflex.js';
import {ObservedProcessMonitor} from '../src/process_observer.js';
import {CORTEX12_SCRIPT} from '../src/cortex12_realtime.js';
import {CORTEX11_SCRIPT} from '../src/cortex11_evidence_render.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';

test('micro-reflex requests 1ms checks but truthfully reports measured frequency and timer lag',()=>{
 let t=1000,epoch=1730000000000,callback=null,interval=null;
 const micro=new MillisecondReflex({
  intervalMs:1,clock:()=>t,epoch:()=>epoch,
  schedule:(fn,ms)=>{callback=fn;interval=ms;return {unref(){}};},
  unschedule:()=>{callback=null;},inspect:()=>({stimulusSeq:0}),onStimulus:()=>{throw Error('idle should not dispatch');},
 });
 micro.start();
 assert.equal(interval,1);
 for(let i=0;i<805;i++){t+=1.25;epoch+=1;const fn=callback;fn();}
 const s=micro.snapshot();
 assert.equal(s.requested_interval_ms,1);
 assert.ok(s.effective_hz>790&&s.effective_hz<820);
 assert.ok(s.lag_ms>=.2&&s.lag_ms<.4);
 assert.equal(s.interrupted_cycles,0);
 assert.equal(s.kind,'lightweight-event-watch-not-full-cognition');
 micro.stop();assert.equal(s.running,true);assert.equal(micro.snapshot().running,false);
});
test('new external stimulus triggers one real callback, with resource gating',async()=>{
 let t=100,epoch=20000,callback,seq=0,pressure=.9,attempts=0;
 const micro=new MillisecondReflex({
  intervalMs:1,clock:()=>t,epoch:()=>epoch,
  schedule:(fn)=>{callback=fn;return {unref(){}};},
  inspect:()=>({stimulusSeq:seq,optionalAllowed:true,cpuPressure:pressure}),
  onStimulus:async()=>{attempts++;return {ok:true,skipped:false};},
 });
 micro.start();
 seq=1;t+=1;epoch++;
 callback();assert.equal(attempts,0);
 assert.equal(micro.snapshot().last_decision,'resource-gate');
 pressure=.1;t+=1;epoch++;
 callback();
 for(let i=0;i<7;i++)await Promise.resolve();
 assert.equal(attempts,1);
 assert.equal(micro.snapshot().interrupted_cycles,1);
 for(let i=0;i<30;i++){t+=1;epoch++;callback();}
 assert.equal(attempts,1,'no repeated or fabricated interrupts in idle');
 micro.stop();
});
test('true Node CPU/RAM sampling can run faster without inventing values',()=>{
 let t=1730000000000,callback;
 const monitor=new ObservedProcessMonitor({
  intervalMs:200,clock:()=>t,
  schedule:(fn,ms)=>{assert.equal(ms,200);callback=fn;return {unref(){}};},
  sensor:{sample:()=>({
   source:'node-process',sampled_at:new Date(t).toISOString(),
   cpu_utilization:.0246,heap_utilization:.5327,compute_pressure:0,rss_bytes:1000000,
  })},
 });
 monitor.start();
 for(let i=0;i<10;i++){t+=200;callback();}
 const s=monitor.snapshot();assert.equal(s.interval_ms,200);
 assert.equal(s.latest.cpu_utilization,.0246);
 assert.equal(s.history.length,11);
 monitor.stop();
});
test('direct stream is read-only, bounded and does not query MySQL for each observed frame',()=>{
 const code=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const start=code.indexOf("app.get('/api/brain/live'");
 const end=code.indexOf("app.get('/api/brain/graph'",start);
 assert.ok(start>0&&end>start);
 const route=code.slice(start,end);
 assert.match(route,/liveBrainClients>=24/);
 assert.match(route,/setInterval\(emit,250\)/);
 assert.doesNotMatch(route,/SELECT |readBrainTraceRows|kernel\.tick\(/);
 assert.match(route,/micro:micro\?/);
 assert.match(route,/cycle\.background_cycles/);
 assert.match(CORTEX12_SCRIPT,/new EventSource\('\/api\/brain\/live'\)/);
 assert.match(CORTEX12_SCRIPT,/void poll\(\)/);
 assert.doesNotMatch(CORTEX12_SCRIPT,/Math\.sin|Math\.random/);
 assert.match(CORTEX11_SCRIPT,/querySelectorAll\('\.c11-sparkline,\.c11-last-sample'\)/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="c12RealtimeTitle"/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/new EventSource\('\/api\/brain\/live'\)/);
});
test('1ms reflex activity does not masquerade as a full cognitive tick',()=>{
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const config=readFileSync(new URL('../src/config.js',import.meta.url),'utf8');
 assert.match(kernel,/trigger:'reflex',force:false/);
 assert.match(kernel,/this\.microReflex\.start\(\)/);
 assert.match(kernel,/this\.microReflex\.stop\(\)/);
 assert.match(config,/AURA_MICRO_REFLEX_INTERVAL_MS', 1, 1, 100/);
 assert.match(config,/AURA_COGNITIVE_TICK_SECONDS', 5, 5, 86400/);
});
