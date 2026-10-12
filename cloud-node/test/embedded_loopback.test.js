import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import {nativeLoopbackRequest,nativeListenerEvidence} from '../src/embedded_loopback.js';

test('real local IPv4 server serves health and generates JSON via native transport',async()=>{
  const visited=[];
  const server=http.createServer(async(req,res)=>{
    visited.push(req.url);
    res.setHeader('content-type','application/json');
    if(req.url==='/health'){res.end(JSON.stringify({status:'ok'}));return;}
    const parts=[];for await(const part of req)parts.push(part);
    const payload=JSON.parse(Buffer.concat(parts).toString('utf8'));
    assert.equal(payload.messages[0].content,'salut');
    res.end(JSON.stringify({usage:{completion_tokens:2},choices:[{message:{content:'Bonjour'}}]}));
  });
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{
    const url='http://127.0.0.1:'+server.address().port;
    const health=await nativeLoopbackRequest(url+'/health',{signal:AbortSignal.timeout(1000)});
    assert.equal(health.ok,true);
    assert.equal((await health.json()).status,'ok');
    const generated=await nativeLoopbackRequest(url+'/v1/chat/completions',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({messages:[{role:'user',content:'salut'}]}),
      signal:AbortSignal.timeout(1000),
    });
    assert.equal(generated.status,200);
    assert.equal((await generated.json()).usage.completion_tokens,2);
    assert.deepEqual(visited,['/health','/v1/chat/completions']);
  }finally{server.close();await once(server,'close');}
});

test('native transport does not permit outbound requests, redirects or method confusion',async()=>{
  for(const dest of [
    'http://localhost:19001/health',
    'http://example.org:19001/health',
    'https://127.0.0.1:19001/health',
    'http://127.0.0.1:19001/api/secret',
    'http://127.0.0.1:19001/health?token=secret',
    'http://admin:pass@127.0.0.1:19001/health',
  ]){
    await assert.rejects(()=>nativeLoopbackRequest(dest),/destination-rejected/);
  }
  await assert.rejects(()=>nativeLoopbackRequest('http://127.0.0.1:19001/health',{method:'POST'}),/method-rejected/);
  await assert.rejects(()=>nativeLoopbackRequest('http://127.0.0.1:19001/v1/chat/completions',{method:'GET'}),/method-rejected/);
});

test('native transport reports direct ECONNREFUSED without a global dispatcher or proxy',async()=>{
  const server=http.createServer((_,res)=>res.end());
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port;
  server.close();await once(server,'close');
  await assert.rejects(nativeLoopbackRequest('http://127.0.0.1:'+port+'/health',
    {signal:AbortSignal.timeout(300)}),error=>error?.code==='ECONNREFUSED');
});

test('llama listener log distinguishes the expected port without exposing network details',()=>{
  const log='llama: private /home/user/secret.gguf\n'
    +'main: server is listening on http://127.0.0.1:35123 - starting the main loop\n';
  assert.deepEqual(nativeListenerEvidence(log,35123),{matching_port:true,family:'ipv4-loopback'});
  assert.deepEqual(nativeListenerEvidence(log,35124),{matching_port:false,family:'ipv4-loopback'});
  assert.deepEqual(nativeListenerEvidence('main: starting the main loop...',35123),
    {matching_port:null,family:'not-reported'});
  assert.doesNotMatch(JSON.stringify(nativeListenerEvidence(log,35123)),/35123|secret|home/);
});
