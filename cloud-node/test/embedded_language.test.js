import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {classifyEmbeddedFailure,llamaLoaderEnv,locateEmbeddedRuntime,
  EmbeddedLanguageRuntime,repairLlamaLibraryAliases,nativeLibraryHealth,systemElfLoader,nativeLaunchSpec,
  nativeBootArgs,embeddedLogSignals,cgroupMemorySnapshot,cgroupPidSnapshot,
  nativeProcessSnapshot,nativeStartupMilestones,healthProbeResult,
  nativeChatPayload,classifyChatError} from '../src/embedded_language.js';

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
  assert.equal(runtime.status().status,'model-loaded-unverified');
  runtime.lastProbeAt='2026-10-12T12:00:01Z';
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

test('provisioner can recover a missing native model without allowing implicit downloads in tests',async()=>{
  let installs=0;
  const provisioner={
    enabled:true,
    async ensure(){installs++;return {executable:'/tmp/test/bin/llama-server',gguf:'/tmp/test/model.gguf',
      binFound:true,modelFound:true,executableAllowed:true,installed:true};},
    snapshot(){return {stage:'installed-verified',enabled:true};},
  };
  const previous=process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED;
  process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED='true';
  const runner=new EmbeddedLanguageRuntime({
    discover:()=>({installed:false,binFound:false,modelFound:false,executableAllowed:false}),
    provisioner,spawnProcess:()=>{throw new Error('no fake process');},
    allocatePort:async()=>54321,
  });
  try{
    assert.equal(await runner.start(),false);
    assert.equal(installs,1);
    assert.equal(runner.inspect().modelFound,true);
    assert.equal(runner.canonicalSource,true);
  }finally{
    if(previous===undefined)delete process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED;
    else process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED=previous;
  }
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
    assert.ok(repairLlamaLibraryAliases(path.join(managed,'llama-server')).includes('libllama-common.so.0'));
    assert.equal(fs.realpathSync(path.join(managed,'libllama-common.so.0')),
      path.join(managed,'libllama-common.so.0.5'));
  }
 }finally{fs.rmSync(root,{force:true,recursive:true})}
});

test('repairs authentic-style broken b11425 SONAME links including ggml and mtmd',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-real-tar-layout-'));
  try {
    const dir=path.join(root,'.aura-language-runtime','llama-b11425','llama-b11425');
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'llama-server'),'ELF',{mode:0o755});
    for(const [stem,leaf] of [
      ['libllama-common','libllama-common.so.0.0.11425'],
      ['libllama','libllama.so.0.0.11425'],
      ['libggml','libggml.so.0.11.1'],
      ['libmtmd','libmtmd.so.0.0.11425'],
    ]){
      fs.writeFileSync(path.join(dir,leaf),'binary');
      fs.symlinkSync('llama-b11425ib'+stem.slice(3)+'.so.0.0.11425',path.join(dir,stem+'.so.0'));
      fs.symlinkSync('llama-b11425ib'+stem.slice(3)+'.so.0',path.join(dir,stem+'.so'));
    }
    const before=nativeLibraryHealth(path.join(dir,'llama-server'));
    assert.equal(before.common_soname_found,false);
    assert.ok(before.dangling_links.includes('libllama-common.so.0'));
    const repaired=repairLlamaLibraryAliases(path.join(dir,'llama-server'));
    assert.ok(repaired.includes('libllama-common.so.0'));
    assert.ok(repaired.includes('libllama-common.so'));
    const after=nativeLibraryHealth(path.join(dir,'llama-server'));
    assert.equal(after.common_soname_found,true);
    assert.deepEqual(after.dangling_links,[]);
    assert.ok(llamaLoaderEnv(path.join(dir,'llama-server'),{LD_LIBRARY_PATH:''}).LD_LIBRARY_PATH.includes(dir));
  } finally {fs.rmSync(root,{force:true,recursive:true});}
});

