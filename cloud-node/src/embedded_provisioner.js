import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, statfs } from 'node:fs/promises';
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
export const EMBEDDED_GGUF_MODELS=Object.freeze({
  'qwen3-q8':Object.freeze({
    filename:'Qwen3-0.6B-Q8_0.gguf',
    sha256:'9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031',
    url:'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf',
    minBytes:500*1024*1024,maxBytes:750*1024*1024,
    label:'Qwen3-0.6B Q8_0',
  }),
  'qwen3-q4-canary':Object.freeze({
    filename:'Qwen3-0.6B-Q4_K_M.gguf',
    sha256:'ac2d97712095a558e31573f62f466a3f9d93990898b0ec79d7c974c1780d524a',
    url:'https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',
    minBytes:300*1024*1024,maxBytes:600*1024*1024,
    label:'Qwen3-0.6B Q4_K_M (canary)',
  }),
});
export function selectEmbeddedModelVariant(value=''){
  return value==='qwen3-q4-canary'?'qwen3-q4-canary':'qwen3-q8';
}
const MIN_MEMORY = 1_500 * 1024 * 1024;
const MIN_FREE_DISK = 900 * 1024 * 1024;
const BUNDLED_STATIC_REVISION = 'b11425';

export function nativeProvisionSupported(platform=process.platform, arch=process.arch) {
  return platform==='linux' && Object.hasOwn(BUNDLES,arch);
}
export function allowedArtifactRedirect(value, type) {
  try {
    const url=new URL(value);
    if(url.protocol!=='https:' || url.username || url.password)return false;
    const name=url.hostname.toLowerCase();
    if(type==='binary') {
      return ['github.com','release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
        'github-production-release-asset-2e65be.s3.amazonaws.com'].includes(name)
        || name.endsWith('.githubusercontent.com');
    }
    // HF's signed Xet/LFS redirects use region-specific CDN and object-store
    // hosts. The pinned SHA-256 still authenticates the downloaded bytes.
    return name==='huggingface.co' || name.endsWith('.hf.co')
      || name.endsWith('.storage.googleapis.com')
      || name==='storage.googleapis.com';
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
async function chooseInstallDir({home=homedir(),cwd=process.cwd(),temp=tmpdir(),model=EMBEDDED_GGUF_MODELS['qwen3-q8']}={}){
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
      // Cached models need little extra disk; preserve them after deployment.
      const saved=await stat(join(folder,model.filename)).catch(()=>null);
      const cached=Boolean(saved && saved.size>model.minBytes && saved.size<model.maxBytes);
      if(disk && disk.bavail*disk.bsize < (cached ? 80*1024*1024
        :Math.min(MIN_FREE_DISK,model.maxBytes+90*1024*1024)))continue;
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
export async function hasLibraries(folder){
  // A symlink listed by tar does not prove that its target exists. In some
  // official llama.cpp releases, the SONAME links are dangling.
  let common=false, ggml=false;
  const queue=[{dir:folder,depth:0}];
  let scanned=0;
  while(queue.length && scanned<240 && !(common&&ggml)){
    const {dir,depth}=queue.shift();
    let entries=[];try{entries=await readdir(dir,{withFileTypes:true});}catch{}
    for(const entry of entries){
      if(++scanned>240)break;
      if(entry.isFile()){
        if(/^libllama-common\.so\.\d+(?:\.\d+)+$/.test(entry.name))common=true;
        if(/^libggml(?:-cpu)?\.so(?:\.\d+)*$/.test(entry.name))ggml=true;
      }else if(entry.isDirectory() && depth<6){
        queue.push({dir:join(dir,entry.name),depth:depth+1});
      }
    }
  }
  return common&&ggml;
}
async function fileSha256(filename){
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(filename))hash.update(chunk);
  return hash.digest('hex');
}

// Hostinger ZIP can carry a musl-linked standalone Linux server. There are
// no libllama-*.so dependencies. Verify its pinned archive digest before
// copying it to a writable executable cache outside Hostinger's hbuild.
export async function installBundledStaticServer(cache,{
  root=process.cwd(),platform=process.platform,arch=process.arch,
}={}){
  if(platform!=='linux'||arch!=='x64')return '';
  const dir=join(root,'native','linux-x64');
  const src=join(dir,'llama-server');
  const digestFile=join(dir,'llama-server.sha256');
  try {
    const item=await lstat(src);
    const expected=String(await readFile(digestFile,'utf8')).trim();
    if(!item.isFile()||!/^[0-9a-f]{64}$/.test(expected))
      throw new Error('embedded-static-manifest-invalid');
    if(await fileSha256(src)!==expected)
      throw new Error('embedded-static-sha256-mismatch');
    const destDir=join(cache,'standalone-musl-'+BUNDLED_STATIC_REVISION);
    await mkdir(destDir,{recursive:true,mode:0o700});
    const dest=join(destDir,'llama-server');
    const exists=await lstat(dest).catch(()=>null);
    if(!exists?.isFile()||await fileSha256(dest)!==expected){
      const partial=dest+'.partial-'+process.pid;
      try {
        await copyFile(src,partial);
        await chmod(partial,0o700);
        await rename(partial,dest);
      }finally{await rm(partial,{force:true}).catch(()=>{});}
    }
    await chmod(dest,0o700);
    await access(dest,1);
    return dest;
  } catch(error) {
    const message=String(error?.message||'');
    if(message.startsWith('embedded-static-'))throw error;
    if(error?.code==='ENOENT')return ''; // Previous ZIP without native payload.
    throw new Error('embedded-static-unavailable');
  }
}
async function streamChecked(url,destination,sha256,maxBytes,type,request){
  if(!allowedArtifactRedirect(url,type))throw new Error('embedded-untrusted-origin');
  const response=await request(url,{redirect:'follow',signal:AbortSignal.timeout(180000)});
  if(!response.ok || !response.body)throw new Error('embedded-download-http-'+response.status);
  if(!allowedArtifactRedirect(response.url,type)){
    const error=new Error('embedded-unsafe-redirect');
    try { error.redirectOrigin=new URL(response.url).hostname; } catch {}
    throw error;
  }
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
    this.modelVariant=selectEmbeddedModelVariant(
      settings.modelVariant??process.env.AURA_EMBEDDED_LANGUAGE_MODEL_VARIANT??'');
    this.model=EMBEDDED_GGUF_MODELS[this.modelVariant];
    this.inflight=null;this.paths=null;this.stage='not-started';this.lastError='';this.retryAfter=0;
    this.failedStage='';this.failureOrigin='';this.engineVariant='unselected';
    this.canaryRollbackAvailable=false;
  }
  get enabled(){
    return process.env.AURA_EMBEDDED_AUTOPROVISION_ENABLED!=='false'
      && nativeProvisionSupported();
  }
  snapshot(){
    return {enabled:this.enabled,stage:this.stage,error_code:this.lastError,
      failed_stage:this.failedStage,redirect_origin:this.failureOrigin,
      engine_variant:this.engineVariant,
      engine_revision:REVISION,model:this.model.label,
      model_variant:this.modelVariant,canary_rollback_available:this.canaryRollbackAvailable,
      no_paid_api:true,
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
      this.failedStage=this.stage;
      this.failureOrigin=String(error?.redirectOrigin||'').slice(0,96);
      this.stage='blocked';this.retryAfter=Date.now()+600000;
      return null;
    }).finally(()=>{this.inflight=null;});
    return this.inflight;
  }
  async #prepare(){
    const memory=await availableMemory();
    if(memory!==null && memory<MIN_MEMORY)throw new Error('embedded-insufficient-cgroup-memory');
    const modelSpec=this.model;
    const cache=await chooseInstallDir({...this.settings,model:modelSpec});
    const dest=join(cache,'llama-'+REVISION);
    const model=join(cache,modelSpec.filename);
    const binInfo=BUNDLES[process.arch];
    this.stage='locating-existing-install';
    const staticBinary=await installBundledStaticServer(cache);
    this.engineVariant=staticBinary?'musl-standalone':'glibc-dynamic';
    let binary=staticBinary||await locateFile(dest,'llama-server');
    let libs=Boolean(staticBinary)||(binary && await hasLibraries(dest));
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
    if(existing?.size>modelSpec.minBytes && existing.size<modelSpec.maxBytes){
      const sha=createHash('sha256');
      const {createReadStream}=await import('node:fs');
      for await(const part of createReadStream(model))sha.update(part);
      modelGood=sha.digest('hex')===modelSpec.sha256;
    }
    if(!modelGood){
      this.stage='downloading-open-model';
      const partial=model+'.partial-'+process.pid;
      try{
        await streamChecked(modelSpec.url,partial,modelSpec.sha256,
          modelSpec.maxBytes,'model',this.request);
        await rename(partial,model);
      }finally{await rm(partial,{force:true}).catch(()=>{});}
    }
    this.canaryRollbackAvailable=this.modelVariant==='qwen3-q4-canary'
      &&Boolean((await stat(join(cache,EMBEDDED_GGUF_MODELS['qwen3-q8'].filename)).catch(()=>null))
        ?.size>EMBEDDED_GGUF_MODELS['qwen3-q8'].minBytes);
    this.paths={executable:binary,gguf:model,binFound:true,modelFound:true,
      executableAllowed:true,installed:true};
    this.stage='installed-verified';this.lastError='';
    this.failedStage='';this.failureOrigin='';
    return this.paths;
  }
}
export const embeddedProvisioner=new EmbeddedProvisioner();
