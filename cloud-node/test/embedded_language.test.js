import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {classifyEmbeddedFailure,llamaLoaderEnv,locateEmbeddedRuntime,
  EmbeddedLanguageRuntime} from '../src/embedded_language.js';

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

test('self-hosted runner launches a real loopback process and produces verified text', {
  skip: process.platform === 'win32',
  timeout: 15000,
}, async () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-llama-e2e-'));
  const binary=path.join(root,'llama-server');
  const model=path.join(root,'tiny.gguf');
  fs.writeFileSync(model,'test fixture, no real model');
  fs.writeFileSync(binary, [
    '#!/usr/bin/env node',
    "const http=require('node:http');",
    "const ix=process.argv.indexOf('--port');",
    "const port=Number(process.argv[ix+1]);",
    "http.createServer((req,res)=>{",
    " res.setHeader('Content-Type','application/json');",
    " if(req.url==='/health'){res.end(JSON.stringify({status:'ok'}));return;}",
    " if(req.url==='/v1/chat/completions'){",
    "  let body='';req.on('data',p=>body+=p);req.on('end',()=>{",
    "   const question=JSON.parse(body).messages[1].content;",
    "   res.end(JSON.stringify({choices:[{message:{content:'Réponse locale vérifiée : '+question}}]}));",
    "  });return;}",
    " res.statusCode=404;res.end('{}');",
    "}).listen(port,'127.0.0.1');",
  ].join('\n'),{mode:0o755});
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({installed:true,binFound:true,modelFound:true,
      executableAllowed:true,executable:binary,gguf:model}),
    bootTimeoutMs:7000,
  });
  try {
    const answer=await runtime.generate('Bonjour depuis AURA','Réponds en français',80);
    assert.match(answer,/Réponse locale vérifiée : Bonjour/);
    assert.equal(runtime.status().status,'verified-responsive');
    assert.equal(runtime.status().paid_model_api_required,false);
  } finally {
    if(runtime.child && runtime.child.exitCode===null)runtime.child.kill('SIGTERM');
    fs.rmSync(root,{recursive:true,force:true});
  }
});
