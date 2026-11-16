import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,rmSync,mkdtempSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EmbeddedLanguageRuntime,hasBundledStaticCandidate} from '../src/embedded_language.js';

test('a packaged standalone native engine takes priority over the old dynamic cache',async()=>{
 const prior=process.env.NODE_ENV;process.env.NODE_ENV='test';
 try{
  const selected=[];
  const worker=new EmbeddedLanguageRuntime({discover:()=>({}),
    provisioner:{enabled:true},detectStaticCandidate:()=>true});
  worker.installed=()=>true;
  worker.canProvision=()=>true;
  worker.installAndBoot=async()=>{selected.push('bundled-static');return true;};
  worker.bootWithExecutable=async()=>{selected.push('old-dynamic-cache');return true;};
  assert.equal(await worker.start(),true);
  assert.deepEqual(selected,['bundled-static']);
 }finally{
  if(prior===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=prior;
 }
});

test('explicitly disabling provisioning never forces a new native installation',async()=>{
 const prior=process.env.NODE_ENV;process.env.NODE_ENV='test';
 try{
  const selected=[];
  const worker=new EmbeddedLanguageRuntime({discover:()=>({}),
    provisioner:{enabled:true},detectStaticCandidate:()=>true});
  worker.installed=()=>true;worker.canProvision=()=>true;
  worker.installAndBoot=async()=>{selected.push('bundled-static');return true;};
  worker.bootWithExecutable=async()=>{selected.push('existing-cache');return true;};
  assert.equal(await worker.start({allowProvision:false}),true);
  assert.deepEqual(selected,['existing-cache']);
 }finally{
  if(prior===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=prior;
 }
});

test('candidate requires a package-native binary and a well-formed pinned digest',()=>{
 const folder=mkdtempSync(path.join(os.tmpdir(),'aura-static-priority-'));
 try{
  assert.equal(hasBundledStaticCandidate(folder),false);
  const dir=path.join(folder,'native','linux-x64');
  mkdirSync(dir,{recursive:true});
  writeFileSync(path.join(dir,'llama-server'),'not a release');
  writeFileSync(path.join(dir,'llama-server.sha256'),'invalid');
  assert.equal(hasBundledStaticCandidate(folder),false);
  writeFileSync(path.join(dir,'llama-server.sha256'),'a'.repeat(64));
  assert.equal(hasBundledStaticCandidate(folder),true);
 }finally{rmSync(folder,{recursive:true,force:true});}
});
