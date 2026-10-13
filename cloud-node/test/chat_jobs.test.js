import test from 'node:test';
import assert from 'node:assert/strict';
import {ChatJobs} from '../src/chat_jobs.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('chat jobs acknowledge instantly and return generated answers only to owner',async()=>{
  let finish;
  const jobs=new ChatJobs();
  const first=jobs.submit({
    sessionId:'session-one',
    work:()=>new Promise(resolve=>{finish=resolve;}),
  });
  assert.ok(first.job_id);
  assert.ok(['running','queued'].includes(first.status));
  assert.equal(jobs.get(first.job_id,'wrong-session'),null);
  assert.ok(['running','queued'].includes(jobs.get(first.job_id,'session-one').status));
  finish({answer:'Bonjour du vrai modèle.',voice_profile:'mairaiy'});
  await flush();
  assert.deepEqual(jobs.get(first.job_id,'session-one').result,{
    answer:'Bonjour du vrai modèle.',voice_profile:'mairaiy',
  });
  assert.equal(jobs.get(first.job_id,'wrong-session'),null);
  assert.equal(jobs.get(first.job_id,''),null);
});
test('CPU-only conversations are serialized across public sessions',async()=>{
  const jobs=new ChatJobs({maxPending:3});
  let finish;const events=[];
  const a=jobs.submit({sessionId:'alpha',work:async()=>{events.push('alpha');await new Promise(ok=>{finish=ok;});return {answer:'A'};}});
  const b=jobs.submit({sessionId:'beta',work:async()=>{events.push('beta');return {answer:'B'};}});
  assert.deepEqual(events,['alpha']);
  assert.equal(jobs.get(b.job_id,'beta').status,'queued');
  finish();
  await flush();await flush();
  assert.deepEqual(events,['alpha','beta']);
  assert.equal(jobs.get(a.job_id,'alpha').status,'done');
  assert.equal(jobs.get(b.job_id,'beta').status,'done');
});
test('pending owner cannot submit duplicates and overall queue has a hard cap',async()=>{
  const jobs=new ChatJobs({maxPending:2});
  let finish;
  jobs.submit({sessionId:'s1',work:()=>new Promise(resolve=>{finish=resolve;})});
  assert.throws(()=>jobs.submit({sessionId:'s1',work:async()=>{}}),
    e=>e.code==='CHAT_JOB_PENDING');
  jobs.submit({sessionId:'s2',work:async()=>({answer:'b'})});
  assert.throws(()=>jobs.submit({sessionId:'s3',work:async()=>({answer:'c'})}),
    e=>e.code==='CHAT_JOBS_BUSY');
  finish({answer:'a'});await flush();await flush();
  assert.equal(jobs.queue.length,0);
});
test('job errors are sanitized, and completed jobs expire from memory',async()=>{
  let now=0;const jobs=new ChatJobs({now:()=>now,retentionMs:1000});
  const j=jobs.submit({sessionId:'client',work:async()=>{
    throw Error('PRIVATE SQL PASSWORD /home/customer/capabilities');
  }});
  await flush();
  const result=jobs.get(j.job_id,'client');
  assert.equal(result.status,'failed');
  assert.equal(result.error_code,'chat-processing-failed');
  assert.doesNotMatch(JSON.stringify(result),/PASSWORD|private|customer/i);
  now=1001;
  assert.equal(jobs.get(j.job_id,'client'),null);
});