test('actual Linux ELF starts after native SONAME symlink repair',{
  skip: process.platform !== 'linux' || spawnSync('gcc',['--version']).status !== 0,
},()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aura-elf-loader-'));
  try {
    const dir=path.join(root,'aura-language-runtime','llama-b11425');
    fs.mkdirSync(dir,{recursive:true});
    const library=path.join(dir,'libllama-common.so.0.0.11425');
    const source=path.join(root,'library.c');
    fs.writeFileSync(source,'int aura_native_hello(void) {return 42;}\n');
    let cc=spawnSync('gcc',['-fPIC','-shared','-Wl,-soname,libllama-common.so.0','-o',library,source]);
    assert.equal(cc.status,0,cc.stderr?.toString());
    const main=path.join(root,'main.c');
    fs.writeFileSync(main,'#include <stdio.h>\nint aura_native_hello(void);\nint main(void){if(aura_native_hello()!=42)return 1;puts("AURA_NATIVE_OK");return 0;}\n');
    const binary=path.join(dir,'llama-server');
    cc=spawnSync('gcc',['-o',binary,main,library]);
    assert.equal(cc.status,0,cc.stderr?.toString());
    fs.symlinkSync('llama-b11425ibllama-common.so.0.0.11425',path.join(dir,'libllama-common.so.0'));
    const env=llamaLoaderEnv(binary,{LD_LIBRARY_PATH:''});
    let run=spawnSync(binary,[],{env});
    assert.notEqual(run.status,0);
    assert.match(run.stderr.toString(),/libllama-common.so.0/);
    repairLlamaLibraryAliases(binary);
    run=spawnSync(binary,[],{env:llamaLoaderEnv(binary,{LD_LIBRARY_PATH:''})});
    assert.equal(run.status,0,run.stderr.toString());
    assert.match(run.stdout.toString(),/AURA_NATIVE_OK/);
  } finally {fs.rmSync(root,{force:true,recursive:true});}
});

test('system ELF loader fallback is restricted to trusted system paths and uses no shell',()=>{
  assert.equal(systemElfLoader('x64','win32'),'');
  assert.equal(systemElfLoader('mips','linux'),'');
  const filename='/tmp/aura-language-runtime/llama-b11425/llama-server';
  const direct=nativeLaunchSpec(filename,['--version']);
  assert.equal(direct.command,filename);
  assert.equal(direct.mode,'direct');
  if(process.platform==='linux' && systemElfLoader()){
    const spec=nativeLaunchSpec(filename,['--version'],true);
    assert.equal(spec.command,systemElfLoader());
    assert.equal(spec.args[0],'--library-path');
    assert.equal(spec.args[2],filename);
    assert.equal(spec.mode,'system-elf-loader');
    assert.equal(spec.args[3],'--version');
  }
});

test('Hostinger boot failure classification identifies kernel kill, CPU incompatibility and model errors',()=>{
  assert.equal(classifyEmbeddedFailure('exit.signal.sigkill').code,'embedded-insufficient-memory');
  assert.equal(classifyEmbeddedFailure('out of memory').code,'embedded-insufficient-memory');
  assert.equal(classifyEmbeddedFailure('exit.signal.sigill').code,'embedded-cpu-instruction-unsupported');
  assert.equal(classifyEmbeddedFailure('exit.signal.sigsegv').code,'embedded-native-segfault');
  assert.equal(classifyEmbeddedFailure('failed to load model').code,'embedded-model-load-failed');
  assert.equal(classifyEmbeddedFailure('error parsing arguments').code,'embedded-unsupported-startup-option');
  assert.equal(classifyEmbeddedFailure('embedded-engine-startup-timeout').code,'embedded-startup-timeout');
  assert.equal(classifyEmbeddedFailure('embedded-engine-exited-127').code,'embedded-process-exit-127');
});
test('native boot profiles use valid upstream flags and reduced memory on retry',()=>{
  const standard=nativeBootArgs('/model.gguf',47621);
  const low=nativeBootArgs('/model.gguf',47621,{lowMemory:true});
  assert.ok(standard.includes('--no-warmup'));
  assert.ok(standard.includes('--parallel'));
  assert.ok(standard.includes('--ubatch-size'));
  assert.ok(standard.includes('--batch-size'));
  assert.equal(standard[standard.indexOf('--ctx-size')+1],'2048');
  assert.equal(low[low.indexOf('--ctx-size')+1],'768');
  assert.equal(low[low.indexOf('--batch-size')+1],'32');
});
test('path-free language diagnostics do not expose stderr, model path or tokens',()=>{
  const raw='failed to load model /home/customer/private.gguf?token=MY_PRIVATE_TOKEN; bad_alloc';
  const flags=embeddedLogSignals(raw);
  assert.deepEqual(flags,['memory-allocation-failed','model-loader-failed']);
  assert.doesNotMatch(JSON.stringify(flags),/customer|MY_PRIVATE_TOKEN|private\.gguf/);
});
test('memory snapshot reports only rounded resources and OOM counts',()=>{
  const files={
    '/sys/fs/cgroup/memory.max':String(1536*1048576),
    '/sys/fs/cgroup/memory.current':String(730*1048576),
    '/sys/fs/cgroup/memory.events':'low 0\nhigh 0\nmax 0\noom 2\noom_kill 1\n',
  };
  const result=cgroupMemorySnapshot({read:(file)=>{if(!(file in files))throw Error('missing');return files[file];}});
  assert.deepEqual(result,{limit_mb:1536,current_mb:730,oom_events:2,oom_kills:1});
});
test('SIGKILL before native health reattempts with a smaller context instead of looping forever',async()=>{
  const launches=[];
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',
      gguf:'/tmp/test-model.gguf',binFound:true,modelFound:true,executableAllowed:true,installed:true}),
    provisioner:null,allocatePort:async()=>19098,
    request:async(url,opts)=>opts?.method==='POST'
      ? {ok:launches.length>=2,json:async()=>({usage:{completion_tokens:2},choices:[{message:{content:'Bonjour'}}]})}
      : {ok:launches.length>=2},
    delay:async()=>{await new Promise(resolve=>setImmediate(resolve));},
    bootTimeoutMs:1000,
    spawnProcess:(command,args)=>{
      launches.push({command,args});
      const child=new EventEmitter();
      child.exitCode=null;child.signalCode=null;
      child.stderr=new EventEmitter();
      child.kill=()=>{};
      if(launches.length===1){
        setImmediate(()=>{
          child.signalCode='SIGKILL';
          child.emit('exit',null,'SIGKILL');
        });
      }
      return child;
    },
  });
  assert.equal(await runtime.start(),true);
  assert.equal(launches.length,2);
  assert.equal(launches[1].args[launches[1].args.indexOf('--ctx-size')+1],'768');
  assert.equal(runtime.status().boot_profile,'low-memory');
  assert.equal(runtime.status().ready,true);
});

