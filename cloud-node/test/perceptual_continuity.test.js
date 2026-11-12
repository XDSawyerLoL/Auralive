import test from 'node:test';
import assert from 'node:assert/strict';
import {updatePerceptualContinuity as step} from '../src/perceptual_continuity.js';
const at=Date.parse('2026-11-13T09:00:00Z');
const frame=(label,ms,confidence=.88)=>({
 kind:'visual-classification',measured_at:new Date(ms).toISOString(),
 payload:{label,confidence},trusted:false,verified_real_world:false});
test('single image guess is not a stable observation; second agree creates limited evidence',()=>{
 const a=step(null,frame('book',at));
 assert.equal(a.event,null);
 const b=step(a.state,frame('book',at+20000));
 assert.equal(b.event.kind,'visual-hypothesis-changed');
 assert.equal(b.event.agreement_count,2);
 assert.equal(b.event.verified_real_world,false);
 const c=step(b.state,frame('book',at+40000));
 assert.equal(c.event,null);
});
test('a change is only reported after independent frames agree on another category',()=>{
 const a=step(null,frame('book',at));
 const b=step(a.state,frame('book',at+20000));
 const uncertain=step(b.state,frame('person',at+40000));
 assert.equal(uncertain.event,null);
 const changed=step(uncertain.state,frame('person',at+60000));
 assert.equal(changed.event.kind,'visual-hypothesis-changed');
 assert.equal(changed.event.model_label,'person');
});
test('a stale or low-confidence vision guess does not authorize an event',()=>{
 const a=step(null,frame('book',at));
 const stale=step(a.state,frame('book',at-1));
 assert.equal(stale.accepted,false);
 const weak=step(a.state,frame('book',at+20000,.2));
 assert.equal(weak.accepted,false);
 const late=step(a.state,frame('book',at+120000));
 assert.equal(late.event,null);
});
test('transcript text never enters the temporal event or continuity state',()=>{
 const text='ceci est un secret personnel et une adresse';
 const a=step(null,{kind:'speech-transcription',measured_at:new Date(at).toISOString(),
  payload:{text},trusted:false,verified_real_world:false});
 assert.equal(a.event.kind,'speech-detected');
 assert.doesNotMatch(JSON.stringify(a.state),/secret|adresse/);
 assert.equal(step(a.state,{kind:'speech-transcription',measured_at:new Date(at).toISOString(),
  payload:{text},trusted:false,verified_real_world:false}).accepted,false);
});
test('untrusted status is mandatory even for repeated visual predictions',()=>{
 assert.equal(step(null,{...frame('book',at),trusted:true}).accepted,false);
});
