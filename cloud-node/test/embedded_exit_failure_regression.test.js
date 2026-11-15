import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {EmbeddedLanguageRuntime} from '../src/embedded_language.js';

test('health timeout remains the diagnosed root cause after a normal native exit',async()=>{
 const child=new EventEmitter();
 child.stdout=new EventEmitter();
 child.stderr=new EventEmitter();
 child.exitCode=null;child.signalCode=null;
 child.kill=()=>{
  child.exitCode=0;child.emit('exit',0,null);
  return true;
 };
 const runtime=new EmbeddedLanguageRuntime({
  discover:()=>({executable:'/aura-language-runtime/llama-server',
   gguf:'/aura-language-runtime/Qwen3-0.6B-Q4_K_M.gguf',
   binFound:true,modelFound:true,executableAllowed:true,installed:true}),
  spawnProcess:()=>child,
  request:async()=>{throw Error('health unreachable');},
  allocatePort:async()=>31337,
  delay:async()=>{},
  bootTimeoutMs:5,
  provisioner:null,
 });
 const ok=await runtime.boot(false,true);
 assert.equal(ok,false);
 assert.equal(runtime.lastProcessExit.code,0);
 assert.equal(runtime.status().failure_code,'embedded-startup-timeout');
 assert.equal(runtime.status().failure_stage,'health-timeout');
 assert.equal(runtime.bootAttempts.at(-1).outcome,'health-timeout');
 assert.equal(runtime.bootAttempts.at(-1).failure_code,'embedded-startup-timeout');
});