test('Hostinger thread-limit abort has its own diagnostic, not a generic engine error',()=>{
  for(const message of [
    'pthread_create failed: Resource temporarily unavailable',
    'cannot create thread EAGAIN exit.signal.sigabrt',
    'failed to create thread']) {
    assert.equal(classifyEmbeddedFailure(message).code,'embedded-thread-capacity-exhausted');
  }
  assert.equal(classifyEmbeddedFailure('exit.signal.sigill').code,'embedded-cpu-instruction-unsupported');
});
test('native llama server caps every CPU and HTTP worker pool even with many visible CPUs',()=>{
  const args=nativeBootArgs('/models/qwen.gguf',12600);
  for(const [arg,count] of [['--threads','1'],['--threads-batch','1'],
    ['--threads-http','1'],['--parallel','1']]){
    assert.equal(args[args.indexOf(arg)+1],count,arg);
  }
  const configured=nativeBootArgs('/models/qwen.gguf',12600,{threads:96});
  assert.equal(configured[configured.indexOf('--threads')+1],'1');
  assert.equal(configured[configured.indexOf('--threads-http')+1],'1');
  const fallback=nativeBootArgs('/models/qwen.gguf',12600,{lowMemory:true,threads:96});
  assert.equal(fallback[fallback.indexOf('--threads')+1],'1');
  assert.equal(fallback[fallback.indexOf('--threads-http')+1],'1');
  const spec=nativeLaunchSpec('/tmp/aura-language-runtime/llama-server',args);
  assert.equal(spec.env.OMP_NUM_THREADS,'1');
  assert.equal(spec.env.OPENBLAS_NUM_THREADS,'1');
  assert.equal(spec.env.LLAMA_ARG_THREADS_HTTP,'1');
});
test('cgroup v2 pid counters reveal task limit without filesystem details',()=>{
  const fixture={
    '/sys/fs/cgroup/pids.max':'64\n',
    '/sys/fs/cgroup/pids.current':'60\n',
    '/sys/fs/cgroup/pids.events':'max 11\n',
  };
  const snapshot=cgroupPidSnapshot({read:(p)=>{
    if(!(p in fixture))throw Error('unavailable');
    return fixture[p];
  }});
  assert.deepEqual(snapshot,{max:64,current:60,failed_forks:11});
  assert.doesNotMatch(JSON.stringify(snapshot),/sys\/fs|customer/);
});
test('thread creation abort retries once under low-memory single-thread profile',async()=>{
  const launches=[];
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',
      gguf:'/tmp/installed.gguf',binFound:true,modelFound:true,executableAllowed:true,installed:true}),
    provisioner:null,allocatePort:async()=>19099,
    request:async(url,opts)=>opts?.method==='POST'
      ? {ok:launches.length>=2,json:async()=>({usage:{completion_tokens:2},choices:[{message:{content:'Bonjour'}}]})}
      : {ok:launches.length>=2},
    delay:async()=>{await new Promise(resolve=>setImmediate(resolve));},
    bootTimeoutMs:1000,
    spawnProcess:(cmd,args,opts)=>{
      launches.push({cmd,args,opts});
      const child=new EventEmitter();
      child.exitCode=null;child.signalCode=null;
      child.stderr=new EventEmitter();child.stdout=new EventEmitter();
      child.kill=()=>{};
      if(launches.length===1){
        setImmediate(()=>{
          child.stderr.emit('data',Buffer.from('pthread_create: Resource temporarily unavailable'));
          child.signalCode='SIGABRT';child.emit('exit',null,'SIGABRT');
        });
      }
      return child;
    }
  });
  assert.equal(await runtime.start(),true);
  assert.equal(launches.length,2);
  for(const run of launches){
    assert.equal(run.args[run.args.indexOf('--threads-http')+1],'1');
    assert.equal(run.args[run.args.indexOf('--threads-batch')+1],'1');
    assert.equal(run.opts.env.OMP_NUM_THREADS,'1');
  }
  assert.equal(runtime.status().boot_profile,'low-memory');
});

