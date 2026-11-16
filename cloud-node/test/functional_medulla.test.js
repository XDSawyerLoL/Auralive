import test from 'node:test';
import assert from 'node:assert/strict';
import {medullaDecision,FunctionalMedulla} from '../src/functional_medulla.js';
const sample=()=>({installed:true,can_provision:true,ready:false,
  probe_verified:false,memory_preflight:{safe_to_start:true}});
test('medulla permits a bounded recovery when local inference is unavailable',()=>{
 const d=medullaDecision({language:sample(),nowMs:500000,lastAttemptAt:0});
 assert.equal(d.action,'recover-local-language');
 assert.equal(d.no_remote_provider_calls,true);
});
test('verified speech inhibits recovery and preserves runtime',()=>{
 const d=medullaDecision({language:{...sample(),ready:true,probe_verified:true},nowMs:500000});
 assert.equal(d.action,'observe');
});
test('safety gates block memory pressure, booting, repeated failure and cooldown',()=>{
 for(const x of [
  {language:{...sample(),memory_preflight:{safe_to_start:false}}},
  {language:{...sample(),status:'starting'}},
  {language:sample(),resources:{compute_pressure:.92}},
  {language:sample(),attemptsInWindow:3},
  {language:{...sample(),cooldown_until:600000}},
 ]){
  const d=medullaDecision({...x,nowMs:500000,lastAttemptAt:0});
  assert.equal(d.action,'observe',d.reason);
 }
});
test('medulla never overlaps boots; opens a circuit breaker and resets after window',async()=>{
 let now=500000,starts=0,unlock;
 const engine={status:sample,booting:null,
   async start(){starts++;await new Promise(resolve=>{unlock=resolve});return false}};
 const m=new FunctionalMedulla({engine,now:()=>now,windowMs:300000,
   cooldownMs:10000,maxAttempts:2});
 await m.tick();
 await m.tick();
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(starts,1);
 assert.equal(m.snapshot().in_flight,true);
 unlock();await m.pending;
 now+=11000;await m.tick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(starts,2);
 unlock();await m.pending;
 now+=11000;await m.tick();
 assert.equal(m.snapshot().reason,'circuit-breaker-open');
 assert.equal(starts,2);
 now+=300001;await m.tick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(starts,3);
 unlock();await m.pending;
});
test('medulla will not contact external models even when local only disabled',async()=>{
 let starts=0;
 const m=new FunctionalMedulla({engine:{status:sample,start:async()=>{starts++;return true}},
  now:()=>500000,localOnly:()=>false});
 await m.tick();assert.equal(starts,0);
 assert.equal(m.snapshot().reason,'local-supervision-disabled');
});
