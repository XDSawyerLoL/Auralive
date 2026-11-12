import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSemanticPerception} from '../src/semantic_perception.js';
import {updatePerceptualContinuity} from '../src/perceptual_continuity.js';
import {workspaceInput,competeInWorkspace} from '../src/global_workspace.js';
const time=Date.parse('2026-11-13T18:00:00Z');
const base={kind:'visual-objects',source:'browser-ondevice-transformers',model:'Xenova/yolos-tiny',
  measured_at:new Date(time).toISOString(),payload:{objects:[{
    label:'chair',confidence:.93,box:{xmin:.1,ymin:.12,xmax:.5,ymax:.7}}]}};
test('object detection retains normalized bounded box and no raw pixels',()=>{
 const receipt=validateSemanticPerception(base,time);
 assert.equal(receipt.kind,'visual-objects');
 assert.equal(receipt.payload.objects[0].box.xmin,.1);
 assert.equal(receipt.verified_real_world,false);
 assert.equal(receipt.no_media_uploaded,true);
});
test('object model output cannot smuggle media or invalid regions into nucleus',()=>{
 for(const value of [
  {...base,payload:{objects:[{...base.payload.objects[0],raw_image:'base64'}]}},
  {...base,payload:{objects:[{...base.payload.objects[0],box:{xmin:-1,ymin:0,xmax:.5,ymax:1}}]}},
  {...base,payload:{objects:[{...base.payload.objects[0],box:{xmin:.9,ymin:0,xmax:.1,ymax:1}}]}},
  {...base,payload:{objects:Array(9).fill(base.payload.objects[0])}},
  {...base,payload:{objects:[{...base.payload.objects[0],label:'<script>'}]}},
 ])assert.equal(validateSemanticPerception(value,time),null);
});
test('two detected objects of same class permit attention only as hypothesis',()=>{
 const a=validateSemanticPerception(base,time);
 const b=validateSemanticPerception({...base,measured_at:new Date(time+20000).toISOString()},time+20000);
 const first=updatePerceptualContinuity(null,a);
 assert.equal(first.event,null);
 const second=updatePerceptualContinuity(first.state,b);
 assert.equal(second.event.kind,'object-hypothesis-stable');
 const candidates=workspaceInput({nowMs:time+20000,sensorySignals:[{
   kind:'visual-objects',measured_at:second.event.at,trusted:false,verified_real_world:false,
 }]});
 assert.equal(candidates.some(x=>x.label==='browser-object-hypothesis'),true);
 assert.equal(candidates.some(x=>JSON.stringify(x).includes('chair')),false);
 const receipt=competeInWorkspace(candidates,{nowMs:time+20000,capacity:5});
 assert.equal(receipt.selected.some(x=>x.label==='browser-object-hypothesis'),true);
});

test('same class in different image location is not silently tracked as one object',()=>{
 const first=validateSemanticPerception(base,time);
 const distant=validateSemanticPerception({...base,
  measured_at:new Date(time+20000).toISOString(),
  payload:{objects:[{label:'chair',confidence:.93,
   box:{xmin:.6,ymin:.1,xmax:.95,ymax:.7}}]}},time+20000);
 const a=updatePerceptualContinuity(null,first);
 const b=updatePerceptualContinuity(a.state,distant);
 assert.equal(b.event,null);
 assert.equal(b.state.objects.count,1);
});