test('a user chat never waits for slow installation, a blocked native boot, or 150s model load',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/qwen.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,
  });
  let launches=0;
  runtime.start=()=>{
    launches++;
    return new Promise(()=>{}); // simulates a non-responding booting server
  };
  const start=Date.now();
  assert.equal(await runtime.generate('salut','français'), '');
  assert.ok(Date.now()-start<150,'chat waited for an unresponsive model');
  assert.equal(launches,1);
  // Still no bogus answer if the model has not produced any tokens.
  assert.equal(runtime.status().ready,false);
  assert.equal(runtime.status().last_success_at,'');
});
test('a process exiting with code 0 before health is ready is still a failure',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/qwen.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>12233,
    request:async()=>{throw Error('not listening')},
    delay:async()=>{await new Promise(resolve=>setImmediate(resolve));},
    bootTimeoutMs:500,
    spawnProcess:()=>{
      const child=new EventEmitter();
      child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();
      child.kill=()=>{};
      setImmediate(()=>{child.exitCode=0;child.emit('exit',0,null)});
      return child;
    }
  });
  assert.equal(await runtime.start(),false);
  const status=runtime.status();
  assert.equal(status.ready,false);
  assert.equal(status.failure_code,'embedded-clean-exit-before-inference');
  assert.equal(status.boot_attempts.length,1);
  assert.equal(status.boot_attempts[0].exit_code,0);
  assert.equal(status.boot_attempts[0].outcome,'exit');
});
test('failed low-memory retry keeps both attempts and original SIGABRT evidence',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/qwen.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>12234,
    request:async()=>{throw Error('not listening')},
    delay:async()=>{await new Promise(resolve=>setImmediate(resolve));},
    bootTimeoutMs:500,
    spawnProcess:()=>{
      const child=new EventEmitter();
      child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();
      child.kill=()=>{};
      const nth=++runtime._testLaunches;
      setImmediate(()=>{
        if(nth===1){
          child.stderr.emit('data','pthread_create: Resource temporarily unavailable');
          child.signalCode='SIGABRT';child.emit('exit',null,'SIGABRT');
        }else{
          child.exitCode=0;child.emit('exit',0,null);
        }
      });
      return child;
    }
  });
  runtime._testLaunches=0;
  assert.equal(await runtime.start(),false);
  const status=runtime.status();
  assert.equal(status.boot_attempts.length,2);
  assert.equal(status.boot_attempts[0].failure_code,'embedded-thread-capacity-exhausted');
  assert.equal(status.boot_attempts[0].exit_signal,'SIGABRT');
  assert.equal(status.boot_attempts[1].profile,'low-memory');
  assert.equal(status.boot_attempts[1].exit_code,0);
  assert.equal(status.ready,false);
});

