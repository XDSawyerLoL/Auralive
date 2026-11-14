// Optional pre-trained sentence encoder. NO remote API, downloads or network
// fallback. Model assets and runtime must be operator-installed locally.
// Embeddings are semantic similarity evidence, NEVER truth or event occurrence.
import {statSync} from 'node:fs';
import {resolve} from 'node:path';

const MODEL='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const ACCEPTED_DTYPE=new Set(['q8','fp16']);
const tokenCount=s=>String(s).trim().split(/\s+/u).filter(Boolean).length;
export function encoderConfiguration(env=process.env){
 const enabled=env.AURA_LOCAL_ENCODER_ENABLED==='true';
 const root=String(env.AURA_LOCAL_ENCODER_ROOT||'').trim();
 const dtype=String(env.AURA_LOCAL_ENCODER_DTYPE||'q8');
 if(!enabled)return {enabled:false,ready:false,reason:'disabled'};
 if(!root||!root.startsWith('/')||root.includes('\0')||!ACCEPTED_DTYPE.has(dtype))
   return {enabled:true,ready:false,reason:'invalid-offline-configuration'};
 let bytes=0;
 try{
  // Check a real locally installed ONNX asset, not merely a model directory.
  // Reject symlinked models; deployment-specific administrator may review them.
  const relative=MODEL+'/onnx/model_'+(dtype==='q8'?'quantized':'fp16')+'.onnx';
  const file=resolve(root,relative);
  if(!file.startsWith(resolve(root)+'/'))throw Error('outside root');
  const stat=statSync(file,{throwIfNoEntry:true});
  if(!stat?.isFile()||stat.size<20_000_000||stat.size>600_000_000)
    throw Error('model asset invalid');
  bytes=stat.size;
 }catch{return {enabled:true,ready:false,reason:'model-assets-not-installed'};}
 return {enabled:true,ready:true,model:MODEL,dtype,root:resolve(root),
  model_bytes:bytes,remote_network:false};
}
export class NativeLocalSemanticEncoder{
 constructor({configuration=encoderConfiguration(),load=null}={}){
  this.config=configuration;
  this.load=load;
  this.model=null;
  this.status='not-initialized';
  this.failure='none';
 }
 diagnostic(){
  return {enabled:!!this.config.enabled,ready:this.status==='ready',
   model:this.config.model||MODEL,configured:!!this.config.ready,
   state:this.status,failure:this.failure,
   model_bytes:this.config.model_bytes||0,network_access:false,
   limitations:'similarity-only, no facts, no generative language'};
 }
 async initialize(){
  if(this.model)return true;
  if(!this.config.ready){this.status='disabled';this.failure=this.config.reason;return false;}
  try{
   let loader=this.load;
   if(!loader){
    // Installed separately from the main Hostinger runtime; leave its dependency
    // tree unchanged until the operator explicitly provisions CPU/memory.
    const pkg=await import('@huggingface/transformers');
    pkg.env.allowRemoteModels=false;
    pkg.env.localModelPath=this.config.root+'/';
    pkg.env.useBrowserCache=false;
    loader=async()=>pkg.pipeline('feature-extraction',MODEL,{
      device:'cpu',dtype:this.config.dtype,local_files_only:true
    });
   }
   const loaded=await loader();
   if(typeof loaded!=='function')throw Error('inference not callable');
   this.model=loaded;
   this.status='ready';this.failure='none';
   return true;
  }catch{
   this.model=null;this.status='unavailable';
   this.failure='offline-runtime-or-model-load-failed';
   return false;
  }
 }
 async embed(text){
  if(typeof text!=='string'||text.length<3||text.length>800||
     tokenCount(text)>96||!await this.initialize())return null;
  try{
   const result=await this.model(text,{pooling:'mean',normalize:true});
   const values=result?.data||result;
   if(!values||typeof values.length!=='number'||values.length!==384)return null;
   const array=Array.from(values,Number);
   if(array.some(x=>!Number.isFinite(x)))return null;
   const norm=Math.hypot(...array);
   if(!Number.isFinite(norm)||norm<0.0001)return null;
   return array.map(x=>x/norm);
  }catch{this.failure='offline-inference-failed';return null;}
 }
}
export function dotSimilarity(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||!a.length||a.length!==b.length||
   a.some(x=>!Number.isFinite(x))||b.some(x=>!Number.isFinite(x)))return null;
 const na=Math.hypot(...a),nb=Math.hypot(...b);
 if(na<1e-6||nb<1e-6)return null;
 return a.reduce((sum,x,i)=>sum+x*b[i],0)/(na*nb);
}
