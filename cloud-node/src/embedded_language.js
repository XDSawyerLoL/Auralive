import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';

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
  if (/enomem|out of memory|killed|bad_alloc/.test(reason))
    return { code: 'embedded-insufficient-memory',
      hint: 'La mémoire de cet hébergement ne suffit pas au modèle GGUF.' };
  return { code: 'embedded-engine-failed',
    hint: 'Le moteur intégré ne démarre pas. Examiner les journaux de l’hébergement.' };
}
export function llamaLoaderEnv(binary, original = process.env) {
  const dir = path.dirname(safePath(binary));
  const folders = [dir, path.join(dir,'lib'),path.join(dir,'lib64'),
    path.join(path.dirname(dir),'lib'),path.join(path.dirname(dir),'lib64')]
    .filter((v,i,a)=>a.indexOf(v)===i && fs.existsSync(v));
  return {...original,
    LD_LIBRARY_PATH:[...folders,...String(original.LD_LIBRARY_PATH || '').split(':').filter(Boolean)].join(':')};
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
    allocatePort=freePort,delay=pause,bootTimeoutMs=60_000}={}){
    Object.assign(this,{discover,spawnProcess,request,allocatePort,delay,bootTimeoutMs});
    this.child=null;this.port=0;this.booting=null;this.ready=false;
    this.lastFailure='';this.cooldownUntil=0;this.lastSuccessAt='';this.lastLatencyMs=0;
    this.cachedDiscovery=null;this.lastDiscoveryAt=0;
  }
  inspect(){
    if(this.cachedDiscovery && Date.now()-this.lastDiscoveryAt<5000)return this.cachedDiscovery;
    this.cachedDiscovery=this.discover();this.lastDiscoveryAt=Date.now();
    return this.cachedDiscovery;
  }
  installed(){
    return process.env.AURA_EMBEDDED_LANGUAGE_ENABLED!=='false' && this.inspect().installed;
  }
  status(){
    const item=this.inspect(),enabled=process.env.AURA_EMBEDDED_LANGUAGE_ENABLED!=='false';
    const failure=this.lastFailure?classifyEmbeddedFailure(this.lastFailure):null;
    return {version:'aura-llama-self-hosted-v1',enabled,installed:enabled&&item.installed,
      binary_found:item.binFound,model_found:item.modelFound,
      executable_allowed:item.executableAllowed,ready:this.ready,
      status:this.ready?'verified-responsive':!enabled?'disabled'
        :!item.binFound?'binary-missing':!item.modelFound?'gguf-missing'
          :!item.executableAllowed?'permission-denied':this.booting?'starting'
            :failure?'startup-failed':'available-not-started',
      failure_code:failure?.code||(!item.executableAllowed && item.binFound?'host-disallows-native-execution':''),
      setup_hint:failure?.hint||(!item.binFound?'Fournir AURA_EMBEDDED_LLAMA_BIN.'
        :!item.modelFound?'Fournir AURA_EMBEDDED_LANGUAGE_MODEL vers un GGUF local.'
          :!item.executableAllowed?'Le binaire présent ne peut pas être exécuté par Hostinger.':''),

      last_success_at:this.lastSuccessAt,last_latency_ms:this.lastLatencyMs,
      paid_model_api_required:false};
  }
  fail(error){
    this.ready=false;this.lastFailure=errorText(error);
    this.cooldownUntil=Date.now()+60_000;
  }
  async start(){
    if(this.ready && this.child?.exitCode===null)return true;
    if(this.booting)return this.booting;
    if(Date.now()<this.cooldownUntil || !this.installed())return false;
    this.booting=this.boot();
    try{return await this.booting;}finally{this.booting=null;}
  }
  async boot(){
    const {executable,gguf}=this.inspect();
    this.lastFailure='';this.port=await this.allocatePort();
    let child;
    try{
      child=this.spawnProcess(executable,[
        '-m',gguf,'--host','127.0.0.1','--port',String(this.port),
        '--ctx-size','2048','--threads',String(Math.max(1,Math.min(4,
          Number(process.env.AURA_EMBEDDED_LANGUAGE_THREADS)||2)))],
      {cwd:path.dirname(executable),env:llamaLoaderEnv(executable),
       stdio:['ignore','ignore','pipe'],shell:false});
    }catch(error){this.fail(error);return false;}
    this.child=child;
    let stderr='';
    child.stderr?.on('data',chunk=>{stderr=(stderr+String(chunk)).slice(-2200);});
    child.on('error',error=>this.fail(error));
    child.on('exit',code=>{
      if(this.child===child) this.fail(stderr||'embedded-engine-exited-'+code);
    });
    const deadline=Date.now()+this.bootTimeoutMs;
    while(Date.now()<deadline && this.child===child && child.exitCode===null && !this.lastFailure){
      try{
        const health=await this.request('http://127.0.0.1:'+this.port+'/health',{
          signal:AbortSignal.timeout(1500)});
        if(health.ok){this.ready=true;return true;}
      }catch{}
      await this.delay(400);
    }
    if(!this.ready){this.fail(stderr||'embedded-engine-startup-timeout');try{child.kill('SIGTERM');}catch{}}
    return this.ready;
  }
  async generate(prompt,system,maxTokens=600){
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
