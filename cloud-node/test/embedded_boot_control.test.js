import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {embeddedStartupBudget,EmbeddedLanguageRuntime,classifyEmbeddedFailure,locateEmbeddedRuntime} from '../src/embedded_language.js';

test('cgroup preflight blocks 639 MB Q8 launch when remaining memory is unsafe',()=>{
  const snapshot=embeddedStartupBudget({limit_mb:1024,current_mb:480},{
    read:()=>{throw Error('no cache data');},
  });
  assert.equal(snapshot.safe_to_start,false);
  assert.equal(snapshot.headroom_mb,544);
  assert.equal(snapshot.minimum_headroom_mb,740);
  assert.equal(snapshot.recommended_low_memory,true);
  assert.equal(classifyEmbeddedFailure('embedded-insufficient-cgroup-headroom').code,
    'embedded-insufficient-cgroup-headroom');
});

test('reclaimable inactive page cache is accounted for in memory planning',()=>{
  const snapshot=embeddedStartupBudget({limit_mb:1536,current_mb:920},{
    read:()=> 'anon 1\ninactive_file '+String(400*1048576)+'\n',
  });
  assert.equal(snapshot.headroom_mb,1016);
  assert.equal(snapshot.safe_to_start,true);
  assert.equal(snapshot.recommended_low_memory,true);
});

test('absence of a readable memory quota is explicitly unknown, never falsely marked sufficient',()=>{
  const snapshot=embeddedStartupBudget({limit_mb:null,current_mb:null},{
    read:()=>{throw Error('not accessible');},
  });
  assert.equal(snapshot.known,false);
  assert.equal(snapshot.headroom_mb,null);
  assert.equal(snapshot.safe_to_start,true); // unknown must still attempt and verify
});

test('already installed files do not require a provisioner snapshot to be marked detected',()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',
      gguf:'/tmp/aura-language-runtime/model.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,
  });
  const state=runtime.status();
  assert.equal(state.installed,true);
  assert.equal(state.status,'available-not-started');
  assert.equal(state.provisioning.enabled,false);
  assert.ok('memory_preflight' in state);
  assert.equal(state.ready,false);
});

test('manual start is a private, download-free, nonblocking API',()=>{
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const start=server.indexOf("app.post('/api/language/embedded/start'");
  const end=server.indexOf("app.get('/api/language/progress'",start);
  assert.ok(start>=0 && end>start);
  const route=server.slice(start,end);
  assert.match(route,/requirePrivate\(request, reply\)/);
  assert.match(route,/engine\.installed\(\)/);
  assert.match(route,/engine\.start\(\{allowProvision:false\}\)/);
  assert.match(route,/reply\.code\(202\)/);
  assert.doesNotMatch(route,/ensure\(\)|streamChecked\(|fetch\(/);
});

test('production warmup of installed models is independent of MySQL runtime readiness',()=>{
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  const start=server.indexOf('export function startRuntimeLoop()');
  const trigger=server.indexOf("embeddedLanguageRuntime.start({allowProvision:policy.allowProvision})",start);
  assert.match(server.slice(start,trigger),/independentLocalLanguageBoot/);
  assert.match(server.slice(start,trigger),/autoprovisionEnabled/);
  const database=server.indexOf('startRuntime().catch(',start);
  assert.ok(start>=0 && trigger>start && trigger<database);
});

test('dashboard distinguishes detected installation from successful inference',()=>{
  const panel=fs.readFileSync(new URL('../src/dashboard-runtime.js',import.meta.url),'utf8');
  assert.match(panel,/stage==='not-started'&&filesPresent/);
  assert.match(panel,/filesPresent\?100/);
  assert.match(panel,/memoryBlocked\?'Mémoire insuffisante/);
  assert.match(panel,/id=\"engineStart\"|\$\('engineStart'\)/);
  const html=fs.readFileSync(new URL('../src/dashboard.js',import.meta.url),'utf8');
  assert.match(html,/id="engineStart"/);
});

test('persistent provisioner cache remains discoverable after Node restarts',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aura-runtime-cache-'));
  try{
    const cache=path.join(tmp,'.cache','aura-language-runtime');
    const native=path.join(cache,'llama-b11425');
    fs.mkdirSync(native,{recursive:true});
    fs.writeFileSync(path.join(native,'llama-server'),'test binary',{mode:0o755});
    fs.writeFileSync(path.join(cache,'Qwen3-0.6B-Q8_0.gguf'),'test gguf');
    const item=locateEmbeddedRuntime({root:path.join(tmp,'deployed-site'),home:tmp});
    assert.equal(item.binFound,true);
    assert.equal(item.modelFound,true);
    assert.equal(item.installed,true);
    assert.ok(item.gguf.endsWith('Qwen3-0.6B-Q8_0.gguf'));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test('explicit persistent model cache folder is discovered without a new download',()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'aura-runtime-override-'));
  const previous=process.env.AURA_EMBEDDED_CACHE_DIR;
  try{
    const cache=path.join(tmp,'managed-cache');
    fs.mkdirSync(cache,{recursive:true});
    fs.writeFileSync(path.join(cache,'llama-server'),'test binary',{mode:0o755});
    fs.writeFileSync(path.join(cache,'model.gguf'),'test gguf');
    process.env.AURA_EMBEDDED_CACHE_DIR=cache;
    const result=locateEmbeddedRuntime({root:path.join(tmp,'site'),home:''});
    assert.equal(result.installed,true);
  }finally{
    if(previous===undefined)delete process.env.AURA_EMBEDDED_CACHE_DIR;
    else process.env.AURA_EMBEDDED_CACHE_DIR=previous;
    fs.rmSync(tmp,{recursive:true,force:true});
  }
});
