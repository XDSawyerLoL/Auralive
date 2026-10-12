import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { embeddedProvisioner } from './embedded_provisioner.js';

// Canonical optional on-host GGUF runtime. No shell, remote model API, downloads or tokens.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errorText = e => String(e?.message || e || '').slice(0, 2500);
const safePath = value => path.resolve(String(value || ''));
export function classifyEmbeddedFailure(error) {
  const reason = errorText(error).toLowerCase();
  if (/eacces|eperm|permission denied|noexec|operation not permitted/.test(reason))
    return { code: 'host-disallows-native-execution',
      hint: 'Hostinger refuse le processus natif (EACCES/EPERM). Changer LD_LIBRARY_PATH ne peut pas lever cette restriction.' };
  if (/libllama-common\.so|libggml.*\.so|libllama\.so|error while loading shared libraries|cannot open shared object file/.test(reason))
    return { code: 'embedded-shared-library-unresolved',
      hint: 'Une bibliothèque llama.cpp est introuvable : fournir les .so et les liens symboliques versionnés, avec LD_LIBRARY_PATH adapté.' };
  if (/exec format|enoexec|glibc|wrong elf class/.test(reason))
    return { code: 'embedded-incompatible-binary',
      hint: 'Le binaire llama-server est incompatible avec le système Linux de cet hébergement.' };
  if (/sigkill|exit.signal.sigkill|enomem|out of memory|killed|bad.alloc|cannot allocate memory|failed to allocate|oom.kill|exit.code.137/i.test(reason))
    return { code: 'embedded-insufficient-memory',
      hint: 'Le processus a probablement dépassé la mémoire disponible. AURA tente un contexte et des lots plus petits.' };
  if (/sigill|illegal instruction|exit.signal.sigill/.test(reason))
    return {code:'embedded-cpu-instruction-unsupported',
      hint:'Le processeur Hostinger ne prend pas en charge une instruction du binaire (SIGILL).'};
  if (/sigsegv|segmentation fault|exit.signal.sigsegv/.test(reason))
    return {code:'embedded-native-segfault',
      hint:'Le moteur natif a rencontré une erreur mémoire (SIGSEGV) pendant son lancement.'};
  if (/invalid.gguf|invalid magic|unknown architecture|unsupported model|failed to load model|error loading model|llama_model_load|model_load.*failed|gguf_init_from_file.*failed/.test(reason))
    return {code:'embedded-model-load-failed',
      hint:'llama.cpp ne parvient pas à charger le modèle GGUF. Vérifier le modèle et la compatibilité du moteur.'};
  if (/unrecognized argument|invalid argument|unknown option|invalid value for|error parsing arguments/.test(reason))
    return {code:'embedded-unsupported-startup-option',
      hint:'Un argument de démarrage est refusé par la version installée de llama.cpp.'};
  if (/eaddrinuse|failed to bind|address already in use/.test(reason))
    return {code:'embedded-loopback-port-in-use',
      hint:'Le port local du moteur est déjà occupé sur Hostinger.'};
  if (/startup.timeout|timeout waiting for health/.test(reason))
    return {code:'embedded-startup-timeout',
      hint:'Le modèle ne devient pas disponible avant le délai de démarrage.'};
  const match=reason.match(/embedded-engine-exited-(\d{1,3})/);
  if(match)return {code:'embedded-process-exit-'+match[1],
    hint:'Le processus llama.cpp s’arrête avec le code '+match[1]+'. Le diagnostic natif donne son étape et ses signaux.'};
  return { code: 'embedded-engine-failed',
    hint: 'Le moteur s’arrête sans raison classifiée. Consulter les signaux et le code de sortie sur /api/language/embedded/status.' };
}
// The pinned upstream tarball can contain broken SONAME symlinks. Never
// modify other applications; inspect only AURA-managed runtime directories.
const nativeLibraryName = /^lib(?:llama|ggml|mtmd)[a-z0-9_.-]*\.so(?:\.\d+)*$/i;

function managedNativeRoot(binary) {
  const full = safePath(binary).replace(/\\/g, '/');
  for (const marker of ['/.aura-language-runtime/', '/aura-language-runtime/']) {
    const pos = full.indexOf(marker);
    if (pos >= 0) return path.resolve(full.slice(0, pos + marker.length - 1));
  }
  return '';
}