test('health 200 alone does not count as completed French inference',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/installed.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>21001,bootTimeoutMs:500,
    delay:async()=>{},
    request:async(url,opts)=>opts?.method==='POST'?{ok:false,status:503}:{ok:true},
    spawnProcess:()=>{
      const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true;
      return child;
    }
  });
  assert.equal(await runtime.start(),false);
  const state=runtime.status();
  assert.equal(state.ready,false);
  assert.equal(state.health_seen,true);
  assert.equal(state.probe_verified,false);
  assert.equal(state.failure_code,'embedded-inference-probe-http');
  assert.equal(state.boot_attempts[0].outcome,'probe-failed');
  assert.equal(state.boot_attempts[0].health_seen,true);
  assert.equal(state.boot_attempts[0].inference_verified,false);
});

test('a nonempty real response on chat endpoint authorizes readiness',async()=>{
  const seen=[];
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/installed.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>21002,bootTimeoutMs:1000,
    delay:async()=>{},
    request:async(url,opts)=>{
      seen.push({url,opts});
      if(opts?.method==='POST')return {ok:true,json:async()=>({
        usage:{completion_tokens:2},choices:[{message:{content:'Bonjour.'}}]})};
      return {ok:true};
    },
    spawnProcess:()=>{
      const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true;
      return child;
    },
  });
  assert.equal(await runtime.start(),true);
  const state=runtime.status();
  assert.equal(state.probe_verified,true);
  assert.equal(state.status,'verified-responsive');
  assert.equal(state.boot_attempts[0].inference_verified,true);
  assert.ok(state.last_probe_at);
  assert.equal(state.last_success_at,''); // proof does not simulate a user conversation
  const probe=seen.find(x=>x.opts?.method==='POST');
  assert.ok(probe?.url.endsWith('/v1/chat/completions'));
  assert.equal(JSON.parse(probe.opts.body).chat_template_kwargs.enable_thinking,false);
  assert.equal(JSON.parse(probe.opts.body).max_tokens,48);
});

test('empty content and reasoning-only responses are not verified',async()=>{
  for(const message of [{content:''},{content:'<think>internal reasoning</think>'},{reasoning_content:'hidden'}]){
    const runtime=new EmbeddedLanguageRuntime({
      discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/installed.gguf',
        installed:true,binFound:true,modelFound:true,executableAllowed:true}),
      provisioner:null,allocatePort:async()=>21003,bootTimeoutMs:500,
      delay:async()=>{},
      request:async(url,opts)=>opts?.method==='POST'
        ? {ok:true,json:async()=>({choices:[{message}]})}:{ok:true},
      spawnProcess:()=>{
        const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
        child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true;
        return child;
      },
    });
    assert.equal(await runtime.start(),false);
    assert.equal(runtime.status().failure_code,'embedded-inference-probe-empty');
  }
});

test('an AbortError in the inference probe is separately diagnosed',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/model.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>21004,bootTimeoutMs:500,delay:async()=>{},
    request:async(url,opts)=>{
      if(opts?.method==='POST'){const error=new Error('This operation was aborted');error.name='AbortError';throw error;}
      return {ok:true};
    },
    spawnProcess:()=>{
      const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true;
      return child;
    },
  });
  assert.equal(await runtime.start(),false);
  assert.equal(runtime.status().failure_code,'embedded-inference-probe-timeout');
});

test('a completed probe never prevents reporting native post-start termination',async()=>{
  let child;
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/model.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>21005,bootTimeoutMs:1000,
    request:async(url,opts)=>opts?.method==='POST'
      ? {ok:true,json:async()=>({usage:{completion_tokens:2},choices:[{message:{content:'Bonjour'}}]})}:{ok:true},
    spawnProcess:()=>{
      child=new EventEmitter();child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true;
      return child;
    }
  });
  assert.equal(await runtime.start(),true);
  child.exitCode=0;child.emit('exit',0,null);
  assert.equal(runtime.status().ready,false);
  assert.equal(runtime.status().probe_verified,false);
  assert.equal(runtime.status().failure_code,'embedded-native-stopped-after-serving');
});

test('a textual stub with no positive completion_tokens is never proof of inference',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',gguf:'/tmp/model.gguf',
      installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>21006,bootTimeoutMs:500,
    request:async(url,opts)=>opts?.method==='POST'
      ? {ok:true,json:async()=>({choices:[{message:{content:'Bonjour'}}]})}:{ok:true},
    spawnProcess:()=>{
      const child=new EventEmitter();child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true;
      return child;
    },
  });
  assert.equal(await runtime.start(),false);
  assert.equal(runtime.status().failure_code,'embedded-inference-probe-invalid');
});

