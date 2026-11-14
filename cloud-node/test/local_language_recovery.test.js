import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {localDialogueReadiness} from '../src/local_dialogue_readiness.js';
import {locateEmbeddedRuntime} from '../src/embedded_language.js';
import {compactLowMemoryFrenchPrompt,LOW_MEMORY_FRENCH_SYSTEM}
 from '../src/french_language.js';

test('readiness differentiates verified inference, model download and native failure',()=>{
 const ready=localDialogueReadiness({localOnly:true,runtime:{
  ready:true,probe_verified:true,status:'verified-responsive',
  model_found:true,active_model_profile:'Qwen3-0.6B-Q8_0.gguf'}});
 assert.equal(ready.ready,true);
 assert.equal(ready.model_verified,true);
 assert.equal(ready.phase,'ready-gguf');
 assert.equal(ready.model_profile,'Qwen3-0.6B-Q8_0.gguf');
 const fetching=localDialogueReadiness({localOnly:true,
  booting:true,runtime:{ready:false,status:'gguf-missing',
   provisioning:{stage:'downloading-open-model'}}});
 assert.equal(fetching.phase,'downloading-model');
 assert.equal(fetching.retryable,true);
 assert.equal(fetching.ready,false);
 const stopped=localDialogueReadiness({localOnly:true,
  runtime:{status:'startup-failed',failure_code:'embedded-insufficient-cgroup-headroom'}});
 assert.equal(stopped.phase,'blocked');
 assert.equal(stopped.reason,'embedded-insufficient-cgroup-headroom');
 assert.equal(stopped.retryable,false);
 const notVerified=localDialogueReadiness({localOnly:true,
  runtime:{ready:true,probe_verified:false,installed:true,status:'model-loaded-unverified'}});
 assert.equal(notVerified.ready,false);
 assert.equal(notVerified.phase,'pending-start');
});
test('preflight never exposes a home directory or user content',()=>{
 const bad=localDialogueReadiness({localOnly:true,runtime:{
  ready:false,status:'gguf-missing',provisioning:{stage:'downloading-open-model'},
  path:'/home/sansa/private/file.gguf',last_error:'private prompt'
 },booting:true});
 const json=JSON.stringify(bad);
 assert.doesNotMatch(json,/home\/sansa|private prompt/);
 assert.equal(bad.retryable,true);
 const mixed=localDialogueReadiness({localOnly:false,runtime:{}});
 assert.equal(mixed.phase,'mixed-mode');
 assert.equal(mixed.ready,true);
});
test('existing pinned Q8 remains discoverable in local-only mode without explicit quantization',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-existing-q8-'));
 try{
  const modelDir=path.join(root,'.aura-language-runtime');
  fs.mkdirSync(modelDir,{recursive:true});
  fs.writeFileSync(path.join(modelDir,'llama-server'),'ok',{mode:0o755});
  fs.writeFileSync(path.join(modelDir,'Qwen3-0.6B-Q8_0.gguf'),'gguf');
  fs.writeFileSync(path.join(modelDir,'arbitrary-unknown-model.gguf'),'arbitrary');
  const found=locateEmbeddedRuntime({root,home:'',quantization:''});
  assert.equal(found.installed,true);
  assert.ok(found.gguf.endsWith('Qwen3-0.6B-Q8_0.gguf'));
  const explicit=locateEmbeddedRuntime({root,home:'',quantization:'q4'});
  assert.equal(explicit.modelFound,false);
  assert.equal(explicit.installed,false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('low-memory French prompt is short, preserves the actual user message and no human memories',()=>{
 const prompt=compactLowMemoryFrenchPrompt({
  act:'respond',user_text:'Salut, comment vas-tu ?',
  goal:'répondre naturellement en français',
  facts:['AURA ne peut pas prétendre être humaine.'],
  immediate_dialogue_context:[{role:'user',content:'Bonjour.'}]
 });
 assert.ok(prompt.length<1100);
 assert.match(prompt,/Salut, comment vas-tu/);
 assert.match(prompt,/AURA ne peut pas prétendre être humaine/);
 assert.match(prompt,/\/no_think/);
 assert.match(LOW_MEMORY_FRENCH_SYSTEM,/français naturel/);
});

test('Hostinger restart rediscovers a GGUF from provisioner temp-cache fallback',()=>{
 const sandbox=fs.mkdtempSync(path.join(os.tmpdir(),'aura-temp-restart-'));
 try{
  const temp=path.join(sandbox,'tmp');
  const root=path.join(sandbox,'app');
  const cache=path.join(temp,'aura-language-runtime');
  fs.mkdirSync(cache,{recursive:true});
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(cache,'llama-server'),'binary',{mode:0o755});
  fs.writeFileSync(path.join(cache,'Qwen3-0.6B-Q4_K_M.gguf'),'gguf');
  const recovered=locateEmbeddedRuntime({root,home:'',temp,quantization:'q4'});
  assert.equal(recovered.binFound,true);
  assert.equal(recovered.modelFound,true);
  assert.equal(recovered.installed,true);
  assert.equal(recovered.gguf,path.join(cache,'Qwen3-0.6B-Q4_K_M.gguf'));
 }finally{fs.rmSync(sandbox,{recursive:true,force:true});}
});
