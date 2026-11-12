import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSemanticPerception as check} from '../src/semantic_perception.js';
const now=Date.parse('2026-11-12T22:00:00Z');
const base={kind:'visual-classification',source:'browser-ondevice-transformers',
  model:'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k',
  measured_at:new Date(now).toISOString(),payload:{label:'tabby cat',confidence:.81}};
test('on-device vision classification is accepted as an untrusted model prediction',()=>{
 const x=check(base,now);assert.equal(x.payload.label,'tabby cat');
 assert.equal(x.trusted,false);assert.equal(x.verified_real_world,false);
 assert.equal(x.no_media_uploaded,true);
});
test('final local speech is bounded, unverified, private transport only',()=>{
 const x=check({...base,kind:'speech-transcription',
   source:'browser-ondevice-speechrecognition',model:'browser-fr-FR',
   payload:{text:'Bonjour AURA',language:'fr-FR',final:true}},now);
 assert.equal(x.payload.text,'Bonjour AURA');assert.equal(x.trusted,false);
});
test('reject raw imagery, audio, stale events, long text and remote sources',()=>{
 for(const x of [
  {...base,frame:'data:image/png;base64,ABC'},
  {...base,payload:{label:'cat',confidence:.9,raw_pixels:'secret'}},
  {...base,payload:{label:'cat',confidence:2}},
  {...base,payload:{label:'<script>',confidence:.2}},
  {...base,measured_at:'2026-10-12T22:00:00Z'},
  {...base,kind:'speech-transcription',source:'browser-ondevice-transformers'},
  {...base,kind:'speech-transcription',source:'browser-ondevice-speechrecognition',
     payload:{text:'hi'.repeat(250),language:'fr-FR',final:true}},
 ])assert.equal(check(x,now),null);
});