function nativeLibraryDirs(binary) {
  const binDir = path.dirname(safePath(binary));
  const managed = managedNativeRoot(binary);
  // For manually configured binary locations, keep conventional sibling paths.
  if (!managed) {
    const parent = path.dirname(binDir);
    const dirs = [binDir, path.join(binDir, 'lib'), path.join(binDir, 'lib64'),
      path.join(parent, 'lib'), path.join(parent, 'lib64')];
    let children = [];
    try { children = fs.readdirSync(parent, { withFileTypes: true }); } catch {}
    for (const child of children.slice(0, 80)) {
      if (!child.isDirectory() || /^(?:node_modules|\.git)$/i.test(child.name)) continue;
      const folder = path.join(parent, child.name);
      dirs.push(folder, path.join(folder, 'lib'), path.join(folder, 'lib64'));
    }
    return dirs.filter(folder => fs.existsSync(folder));
  }
  const visited = new Set();
  const matches = [];
  const queue = [{ dir: managed, depth: 0 }];
  while (queue.length && visited.size < 180) {
    const { dir, depth } = queue.shift();
    if (visited.has(dir) || (dir !== managed && !dir.startsWith(managed + path.sep))) continue;
    visited.add(dir);
    let stat;
    try { stat = fs.lstatSync(dir); } catch { continue; }
    if (!stat.isDirectory()) continue; // Never traverse a symlink to another directory.
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    if (dir === binDir || items.some(x => nativeLibraryName.test(x.name))) matches.push(dir);
    if (depth >= 6) continue;
    for (const item of items.slice(0, 220)) {
      if (!item.isDirectory() || /^(?:node_modules|\.git|cache|models)$/i.test(item.name)) continue;
      queue.push({ dir: path.join(dir, item.name), depth: depth + 1 });
    }
  }
  if (!matches.includes(binDir) && fs.existsSync(binDir)) matches.unshift(binDir);
  return matches;
}

export function llamaLoaderEnv(binary, original = process.env) {
  const folders = nativeLibraryDirs(binary);
  return { ...original, LD_LIBRARY_PATH: [
    ...folders, ...String(original.LD_LIBRARY_PATH || '').split(':').filter(Boolean),
  ].filter((v, i, all) => all.indexOf(v) === i).join(':') };
}

// Repair both the bare .so and every SONAME link (.so.0, .so.0.N, ...),
// including dangling links whose targets were corrupted in upstream tar files.
export function repairLlamaLibraryAliases(binary) {
  if (!managedNativeRoot(binary)) return [];
  const changed = [];
  for (const dir of nativeLibraryDirs(binary)) {
    let names;
    try { names = fs.readdirSync(dir).filter(name => nativeLibraryName.test(name)); }
    catch { continue; }
    const realFiles = names.filter(name => {
      try { return fs.lstatSync(path.join(dir, name)).isFile(); }
      catch { return false; }
    });
    const links = names.filter(name => {
      try { return fs.lstatSync(path.join(dir, name)).isSymbolicLink(); }
      catch { return false; }
    });
    const desired = new Set(links);
    for (const name of realFiles) {
      const version = name.match(/^(lib(?:llama|ggml|mtmd)[a-z0-9_.-]*\.so)\.(\d+)\.(\d+(?:\.\d+)*)$/i);
      if (version) {
        desired.add(version[1]);
        desired.add(version[1] + '.' + version[2]);
      }
    }
    for (const alias of [...desired].sort((x, y) => y.length - x.length)) {
      const aliasFile = path.join(dir, alias);
      try { if (fs.statSync(aliasFile).isFile()) continue; } catch {}
      // Only use a real, adjacent file from the verified release. No external
      // paths, no symlink chains, and no unexpected lib names.
      const target = realFiles.filter(name => name.startsWith(alias + '.'))
        .sort((x, y) => x.length - y.length || x.localeCompare(y))[0];
      if (!target) continue;
      try {
        try {
          if (fs.lstatSync(aliasFile).isSymbolicLink()) fs.unlinkSync(aliasFile);
          else continue; // Existing real files or directories are protected.
        } catch (error) { if (error?.code !== 'ENOENT') continue; }
        fs.symlinkSync(target, aliasFile);
        if (fs.statSync(aliasFile).isFile()) changed.push(alias);
      } catch { /* Host restrictions remain visible as startup failures. */ }
    }
  }
  return changed;
}

