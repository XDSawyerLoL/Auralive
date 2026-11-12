import test from 'node:test';
import assert from 'node:assert/strict';
import {speechMotionCue,updatePerceptualContinuity} from '../src/perceptual_continuity.js';
import {fusePerceptualEvents} from '../src/multimodal_fusion.js';
const t=Date.parse('2026-11-13T20:00:00Z');
const speech={kind:'speech-transcription',measured_at:new Date(t).toISOString(),
 trusted:false,verified_real_world:false,payload:{text:'Pourquoi tu déplaces cette chaise ?'}};
test('movement words are only lexical hypotheses, without retaining text',()=>{
 const cue=speechMotionCue('Pourquoi tu déplaces cette chaise ?');
 assert.equal(cue.motion_mentioned,true);
 assert.equal(cue.motion_questioned,true);
 assert.equal(cue.meaning_verified,false);
 const {event,state}=updatePerceptualContinuity(null,speech);
 assert.equal(event.motion_language_cue.motion_mentioned,true);
 assert.doesNotMatch(JSON.stringify(state),/chaise|Pourquoi/);
 const b=fusePerceptualEvents(fusePerceptualEvents({},event).state,{
 kind:'object-image-displacement-hypothesis',at:new Date(t+4000).toISOString(),
 verified_real_world:false});
 assert.equal(b.event.movement_in_speech_mentioned,true);
 assert.equal(b.event.speech_object_reference_verified,false);
 assert.doesNotMatch(JSON.stringify(b.state),/chaise|Pourquoi/);
});
test('negated motion cannot become evidence of a person moving something',()=>{
 const cue=speechMotionCue('Ne déplace pas la boîte');
 assert.equal(cue.motion_negated,true);
 assert.equal(cue.motion_mentioned,true);
});
