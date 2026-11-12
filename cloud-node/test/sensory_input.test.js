import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSensoryReading as check} from '../src/sensory_input.js';
const now=Date.parse('2026-11-12T22:00:00.000Z');
const vision={kind:'visual-luminance-motion',source:'browser-opt-in-local-measurement',
  measured_at:new Date(now).toISOString(),features:{luminance:.45,motion:.08}};
test('camera features are bounded and explicitly client reported',()=>{
  const got=check(vision,now);
  assert.equal(got.features.luminance,.45);
  assert.equal(got.independently_verified,false);
  assert.equal(got.identity_or_object_recognition,false);
});
test('micro level only, without words or audio transfer',()=>{
  const got=check({...vision,kind:'audio-level',features:{level:.28}},now);
  assert.deepEqual(got.features,{level:.28});
  assert.equal(got.speech_recognition,false);
});
test('block raw media, unknown fields, timestamp replay and feature spoofing',()=>{
  for(const x of [
    {...vision,frame:'base64-raw'}, {...vision,features:{...vision.features,text:'secret'}},
    {...vision,features:{motion:2,luminance:.2}},
    {...vision,source:'model-hallucination'},
    {...vision,measured_at:'2026-11-11T22:00:00.000Z'},
    {...vision,features:{luminance:NaN,motion:0}},
  ])assert.equal(check(x,now),null);
});