test('proc Linux snapshot reports bounded RSS and threads but no sensitive process strings',()=>{
  const sample=[
    'Name: sensitive-model-path',
    'State: S (sleeping)',
    'Threads:\t3',
    'VmRSS:\t409600 kB',
    'Uid:\t1111',
  ].join('\n');
  const seen=[];
  const result=nativeProcessSnapshot(4321,{
    platform:'linux',
    read:(name)=>{seen.push(name);return sample;},
  });
  assert.deepEqual(result,{state:'S',threads:3,rss_mb:400});
  assert.deepEqual(seen,['/proc/4321/status']);
  assert.doesNotMatch(JSON.stringify(result),/sensitive-model|Uid|proc|4321/);
  assert.equal(nativeProcessSnapshot(-1,{platform:'linux',read:()=>sample}),null);
  assert.equal(nativeProcessSnapshot(4321,{platform:'win32',read:()=>sample}),null);
  assert.equal(nativeProcessSnapshot(4321,{platform:'linux',read:()=>{throw Error('access denied');}}),null);
});
test('startup milestones and HTTP errors preserve only allowlisted state',()=>{
  const message='llama_model_loader: general.architecture=qwen3\nload_tensors done\n'
    + 'private-password=/home/private/secret.gguf\nmain: server is listening on http://127.0.0.1:24112 - starting the main loop\n';
  const stages=nativeStartupMilestones(message);
  assert.deepEqual(stages,['model-metadata','model-tensors','http-listener']);
  assert.doesNotMatch(JSON.stringify(stages),/private|home|secret/);
  assert.equal(healthProbeResult({cause:{code:'ECONNREFUSED'}}),'connection-refused');
  assert.equal(healthProbeResult({name:'TimeoutError'}),'timeout');
  assert.equal(healthProbeResult({cause:{code:'EHOSTUNREACH'}}),'network-unreachable');
  assert.equal(healthProbeResult(new Error('/home/private/secret.gguf')),'request-error');
});
test('failed Hostinger health polling exposes safe counts and preserves both attempts',async()=>{
  let starts=0;
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',
      gguf:'/tmp/secret-model.gguf',installed:true,binFound:true,
      modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>23312,bootTimeoutMs:35,
    request:async()=>{const err=new Error('private host/path');err.cause={code:'ECONNREFUSED'};throw err;},
    delay:async()=>{await new Promise(resolve=>setTimeout(resolve,2));},
    spawnProcess:()=>{
      starts++;
      const child=new EventEmitter();
      child.pid=99999999;child.exitCode=null;child.signalCode=null;
      child.stderr=new EventEmitter();child.stdout=new EventEmitter();
      child.kill=()=>{child.signalCode='SIGTERM';return true;};
      setImmediate(()=>child.stderr.emit('data',Buffer.from(
        'llama_model_loader: general.architecture=qwen3 private /home/sensitive.gguf')));
      return child;
    },
  });
  assert.equal(await runtime.start(),false);
  const state=runtime.status();
  assert.equal(starts,2);
  assert.equal(state.ready,false);
  assert.equal(state.probe_verified,false);
  assert.equal(state.health_last_result,'connection-refused');
  assert.ok(state.health_probe_count>=1);
  assert.equal(state.native_output_observed,true);
  assert.ok(state.native_startup_milestones.includes('model-metadata'));
  assert.equal(state.boot_attempts.length,2);
  assert.equal(state.boot_attempts[0].health_last_result,'connection-refused');
  assert.equal(state.boot_attempts[0].native_output_observed,true);
  assert.equal(state.boot_attempts[1].profile,'low-memory');
  assert.doesNotMatch(JSON.stringify(state),/\/home\/sensitive|secret-model|private host/);
});

test('normal llama_model_loader progress must never misclassify a health timeout',()=>{
  const progress='llama_model_loader: general.architecture=qwen3 loaded tensors';
  assert.equal(classifyEmbeddedFailure(progress+' embedded-engine-startup-timeout').code,
    'embedded-startup-timeout');
  assert.deepEqual(embeddedLogSignals(progress),[]);
  assert.equal(classifyEmbeddedFailure(progress+' failed to load model').code,
    'embedded-model-load-failed');
  assert.deepEqual(embeddedLogSignals('failed to load model'),['model-loader-failed']);
});

