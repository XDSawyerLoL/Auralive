import test from 'node:test';
import assert from 'node:assert/strict';
import {inferImageSpaceMovement} from '../src/event_semantics.js';
import {fusePerceptualEvents} from '../src/multimodal_fusion.js';
const at='2026-11-13T20:00:00.000Z';
const later='2026-11-13T20:00:12.000Z';
const box={xmin:.12,ymin:.22,xmax:.53,ymax:.72};
const item=(label,time,b)=>({label,at:time,box:b,trusted:false});
test('image-space displacement is a hypothesis without attribution to a person',()=>{
 const observed=inferImageSpaceMovement(item('cup',at,box),
    item('cup',later,{xmin:.18,ymin:.22,xmax:.59,ymax:.72}));
 assert.equal(observed.kind,'object-image-displacement-hypothesis');
 assert.equal(observed.direction,'right');
 assert.equal(observed.person_causation_known,false);
 assert.equal(observed.camera_motion_excluded,false);
 const a=fusePerceptualEvents({},observed);
 const b=fusePerceptualEvents(a.state,{
    kind:'speech-detected',at:'2026-11-13T20:00:16.000Z',
    verified_real_world:false});
 assert.equal(b.event.image_displacement_hypothesis,true);
 assert.equal(b.event.person_moved_object_verified,false);
});
test('stationary, changed identity or remote object blocks movement inference',()=>{
 assert.equal(inferImageSpaceMovement(item('cup',at,box),item('cup',later,box)),null);
 assert.equal(inferImageSpaceMovement(item('cup',at,box),
   item('book',later,{xmin:.18,ymin:.22,xmax:.59,ymax:.72})),null);
 assert.equal(inferImageSpaceMovement(item('cup',at,box),
   item('cup',later,{xmin:.65,ymin:.22,xmax:.95,ymax:.72})),null);
});
test('stale, forged and out-of-order frames never imply movement',()=>{
 assert.equal(inferImageSpaceMovement(item('cup',later,box),
   item('cup',at,{xmin:.18,ymin:.22,xmax:.59,ymax:.72})),null);
 assert.equal(inferImageSpaceMovement(item('cup',at,box),
   {...item('cup',later,{xmin:.18,ymin:.22,xmax:.59,ymax:.72}),trusted:true}),null);
});
