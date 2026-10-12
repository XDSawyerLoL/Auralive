import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classifyEmbeddedFailure,llamaLoaderEnv,locateEmbeddedRuntime,
  EmbeddedLanguageRuntime,repairLlamaLibraryAliases} from '../src/embedded_language.js';

test('llama dynamic linker failure and Hostinger EACCES are distinct',()=>{
  assert.equal(classifyEmbeddedFailure('libllama-common.so.0: cannot open shared object file').code,
    'embedded-shared-library-unresolved');
  assert.equal(classifyEmbeddedFailure('spawn /tmp/llama-server EACCES').code,
    'host-disallows-native-execution');
});
test('LD_LIBRARY_PATH contains the binary and adjacent library directories',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-llama-'));
  try{
    fs.mkdirSync(path.join(root,'lib'));
    const env=llamaLoaderEnv(path.join(root,'llama-server'),{LD_LIBRARY_PATH:'/sys/lib'});
    assert.ok(env.LD_LIBRARY_PATH.split(':').includes(root));
    assert.ok(env.LD_LIBRARY_PATH.split(':').includes(path.join(root,'lib')));
    assert.ok(env.LD_LIBRARY_PATH.endsWith('/sys/lib'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('nested Hostinger runtime folder detects the binary and GGUF',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-llama-'));
  try{
    const dir=path.join(root,'.aura-language-runtime','llama-b11425','llama-b11425');
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'llama-server'),'dummy',{mode:0o755});
    fs.writeFileSync(path.join(dir,'model.gguf'),'dummy');
    const result=locateEmbeddedRuntime({root,home:''});
    assert.equal(result.installed,true);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('missing model refuses to launch and never claims readiness',async()=>{
  const engine=new EmbeddedLanguageRuntime({
    discover:()=>({installed:false,binFound:true,modelFound:false,executableAllowed:true}),
    spawnProcess:()=>{throw Error('should not spawn');},
  });
  assert.equal(await engine.start(),false);
  assert.equal(engine.status().status,'gguf-missing');
  assert.equal(engine.status().ready,false);
});

test('binary without execution rights produces an explicit Hostinger failure',()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({installed:false,binFound:true,modelFound:true,executableAllowed:false}),
  });
  const status=runtime.status();
  assert.equal(status.failure_code,'host-disallows-native-execution');
  assert.equal(status.status,'permission-denied');
});

test('startup cannot claim successful language generation from health alone', async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({installed:true,binFound:true,modelFound:true,executableAllowed:true}),
  });
  runtime.ready=true;
  runtime.lastSuccessAt='';
  assert.equal(runtime.status().status,'model-loaded-unverified');
  runtime.lastSuccessAt='2026-10-12T12:00:00Z';
  assert.equal(runtime.status().status,'verified-responsive');
});
test('blocked network port allocation is a recoverable runtime failure',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    allocatePort:async()=>{throw new Error('EACCES loopback');},
  });
  assert.equal(await runtime.start(),false);
  assert.equal(runtime.status().failure_code,'host-disallows-native-execution');
});

test('loader finds .so in sibling nested release subdirectory',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-llama-libs-'));
  try{
    fs.mkdirSync(path.join(root,'bin'),{recursive:true});
    fs.mkdirSync(path.join(root,'support','lib'),{recursive:true});
    fs.writeFileSync(path.join(root,'support','lib','libllama-common.so.0'),'');
    const env=llamaLoaderEnv(path.join(root,'bin','llama-server'),{LD_LIBRARY_PATH:''});
    assert.ok(env.LD_LIBRARY_PATH.split(path.delimiter).includes(path.join(root,'support','lib')));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('restores executable bit only on a managed AURA runtime binary',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-llama-exec-'));
  try{
    const dir=path.join(root,'.aura-language-runtime','llama');
    fs.mkdirSync(dir,{recursive:true});
    const exe=path.join(dir,'llama-server');
    fs.writeFileSync(exe,'test',{mode:0o644});
    fs.writeFileSync(path.join(dir,'model.gguf'),'model');
    const runtime=new EmbeddedLanguageRuntime({discover:()=>locateEmbeddedRuntime({root,home:''})});
    assert.equal(runtime.installed(),true);
    assert.equal(runtime.repairExecutable(),true);
    assert.equal(runtime.inspect().executableAllowed,true);
    const other=path.join(root,'foreign-server');
    fs.writeFileSync(other,'test',{mode:0o644});
    const restricted=new EmbeddedLanguageRuntime({discover:()=>({
      executable:other,gguf:'model',binFound:true,modelFound:true,executableAllowed:false,installed:false,
    })});
    assert.equal(restricted.repairExecutable(),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Hostinger managed runtime repairs a missing SONAME link but never touches foreign locations',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-native-libs-'));
 try {
  const managed=path.join(root,'.aura-language-runtime','llama-b11425');
  fs.mkdirSync(managed,{recursive:true});
  fs.writeFileSync(path.join(managed,'libllama-common.so.0.5'),'test');
  const foreign=path.join(root,'foreign');
  fs.mkdirSync(foreign);
  fs.writeFileSync(path.join(foreign,'libllama-common.so.0.5'),'test');
  assert.deepEqual(repairLlamaLibraryAliases(path.join(foreign,'llama-server')),[]);
  assert.equal(fs.existsSync(path.join(foreign,'libllama-common.so.0')),false);
  if (process.platform !== 'win32') {
    assert.deepEqual(repairLlamaLibraryAliases(path.join(managed,'llama-server')),['libllama-common.so.0']);
    assert.equal(fs.realpathSync(path.join(managed,'libllama-common.so.0')),
      path.join(managed,'libllama-common.so.0.5'));
  }
 }finally{fs.rmSync(root,{force:true,recursive:true})}
});
