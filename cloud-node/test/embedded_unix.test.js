import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {once,EventEmitter} from 'node:events';
import {nativeUnixRequest} from '../src/embedded_loopback.js';
import {EmbeddedLanguageRuntime,chooseNativeTransport} from '../src/embedded_language.js';

test('Hostinger production Linux defaults to Unix transport with explicit TCP override',()=>{
  assert.equal(chooseNativeTransport({platform:'linux',env:{NODE_ENV:'production',CI:'false'}}),'unix');
  assert.equal(chooseNativeTransport({platform:'linux',env:{NODE_ENV:'production',CI:'true'}}),'tcp');
  assert.equal(chooseNativeTransport({platform:'linux',env:{NODE_ENV:'production',
    AURA_EMBEDDED_LANGUAGE_TRANSPORT:'tcp'}}),'tcp');
  assert.equal(chooseNativeTransport({platform:'linux',env:{NODE_ENV:'production',
    AURA_EMBEDDED_LANGUAGE_TRANSPORT:'unix'}}),'unix');
  assert.equal(chooseNativeTransport({platform:'win32',env:{NODE_ENV:'production',
    AURA_EMBEDDED_LANGUAGE_TRANSPORT:'unix'}}),'tcp');
});

test('HTTP over private Unix socket supports health and real chat-shaped token receipt',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aura-unix-test-'));
  const socket=path.join(dir,'model.sock');
  const server=http.createServer((req,res)=>{
    res.setHeader('content-type','application/json');
    if(req.url==='/health'){res.end('{"status":"ok"}');return;}
    assert.equal(req.method,'POST');
    res.end('{"usage":{"completion_tokens":3},"choices":[{"message":{"content":"Bonjour"}}]}');
  });
  server.listen(socket);await once(server,'listening');
  try{
    const health=await nativeUnixRequest(socket,'/health',{signal:AbortSignal.timeout(1500)});
    assert.equal(health.ok,true);
    const proof=await nativeUnixRequest(socket,'/v1/chat/completions',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({messages:[{role:'user',content:'bonjour'}]}),
      signal:AbortSignal.timeout(1500),
    });
    assert.equal(proof.status,200);
    assert.equal((await proof.json()).usage.completion_tokens,3);
    assert.throws(()=>nativeUnixRequest(socket,'/private',{method:'GET'}),/endpoint-rejected/);
    assert.throws(()=>nativeUnixRequest(socket,'/health',{method:'POST'}),/endpoint-rejected/);
    assert.throws(()=>nativeUnixRequest('/tmp/evil.sock?token=1','/health'),/socket-invalid/);
  }finally{
    server.close();await once(server,'close');fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('runtime in forced Unix mode checks real HTTP responses before marking ready',async()=>{
  let server;
  let socketDir;
  let child;
  let args;
  const runtime=new EmbeddedLanguageRuntime({
    transport:'unix',
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',
      gguf:'/tmp/simulated.gguf',installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,delay:()=>new Promise(r=>setTimeout(r,25)),bootTimeoutMs:3000,
    spawnProcess:(_command,argv)=>{
      args=argv;
      const pos=argv.indexOf('--host');
      const sock=argv[pos+1];
      socketDir=path.dirname(sock);
      assert.ok(sock.endsWith('.sock'));
      assert.equal(fs.statSync(socketDir).mode&0o077,0);
      child=new EventEmitter();
      child.pid=process.pid;child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();
      child.kill=()=>{child.signalCode='SIGTERM';server.close(()=>child.emit('close'));return true;};
      server=http.createServer((req,res)=>{
        res.setHeader('content-type','application/json');
        if(req.url==='/health'){res.end('{"status":"ok"}');return;}
        res.end('{"usage":{"completion_tokens":2},"choices":[{"message":{"content":"Bonjour"}}]}');
      });
      server.listen(sock);
      return child;
    },
  });
  try{
    assert.equal(await runtime.start(),true);
    const state=runtime.status();
    assert.equal(state.status,'verified-responsive');
    assert.equal(state.probe_verified,true);
    assert.equal(state.local_transport,'unix');
    assert.equal(state.unix_socket_present,true);
    assert.equal(state.health_seen,true);
    assert.equal(state.boot_attempts[0].transport,'unix');
    assert.equal(args[args.indexOf('--port')+1],'0');
    assert.equal(await runtime.generate('Parle en français','Tu es AURA',64),'Bonjour');
  }finally{
    if(server?.listening){
      server.close();await once(server,'close');
    }
    child?.emit('close');
    assert.equal(fs.existsSync(socketDir),false);
  }
});