// Public path-free facts; presence of GGUF is not evidence of working inference.
export function nativeLibraryHealth(binary) {
  const dirs = managedNativeRoot(binary) ? nativeLibraryDirs(binary) : [];
  const names = new Set();
  const dangling = [];
  for (const dir of dirs) {
    let files = [];
    try { files = fs.readdirSync(dir).filter(n => nativeLibraryName.test(n)); } catch {}
    for (const name of files) {
      try {
        if (fs.statSync(path.join(dir, name)).isFile()) names.add(name);
      } catch {
        try {
          if (fs.lstatSync(path.join(dir, name)).isSymbolicLink()) dangling.push(name);
        } catch {}
      }
    }
  }
  const present = [...names];
  return { library_directories: dirs.length, library_files: present.length,
    dangling_links: [...new Set(dangling)].slice(0, 16),
    common_soname_found: present.some(n => /^libllama-common\.so\.0$/.test(n)),
  };
}
// Explicit loader launch is a controlled fallback if a managed host filters
// LD_LIBRARY_PATH. Never run through a shell or a downloaded interpreter.
export function systemElfLoader(arch=process.arch, platform=process.platform) {
  if (platform !== 'linux') return '';
  const choices=arch==='x64'
    ? ['/lib64/ld-linux-x86-64.so.2','/lib/x86_64-linux-gnu/ld-linux-x86-64.so.2']
    : arch==='arm64'
      ? ['/lib/ld-linux-aarch64.so.1','/lib/aarch64-linux-gnu/ld-linux-aarch64.so.1']
      : [];
  for (const pathname of choices) {
    try { if (fs.statSync(pathname).isFile()) return pathname; } catch {}
  }
  return '';
}

export function nativeLaunchSpec(executable, args=[], useElfLoader=false) {
  const env=llamaLoaderEnv(executable);
  const loader=useElfLoader ? systemElfLoader() : '';
  if (useElfLoader && !loader) return null;
  return loader
    ? {command:loader,args:['--library-path',env.LD_LIBRARY_PATH,executable,...args],env,mode:'system-elf-loader'}
    : {command:executable,args,env,mode:'direct'};
}

// Path-free, token-free operational diagnostics. Never expose stderr, model
// prompts, file paths, environment variables or downloaded URL tokens.
export function embeddedLogSignals(stderr=''){
  const source=String(stderr).toLowerCase();
  const patterns=[
    ['memory-allocation-failed',/out of memory|failed to allocate|bad.alloc|cannot allocate memory|oom/i],
    ['model-loader-failed',/failed to load model|error loading model|llama_model_load|gguf_init_from_file|unknown architecture/i],
    ['unsupported-argument',/unknown option|unrecognized argument|invalid argument|invalid value for/i],
    ['cpu-instruction',/illegal instruction|sigill/i],
    ['network-bind',/failed to bind|address already in use|eaddrinuse/i],
    ['unsupported-syscall',/operation not permitted|seccomp|unsupported syscall/i],
    ['thread-create-failed',/pthread_create|cannot create thread|resource temporarily unavailable/i],
    ['model-file-open-failed',/failed to open|cannot open model|model file not found/i],
  ];
  return patterns.filter(([,re])=>re.test(source)).map(([name])=>name);
}
export function cgroupMemorySnapshot({
  read=fs.readFileSync,
}={}){
  const num=(p)=>{
    try{
      const v=String(read(p,'utf8')).trim();
      if(v==='max')return null;
      const n=Number(v);return Number.isSafeInteger(n)&&n>=0&&n<1e15?n:null;
    }catch{return null;}
  };
  const mb=(n)=>n===null?null:Math.round(n/1048576);
  const events=(()=>{
    try{
      const lines=String(read('/sys/fs/cgroup/memory.events','utf8')).split('\n');
      const result={};
      for(const line of lines){const [key,v]=line.trim().split(/\s+/);if(['oom','oom_kill'].includes(key))result[key]=Number(v)||0;}
      return result;
    }catch{return {};}
  })();
  return {limit_mb:mb(num('/sys/fs/cgroup/memory.max')??num('/sys/fs/cgroup/memory/memory.limit_in_bytes')),
    current_mb:mb(num('/sys/fs/cgroup/memory.current')??num('/sys/fs/cgroup/memory/memory.usage_in_bytes')),
    oom_events:events.oom??null,oom_kills:events.oom_kill??null};
}
export function nativeBootArgs(gguf, port, {lowMemory=false,threads=2}={}){
  const context=lowMemory?768:2048;
  return ['-m',gguf,'--host','127.0.0.1','--port',String(port),
    '--ctx-size',String(context),'--threads',String(Math.max(1,Math.min(4,Number(threads)||2))),
    '--parallel','1','--batch-size',lowMemory?'32':'96',
    '--ubatch-size',lowMemory?'16':'48','--no-warmup'];
}

