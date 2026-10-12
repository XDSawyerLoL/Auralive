import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {classifyEmbeddedFailure,llamaLoaderEnv,locateEmbeddedRuntime,
  EmbeddedLanguageRuntime,repairLlamaLibraryAliases,nativeLibraryHealth,systemElfLoader,nativeLaunchSpec,
  nativeBootArgs,embeddedLogSignals,cgroupMemorySnapshot,cgroupPidSnapshot} from '../src/embedded_language.js';

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
    request:async()=>({ok:launches.length>=2}),
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
  assert.equal(configured[configured.indexOf('--threads')+1],'2');
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
    request:async()=>({ok:launches.length>=2}),
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
