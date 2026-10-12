import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, chmod, mkdir, readFile, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Pinned CPU-only public binaries and Apache-2.0 model: no billable API usage.
const REVISION = 'b11425';
const BUNDLES = Object.freeze({
  x64: {
    filename: 'llama-b11425-bin-ubuntu-x64.tar.gz',
    sha256: '6a47856d08ecc4030b2fa8b8bf761c96d142d689567f69a0f75e42de430dc34c',
  },
  arm64: {
    filename: 'llama-b11425-bin-ubuntu-arm64.tar.gz',
    sha256: '82b9804017436f624c1751f54a74469a879b16c8edcb721c4d68ef88d472af12',
  },
});
const MODEL = Object.freeze({
  filename: 'Qwen3-0.6B-Q8_0.gguf',
  sha256: '9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',
  url: 'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
});
const MIN_MEMORY = 1_500 * 1024 * 1024;
const MIN_FREE_DISK = 900 * 1024 * 1024;

export function nativeProvisionSupported(platform=process.platform, arch=process.arch) {
  return platform==='linux' && Object.hasOwn(BUNDLES,arch);
}
export function allowedArtifactRedirect(value, type) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:' || url.username || url.password)return false;
    const name=url.hostname.toLowerCase();
    if(type==='binary') return ['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(name);
    return name==='huggingface.co' || name==='cdn-lfs.hf.co' || name.endsWith('.xethub.hf.co');
  } catch { return false; }
}
export function noexecMount(folder, mountinfo='') {
  const absolute=resolve(folder);
  let match='',noexec=false;
  for(const line of String(mountinfo).split('\n')){
    const section=line.split(' - ')[0].split(' ');
    if(section.length<6)continue;
    const mount=section[4].replace(/\\040/g,' ').replace(/\\011/g,'\t');
    if(absolute!==mount && !absolute.startsWith(mount==='/'?'/':mount+'/'))continue;
    if(mount.length<=match.length)continue;
    match=mount;noexec=section[5].split(',').includes('noexec');
  }
  return match?noexec:null;
}
async function availableMemory(){
  for(const pathname of ['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory/memory.limit_in_bytes']){
    try{
      const value=Number((await readFile(pathname,'utf8')).trim());
      if(Number.isSafeInteger(value) && value>0 && value<1e15)return value;
    }catch{}
  }
  return null;
}
async function chooseInstallDir({home=homedir(),cwd=process.cwd(),temp=tmpdir()}={}){
  const requested=String(process.env.AURA_EMBEDDED_CACHE_DIR||'').trim();
  const candidates=requested?[resolve(requested)]:[
    join(home,'.cache','aura-language-runtime'),
    join(cwd,'.aura-language-runtime'),
    join(temp,'aura-language-runtime'),
  ];
  const mountinfo=await readFile('/proc/self/mountinfo','utf8').catch(()=>'');
  for(const folder of candidates){
    if(noexecMount(folder,mountinfo)===true)continue;
    try{
      await mkdir(folder,{recursive:true,mode:0o700});
      await access(folder,2);
      const disk=await statfs(folder).catch(()=>null);
      if(disk && disk.bavail * disk.bsize < MIN_FREE_DISK)continue;
      return folder;
    }catch{}
  }
  throw new Error('embedded-cache-unavailable-or-noexec');
}
async function locateFile(folder, filename, depth=0){
  if(depth>5)return '';
  let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch{return '';}
  for(const entry of entries){
    const dest=join(folder,entry.name);
    if(entry.name===filename && (entry.isFile()||entry.isSymbolicLink()))return dest;
    if(entry.isDirectory()){
      const child=await locateFile(dest,filename,depth+1);
      if(child)return child;
    }
  }
  return '';
}
async function hasLibraries(folder){
  let dirs=[];
  try{dirs=await readdir(folder,{withFileTypes:true});}catch{return false;}
  for(const entry of dirs){
    if((entry.isFile()||entry.isSymbolicLink()) && /^lib(?:llama|ggml).*\.so(?:\..*)?$/i.test(entry.name))return true;
    if(entry.isDirectory() && await hasLibraries(join(folder,entry.name)))return true;
  }
  return false;
}
async function streamChecked(url,destination,sha256,maxBytes,type,request){
  if(!allowedArtifactRedirect(url,type))throw new Error('embedded-untrusted-origin');
  const response=await request(url,{redirect:'follow',signal:AbortSignal.timeout(180000)});
  if(!response.ok || !response.body)throw new Error('embedded-download-http-'+response.status);
  if(!allowedArtifactRedirect(response.url,type))throw new Error('embedded-unsafe-redirect');
  let bytes=0;const hash=createHash('sha256');
  const guard=new Transform({
    transform(buffer,encoding,done){
      bytes+=buffer.length;
      if(bytes>maxBytes){done(new Error('embedded-download-too-large'));return;}
      hash.update(buffer);done(null,buffer);
    },
  });
  await pipeline(Readable.fromWeb(response.body),guard,createWriteStream(destination,{flags:'wx',mode:0o600}));
  if(hash.digest('hex')!==sha256)throw new Error('embedded-sha256-mismatch');
}
async function extractTar(archive,target,{spawnProcess=spawn}={}){
  return new Promise((ok,fail)=>{
    const child=spawnProcess('tar',['-xzf',archive,'-C',target,'--no-same-owner','--no-same-permissions'],
      {stdio:['ignore','ignore','pipe'],shell:false});
    let message='';child.stderr?.on('data',buffer=>{message=(message+String(buffer)).slice(-300);});
    child.once('error',fail);
    child.once('close',code=>code===0?ok():fail(new Error('embedded-tar-failed-'+code+' '+message)));
  });
}
export class EmbeddedProvisioner {
  constructor({request=fetch,spawnProcess=spawn,settings={}}={}){
    Object.assign(this,{request,spawnProcess,settings});
    this.inflight=null;this.paths=null;this.stage='not-started';this.lastError='';this.retryAfter=0;
  }
  get enabled(){
    return process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED!=='false'
      && nativeProvisionSupported();
  }
  snapshot(){
    return {enabled:this.enabled,stage:this.stage,error_code:this.lastError,
      engine_revision:REVISION,model:'Qwen3-0.6B Q8_0',no_paid_api:true,
      retry_after:this.retryAfter>Date.now()?new Date(this.retryAfter).toISOString():null};
  }
  async ensure(){
    if(!this.enabled)return null;
    if(this.paths)return this.paths;
    if(this.inflight)return this.inflight;
    if(this.retryAfter>Date.now())return null;
    this.inflight=this.#prepare().catch(error=>{
      // Only stable error codes; no absolute paths, internal URLs or secrets.
      this.lastError=String(error?.message||error).split(':')[0].slice(0,100);
      this.stage='blocked';this.retryAfter=Date.now()+600000;
      return null;
    }).finally(()=>{this.inflight=null;});
    return this.inflight;
  }
  async #prepare(){
    const memory=await availableMemory();
    if(memory!==null && memory<MIN_MEMORY)throw new Error('embedded-insufficient-cgroup-memory');
    const cache=await chooseInstallDir(this.settings);
    const dest=join(cache,'llama-'+REVISION);
    const model=join(cache,MODEL.filename);
    const binInfo=BUNDLES[process.arch];
    this.stage='locating-existing-install';
    let binary=await locateFile(dest,'llama-server');
    let libs=binary && await hasLibraries(dest);
    if(!binary || !libs){
      this.stage='downloading-cpu-runtime';
      const archive=join(cache,binInfo.filename+'.partial-'+process.pid);
      const staging=join(cache,'llama-'+REVISION+'-staging-'+process.pid);
      try{
        await mkdir(staging,{recursive:true,mode:0o700});
        await streamChecked('https://github.com/ggml-org/llama.cpp/releases/download/'+REVISION+'/'+binInfo.filename,
          archive,binInfo.sha256,110*1024*1024,'binary',this.request);
        this.stage='extracting-cpu-runtime';
        await extractTar(archive,staging,{spawnProcess:this.spawnProcess});
        binary=await locateFile(staging,'llama-server');
        libs=await hasLibraries(staging);
        if(!binary || !libs)throw new Error('embedded-cpu-release-incomplete');
        await rm(dest,{force:true,recursive:true});
        await rename(staging,dest);
      } finally {
        await rm(archive,{force:true}).catch(()=>{});
        await rm(staging,{force:true,recursive:true}).catch(()=>{});
      }
      binary=await locateFile(dest,'llama-server');
    }
    if(!binary)throw new Error('embedded-binary-missing');
    await chmod(binary,0o700);
    let modelGood=false;
    const existing=await stat(model).catch(()=>null);
    if(existing?.size>500*1024*1024 && existing.size<750*1024*1024){
      const sha=createHash('sha256');
      const {createReadStream}=await import('node:fs');
      for await(const part of createReadStream(model))sha.update(part);
      modelGood=sha.digest('hex')===MODEL.sha256;
    }
    if(!modelGood){
      this.stage='downloading-open-model';
      const partial=model+'.partial-'+process.pid;
      try{
        await streamChecked(MODEL.url,partial,MODEL.sha256,
          750*1024*1024,'model',this.request);
        await rename(partial,model);
      }finally{await rm(partial,{force:true}).catch(()=>{});}
    }
    this.paths={executable:binary,gguf:model,binFound:true,modelFound:true,executableAllowed:true,installed:true};
    this.stage='installed-verified';this.lastError='';
    return this.paths;
  }
}
export const embeddedProvisioner=new EmbeddedProvisioner();
