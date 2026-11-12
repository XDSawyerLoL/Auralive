import test from 'node:test';
import assert from 'node:assert/strict';
import {fusePerceptualEvents as fuse,decidePerceptualIntervention as decide} from '../src/multimodal_fusion.js';
const t='2026-11-13T10:00:00.000Z';
const speech={kind:'speech-detected',at:t,verified_real_world:false};
const vision={kind:'object-hypothesis-stable',at:'2026-11-13T10:00:08.000Z',verified_real_world:false};
test('real close-in-time local predictions yield only a temporal coincidence',()=>{
 const a=fuse({},speech),b=fuse(a.state,vision);
 assert.equal(b.event.kind,'audio-visual-temporal-coincidence');
 assert.equal(b.event.confidence_claim,false);
 assert.equal(decide(b.event).act,'observe');
 assert.equal(decide(b.event).outbound_action,false);
 assert.doesNotMatch(JSON.stringify(b),/transcript|person name/);
});
test('out-of-window and repeated readings do not create fake episodes',()=>{
 const a=fuse({},speech);
 assert.equal(fuse(a.state,{...vision,at:'2026-11-13T10:01:00.000Z'}).event,null);
 const b=fuse(a.state,vision);
 assert.equal(fuse(b.state,vision).event,null);
});
test('under load or user conversation, not even an attention interruption is allowed',()=>{
 const event=fuse(fuse({},speech).state,vision).event;
 assert.equal(decide(event,{resource_pressure:.85}).act,'defer');
 assert.equal(decide(event,{conversation_busy:true}).act,'defer');
 assert.equal(decide({...event,verified_real_world:true}).act,'silence');
});