test('clean exit after a real Qwen proof is classified, preserved and recovery is scheduled',async()=>{
  let child;
  const scheduled=[];
  const runtime=new EmbeddedLanguageRuntime({
    transport:'tcp',
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',
      gguf:'/tmp/qwen.gguf',installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>22401,bootTimeoutMs:1000,
    schedule:(fn,delay)=>{
      const timer={fn,delay,unref(){}};
      scheduled.push(timer);return timer;
    },
    request:async(_url,opts)=>opts?.method==='POST'
      ? {ok:true,json:async()=>({usage:{completion_tokens:4},
          choices:[{message:{content:'Bonjour'}}]})}:{ok:true,status:200},
    spawnProcess:()=>{
      child=new EventEmitter();child.pid=null;
      child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>true;
      return child;
    },
  });
  assert.equal(await runtime.start(),true);
  const before=runtime.status();
  assert.equal(before.ready,true);
  assert.equal(before.probe_verified,true);
  assert.equal(before.last_verified_completion_tokens,4);
  const verifiedAt=before.last_verified_probe_at;
  child.exitCode=0;child.emit('exit',0,null);
  const after=runtime.status();
  assert.equal(after.status,'startup-failed');
  assert.equal(after.ready,false);
  assert.equal(after.probe_verified,false);
  assert.equal(after.failure_code,'embedded-native-stopped-after-serving');
  assert.equal(after.last_probe_at,'');
  assert.equal(after.last_verified_probe_at,verifiedAt);
  assert.equal(after.last_verified_completion_tokens,4);
  assert.equal(after.process_exit.code,0);
  assert.equal(after.boot_attempts.length,1);
  assert.equal(after.boot_attempts[0].outcome,'stopped-after-inference');
  assert.equal(after.boot_attempts[0].exit_code,0);
  assert.equal(after.boot_attempts[0].inference_verified,true);
  assert.equal(after.boot_attempts[0].verified_at,verifiedAt);
  assert.equal(after.recovery_scheduled,true);
  assert.equal(scheduled.length,1);
  assert.equal(scheduled[0].delay,3000);
  assert.equal(classifyEmbeddedFailure('harmless: error while loading shared libraries embedded-native-stopped-after-serving').code,
    'embedded-native-stopped-after-serving');
});

