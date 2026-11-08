import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {embeddedStartupBudget,EmbeddedLanguageRuntime,classifyEmbeddedFailure} from '../src/embedded_language.js';

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
  const trigger=server.indexOf("embeddedLanguageRuntime.start({allowProvision:false})",start);
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
