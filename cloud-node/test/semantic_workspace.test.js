import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceInput,competeInWorkspace} from '../src/global_workspace.js';
const ms=Date.parse('2026-11-12T22:00:00Z');
const visual={kind:'visual-classification',trusted:false,verified_real_world:false,
  measured_at:new Date(ms-2000).toISOString(),
  payload:{label:'tabby cat',confidence:.93}};
test('model visual hypothesis can compete for attention without exposing guessed object',()=>{
 const candidates=workspaceInput({nowMs:ms,sensorySignals:[visual]});
 const item=candidates.find(c=>c.label==='browser-visual-hypothesis');
 assert.ok(item);assert.equal(item.confidence,.38);
 assert.doesNotMatch(JSON.stringify(candidates),/tabby cat/i);
 const state=competeInWorkspace(candidates,{capacity:5,nowMs:ms});
 assert.equal(state.candidates_considered>0,true);
 assert.equal(state.selected.some(x=>x.label==='browser-visual-hypothesis'),true);
});
test('untrusted speech is an attention candidate not a direct user request',()=>{
 const inputs=workspaceInput({nowMs:ms,sensorySignals:[{
  kind:'speech-transcription',trusted:false,verified_real_world:false,
  measured_at:new Date(ms).toISOString(),payload:{text:'bonjour'},
 }]});
 assert.ok(inputs.some(x=>x.label==='browser-speech-hypothesis'));
 assert.equal(inputs.some(x=>x.label==='user-request'),false);
 assert.doesNotMatch(JSON.stringify(inputs),/bonjour/);
});
test('stale and falsely verified browser events do not enter workspace',()=>{
 const inputs=workspaceInput({nowMs:ms,sensorySignals:[
  {...visual,measured_at:new Date(ms-121000).toISOString()},
  {...visual,kind:'speech-transcription',trusted:true},
 ]});
 assert.equal(inputs.some(x=>x.label.startsWith('browser-')),false);
});