test('post-inference clean exits retry only three times within a bounded window',async()=>{
  const timers=[];const children=[];
  const runtime=new EmbeddedLanguageRuntime({
    transport:'tcp',
    discover:()=>({executable:'/tmp/aura-language-runtime/llama-server',
      gguf:'/tmp/qwen.gguf',installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,allocatePort:async()=>22402,bootTimeoutMs:1000,
    schedule:(fn,delay)=>{
      const timer={fn,delay,unref(){}};
      timers.push(timer);return timer;
    },
    request:async(_url,opts)=>opts?.method==='POST'
      ? {ok:true,json:async()=>({usage:{completion_tokens:1},
        choices:[{message:{content:'Bonjour'}}]})}:{ok:true,status:200},
    spawnProcess:()=>{
      const child=new EventEmitter();
      child.pid=null;child.exitCode=null;child.signalCode=null;
      child.stdout=new EventEmitter();child.stderr=new EventEmitter();
      child.kill=()=>true;children.push(child);
      return child;
    },
  });
  assert.equal(await runtime.start(),true);
  for(let i=0;i<4;i++){
    const child=children.at(-1);
    child.exitCode=0;child.emit('exit',0,null);
    assert.equal(runtime.status().ready,false);
    if(i<3){
      assert.equal(runtime.status().recovery_scheduled,true);
      assert.equal(timers[i].delay,[3000,15000,60000][i]);
      timers[i].fn();
      assert.equal(await runtime.start(),true);
      assert.equal(runtime.status().ready,true);
    }
  }
  assert.equal(runtime.status().recovery_scheduled,false);
  assert.equal(runtime.status().recovery_limited,true);
  assert.equal(runtime.status().recovery_attempts_in_window,3);
  assert.equal(children.length,4);
  assert.equal(runtime.status().last_verified_completion_tokens,1);
  assert.equal(runtime.status().boot_attempts.at(-1).outcome,'stopped-after-inference');
});

test('CPU-only Qwen chat payload respects standard and reduced context budgets',()=>{
  const long='É'.repeat(18000);
  const base=nativeChatPayload(long,long,900);
  assert.equal(base.max_tokens,192);
  assert.equal(base.messages[0].content.length,1200);
  assert.equal(base.messages[1].content.length,1800);
  assert.equal(base.chat_template_kwargs.enable_thinking,false);
  const reduced=nativeChatPayload(long,long,900,{lowMemory:true});
  assert.equal(reduced.max_tokens,96);
  assert.equal(reduced.messages[0].content.length,450);
  assert.equal(reduced.messages[1].content.length,700);
});
test('chat-level rejection must preserve native readiness, verified probe and socket',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,
  });
  runtime.ready=true;
  runtime.lastProbeAt='2026-10-13T00:15:28.976Z';
  runtime.lastVerifiedProbeAt=runtime.lastProbeAt;
  runtime.lastVerifiedTokens=3;
  runtime.healthSeen=true;
  let kills=0;
  runtime.child={exitCode:null,signalCode:null,kill:()=>{kills++;}};
  let calls=0;
  runtime.localRequest=async(_endpoint,opts)=>{
    calls++;
    assert.equal(JSON.parse(opts.body).max_tokens,192);
    if(calls===1)return {ok:false,status:422};
    return {ok:true,status:200,json:async()=>({
      usage:{completion_tokens:11},
      choices:[{message:{content:'<think>secret</think>Bonjour, comment allez-vous ?'}}]
    })};
  };
  assert.equal(await runtime.generate('Bonjour','Tu es AURA',700),'');
  const degraded=runtime.status();
  assert.equal(degraded.status,'generation-degraded');
  assert.equal(degraded.ready,true);
  assert.equal(degraded.probe_verified,true);
  assert.equal(degraded.failure_code,'');
  assert.equal(degraded.generation_failure_code,'generation-context-rejected');
  assert.equal(degraded.generation_failures_consecutive,1);
  assert.equal(degraded.last_verified_completion_tokens,3);
  assert.equal(degraded.native_process_running,true);
  assert.equal(kills,0);
  assert.equal(await runtime.generate('Bonjour','Tu es AURA',700),'Bonjour, comment allez-vous ?');
  const recovered=runtime.status();
  assert.equal(recovered.status,'verified-responsive');
  assert.equal(recovered.generation_failure_code,'');
  assert.equal(recovered.generation_failures_consecutive,0);
  assert.ok(recovered.last_success_at);
  assert.equal(kills,0);
});
test('timed-out chat must not terminate still healthy native process',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,
  });
  runtime.ready=true;runtime.lastProbeAt='2026-10-13T00:15:28Z';
  let killed=0;
  runtime.child={exitCode:null,signalCode:null,kill:()=>{killed++;}};
  runtime.localRequest=async()=>{const err=new Error('request timed out');err.name='TimeoutError';throw err;};
  assert.equal(await runtime.generate('salut','français',600),'');
  assert.equal(runtime.status().generation_failure_code,'generation-timeout');
  assert.equal(runtime.status().status,'generation-degraded');
  assert.equal(runtime.status().ready,true);
  assert.equal(killed,0);
});
test('overlapping chats do not pile up concurrent native requests',async()=>{
  const runtime=new EmbeddedLanguageRuntime({
    discover:()=>({installed:true,binFound:true,modelFound:true,executableAllowed:true}),
    provisioner:null,
  });
  runtime.ready=true;runtime.lastProbeAt='2026-10-13T00:15:28Z';
  runtime.child={exitCode:null,signalCode:null,kill:()=>{throw Error('kill forbidden');}};
  let resume;let requests=0;
  runtime.localRequest=async()=>{requests++;return await new Promise(r=>{resume=r;});};
  const first=runtime.generate('première','Tu es AURA',600);
  assert.equal(runtime.status().generation_active,true);
  assert.equal(await runtime.generate('deuxième','Tu es AURA',600),'');
  assert.equal(requests,1);
  resume({ok:true,json:async()=>({choices:[{message:{content:'Réponse valide'}}]})});
  assert.equal(await first,'Réponse valide');
  assert.equal(runtime.status().generation_active,false);
});
test('chat error classification is allowlisted; no raw paths or prompts are revealed',()=>{
  assert.equal(classifyChatError({cause:{code:'ENOENT'}}),'generation-transport-unavailable');
  assert.equal(classifyChatError(Error('embedded-http-503')),'generation-http-error');
  assert.equal(classifyChatError(Error('embedded-empty-response')),'generation-empty');
  assert.equal(classifyChatError(Error('/private/qwen/token-abcdef')),
    'generation-request-error');
});