export function locateEmbeddedRuntime({
  root = process.cwd(), home = process.env.HOME || '',
  binary = process.env.AURA_EMBEDDED_LLAMA_BIN || '',
  model = process.env.AURA_EMBEDDED_LANGUAGE_MODEL || '',
} = {}) {
  let executable = binary ? safePath(binary) : '';
  let gguf = model ? safePath(model) : '';
  const candidates=[path.join(root,'.aura-language-runtime'),
    path.join(root,'aura-language-runtime'),
    ...(home ? [path.join(home,'.aura-language-runtime')] : [])];
  const queue=candidates.filter(fs.existsSync).map(dir=>({dir,depth:0}));
  let scanned=0;
  while (queue.length && scanned<300 && (!executable || !gguf)) {
    const {dir,depth}=queue.shift();
    let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true});}catch{}
    for(const entry of entries){
      if (++scanned>300) break;
      const full=path.join(dir,entry.name);
      if(entry.isDirectory() && depth<5 && !/node_modules|cache|\.git/i.test(entry.name)){
        queue.push({dir:full,depth:depth+1});
      }else if(entry.isFile() || entry.isSymbolicLink()){
        if(!executable && entry.name==='llama-server') executable=full;
        if(!gguf && /\.gguf$/i.test(entry.name)) gguf=full;
      }
    }
  }
  const binFound=Boolean(executable && fs.existsSync(executable));
  const modelFound=Boolean(gguf && fs.existsSync(gguf));
  let executableAllowed=false;
  if(binFound)try{fs.accessSync(executable,fs.constants.X_OK);executableAllowed=true;}catch{}
  return {executable,gguf,binFound,modelFound,executableAllowed,
    installed:binFound && modelFound && executableAllowed};
}
function freePort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.on('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const port=server.address().port;
      server.close(error=>error?reject(error):resolve(port));
    });
  });
}
export class EmbeddedLanguageRuntime {
  constructor({discover=locateEmbeddedRuntime,spawnProcess=spawn,request=fetch,
    allocatePort=freePort,delay=pause,bootTimeoutMs=150_000,
    provisioner=discover===locateEmbeddedRuntime ? embeddedProvisioner : null}={}){
    Object.assign(this,{discover,spawnProcess,request,allocatePort,delay,bootTimeoutMs,provisioner});
    this.provisionedPaths=null;this.canonicalSource=false;
    this.child=null;this.port=0;this.booting=null;this.ready=false;
    this.lastFailure='';this.cooldownUntil=0;this.lastSuccessAt='';this.lastLatencyMs=0;
    this.cachedDiscovery=null;this.lastDiscoveryAt=0;
    this.repairedLibraryAliases=[];
    this.launchMode='not-started';
    this.bootProfile='standard';this.lastProcessExit={code:null,signal:null};
    this.lastLogSignals=[];this.failureStage='';this.memoryAtBoot=null;
    this.memoryAfterFailure=null;this.lastOomKillDelta=null;
  }
  inspect(){
    if(this.provisionedPaths)return this.provisionedPaths;
    if(this.cachedDiscovery && Date.now()-this.lastDiscoveryAt<5000)return this.cachedDiscovery;
    this.cachedDiscovery=this.discover();this.lastDiscoveryAt=Date.now();
    return this.cachedDiscovery;
  }
  canProvision(){
    return Boolean(this.provisioner?.enabled
      && (process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED==='true'
        || (process.env.NODE_ENV==='production' && process.env.CI!=='true')));
  }
  installed(){
    const found=this.inspect();
    // Installed means binary and model detected, even if the archive lost +x.
    return process.env.AURA_EMBEDDED_LANGUAGE_ENABLED!=='false'
      && Boolean(found.binFound && found.modelFound);
  }
  repairExecutable(){
    const item=this.inspect();
    if(!item.binFound)return false;
    if(item.executableAllowed)return true;
    const filename=safePath(item.executable).replace(/\\/g,'/');
    // Never chmod binaries outside AURA's own runtime directories.
    if(!filename.includes('/.aura-language-runtime/')
      && !filename.includes('/aura-language-runtime/'))return false;
    try{
      const current=fs.statSync(item.executable).mode;
      fs.chmodSync(item.executable,current|0o100);
      fs.accessSync(item.executable,fs.constants.X_OK);
      this.cachedDiscovery=null;
      return true;
    }catch(error){this.fail(error);return false;}
  }
  status(){
    const item=this.inspect(),enabled=process.env.AURA_EMBEDDED_LANGUAGE_ENABLED!=='false';
    const failure=this.lastFailure?classifyEmbeddedFailure(this.lastFailure):null;
    return {version:'aura-llama-self-hosted-v1',enabled,installed:enabled&&item.installed,
      binary_found:item.binFound,model_found:item.modelFound,
      executable_allowed:item.executableAllowed,ready:this.ready,
      status:this.ready ? (this.lastSuccessAt ? 'verified-responsive' : 'model-loaded-unverified')
        :!enabled?'disabled'
        :!item.binFound?'binary-missing':!item.modelFound?'gguf-missing'
          :!item.executableAllowed?'permission-denied':this.booting?'starting'
            :failure?'startup-failed':'available-not-started',
      failure_code:failure?.code||(!item.executableAllowed && item.binFound?'host-disallows-native-execution':''),
      setup_hint:failure?.hint||(!item.binFound?'Fournir AURA_EMBEDDED_LLAMA_BIN.'
        :!item.modelFound?'Fournir AURA_EMBEDDED_LANGUAGE_MODEL vers un GGUF local.'
          :!item.executableAllowed?'Le binaire présent ne peut pas être exécuté par Hostinger.':''),

      last_success_at:this.lastSuccessAt,last_latency_ms:this.lastLatencyMs,
      provisioning:this.provisioner?.snapshot?.() || {enabled:false},
      repaired_library_aliases:this.repairedLibraryAliases.slice(0,20),
      native_library_health: item.binFound ? nativeLibraryHealth(item.executable) : null,
      launch_mode:this.launchMode,
      boot_profile:this.bootProfile,
      process_exit:this.lastProcessExit,
      failure_stage:this.failureStage,
      log_signals:this.lastLogSignals,
      resource_before_start:this.memoryAtBoot,
      resource_after_failure:this.memoryAfterFailure,
      oom_kills_during_start:this.lastOomKillDelta,
      paid_model_api_required:false};
  }
  fail(error){
    this.ready=false;this.lastFailure=errorText(error);
    this.memoryAfterFailure=cgroupMemorySnapshot();
    if(this.memoryAtBoot?.oom_kills!==null && this.memoryAtBoot?.oom_kills!==undefined
      && this.memoryAfterFailure.oom_kills!==null)
      this.lastOomKillDelta=Math.max(0,this.memoryAfterFailure.oom_kills-this.memoryAtBoot.oom_kills);
    if(this.lastOomKillDelta>0)
      this.lastFailure+=' out of memory embedded-cgroup-oom-kill';
    this.cooldownUntil=Date.now()+60_000;
  }
  async start(){
    if(this.ready && this.child?.exitCode===null)return true;
    if(this.booting)return this.booting;
    if(Date.now()<this.cooldownUntil)return false;
    const hasInstallation=this.installed();
    const unresolvedLibraries=this.lastFailure
      && classifyEmbeddedFailure(this.lastFailure).code==='embedded-shared-library-unresolved';
    const needsCanonical = this.canProvision()
      && (!hasInstallation || (unresolvedLibraries && !this.canonicalSource));
    if(!hasInstallation && !needsCanonical)return false;
    this.booting=needsCanonical ? this.installAndBoot() : this.bootWithExecutable();
    try{return await this.booting;}
    catch(error){this.fail(error);return false;}
    finally{this.booting=null;}
  }
  async installAndBoot(){
    const result=await this.provisioner.ensure();
    if(!result){
      this.fail(this.provisioner.snapshot().error_code || 'embedded-installation-unavailable');
      return false;
    }
    this.provisionedPaths=result;
    this.canonicalSource=true;
    this.cooldownUntil=0;
    this.lastFailure='';
    return this.bootWithExecutable();
  }
  async bootWithExecutable(){
    if(!this.repairExecutable())return false;
    this.repairedLibraryAliases=repairLlamaLibraryAliases(this.inspect().executable);
    let success=await this.boot();
    if(success)return true;
    // Reduce model memory requirements for process OOM, SIGKILL or a stalled
    // first warmup. No recursive retry loops or background orphan servers.
    const firstFailure=classifyEmbeddedFailure(this.lastFailure).code;
    if(['embedded-insufficient-memory','embedded-startup-timeout'].includes(firstFailure)){
      this.cooldownUntil=0;
      success=await this.boot(false,true);
      if(success)return true;
    }
    if(classifyEmbeddedFailure(this.lastFailure).code!=='embedded-shared-library-unresolved'
      || !systemElfLoader())return false;
    // Fallback for dynamic ELF binaries only; a standalone musl binary
    // normally does not need or support the host's glibc interpreter.
    this.cooldownUntil=0;
    return this.boot(true);
  }
  async boot(useElfLoader=false,lowMemory=false){
    const {executable,gguf}=this.inspect();
    this.lastFailure='';this.port=await this.allocatePort();
    this.lastProcessExit={code:null,signal:null};this.lastLogSignals=[];
    this.failureStage='spawning-native-server';
    this.bootProfile=lowMemory?'low-memory':'standard';
    this.memoryAtBoot=cgroupMemorySnapshot();
    this.memoryAfterFailure=null;this.lastOomKillDelta=null;
    let child;
    try{
      const spec=nativeLaunchSpec(executable,nativeBootArgs(gguf,this.port,{
        lowMemory,threads:Number(process.env.AURA_EMBEDDED_LANGUAGE_THREADS)||2,
      }),useElfLoader);
      if(!spec)throw new Error('embedded-system-loader-unavailable');
      this.launchMode=spec.mode;
      child=this.spawnProcess(spec.command,spec.args,
        {cwd:path.dirname(executable),env:spec.env,
         stdio:['ignore','ignore','pipe'],shell:false});
    }catch(error){this.fail(error);return false;}
    this.child=child;
    let stderr='';
    child.stderr?.on('data',chunk=>{
      stderr=(stderr+String(chunk)).slice(-4000);
      this.lastLogSignals=embeddedLogSignals(stderr);
    });
    child.on('error',error=>{
      if(this.child===child){
        this.failureStage='native-spawn-error';this.fail(error);
      }
    });
    child.on('exit',(code,signal)=>{
      if(this.child===child){
        this.lastProcessExit={code:code??null,signal:signal??null};
        if(this.lastFailure && signal==='SIGTERM')return;
        this.failureStage='native-process-exit';
        this.fail((stderr||'embedded-engine-exited-'+code)
          +(signal?' exit.signal.'+signal.toLowerCase():'')
          +(code===137?' exit.code.137':''));
      }
    });
    const deadline=Date.now()+this.bootTimeoutMs;
    this.failureStage='waiting-model-health';
    while(Date.now()<deadline && this.child===child && child.exitCode===null
      && child.signalCode===null && !this.lastFailure){
      try{
        const health=await this.request('http://127.0.0.1:'+this.port+'/health',{
          signal:AbortSignal.timeout(1500)});
        if(health.ok){this.ready=true;this.failureStage='';return true;}
      }catch{}
      await this.delay(400);
    }
    if(!this.ready && !this.lastFailure){
      this.failureStage='health-timeout';
      this.fail((stderr||'')+' embedded-engine-startup-timeout');
    }
    if(!this.ready)try{child.kill('SIGTERM');}catch{}
    return this.ready;
  }
  async generate(prompt,system,maxTokens=600){
    // Initial model installation may transfer hundreds of MB. Do not keep a
    // public chat request open until the first download finishes.
    if(this.booting && !this.ready)return '';
    if(!this.installed() && this.canProvision()){
      void this.start().catch(error=>this.fail(error));
      return '';
    }
    if(!await this.start())return '';
    const started=Date.now();
    try{
      const response=await this.request('http://127.0.0.1:'+this.port+'/v1/chat/completions',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({model:'local',stream:false,temperature:0.6,
          max_tokens:Math.max(64,Math.min(1024,Number(maxTokens)||600)),messages:[
            {role:'system',content:String(system).slice(0,9000)},
            {role:'user',content:String(prompt).slice(0,14000)}]}),
        signal:AbortSignal.timeout(90_000)});
      if(!response.ok)throw Error('embedded HTTP '+response.status);
      const json=await response.json();
      const answer=String(json?.choices?.[0]?.message?.content||'').trim();
      if(!answer)throw Error('embedded-empty-response');
      this.lastSuccessAt=new Date().toISOString();this.lastLatencyMs=Date.now()-started;
      this.lastFailure='';return answer;
    }catch(error){
      this.fail(error);
      try{if(this.child?.exitCode===null)this.child.kill('SIGTERM');}catch{}
      return '';
    }
  }
}
export const embeddedLanguageRuntime=new EmbeddedLanguageRuntime();
