import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FunctionalMedulla} from '../src/functional_medulla.js';
const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
test('the native-acquired deployment never starts the borrowed GGUF',()=>{
 assert.match(server,/if\(process\.env\.AURA_NATIVE_FRENCH_MODE==='native-acquired'\)\s*return Promise\.resolve\(false\)/u);
 assert.match(server,/localOnly:\(\)=>Boolean\(config\.localLanguageOnly\)&&process\.env\.AURA_NATIVE_FRENCH_MODE!=='native-acquired'/u);
 assert.match(server,/process\.env\.AURA_NATIVE_FRENCH_MODE!=='native-acquired' &&\s*process\.env\.CI/u);
 assert.match(server,/native_acquired_ready:ready/u);
 assert.match(server,/pretrained_language_model_used:false/u);
 assert.match(server,/open_domain_ready:false/u);
});
test('runtime medulla is passive in learned-speech-only mode',async()=>{
 let starts=0;
 const engine={status:()=>({ready:false,installed:true,can_provision:true,
   probe_verified:false}),start:async()=>{starts++;return true;}};
 const m=new FunctionalMedulla({engine,now:()=>999999,
   localOnly:()=>false,warmup:()=>true});
 await m.tick();await m.tick();
 assert.equal(starts,0);
 assert.equal(m.snapshot().reason,'local-supervision-disabled');
 assert.equal(m.snapshot().no_remote_provider_calls,true);
});
test('native response provenance is not falsely labelled model-generated',()=>{
 assert.match(kernel,/String\(this\.expression\.lastMode\|\|''\)\.startsWith\('native-'\)/u);
 assert.match(kernel,/speech_provenance:/u);
 assert.match(kernel,/pretrained_language_generation_used:/u);
 assert.match(server,/response\?\.response_kind==='native-kernel'/u);
 assert.match(server,/nativeAcquiredMode\?'native-acquired-uncovered-intent'/u);
});
