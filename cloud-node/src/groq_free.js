// Groq Free Plan — opt-in, pinned HTTPS endpoint, no billable upgrade.
// Requires the operator to confirm the actual organization is STILL on Free.
// Free tier quotas depend on Groq and can change independently of AURA.
// Documentation: https://console.groq.com/docs/rate-limits
import {config, databaseConfigured} from './config.js';
import {one,query} from './db.js';

export const GROQ_FREE_MODELS=Object.freeze([
 'qwen/qwen3.8-27b',
 'openai/gpt-oss-120b',
 'openai/gpt-oss-20b',
]);
const ENDPOINT='https://api.groq.com/openai/v1/chat/completions';
const MAX_PARALLEL=1;
const memoryDaily=new Map();
const safe=(x)=>String(x?.message||x||'')
 .replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]')
 .replace(/\b(?:gsk_|sk-)[A-Za-z0-9_-]{12,}\b/g,'[REDACTED]')
 .replace(/\s+/g,' ').trim().slice(0,170);
const utc=()=>new Date().toISOString().slice(0,10);
export function validateGroqFreeModel(model){
 return GROQ_FREE_MODELS.includes(String(model||'').trim());
}
export function groqVisibleAnswer(payload){
 const msg=payload?.choices?.[0]?.message||{};
 if(typeof msg.content==='string')return msg.content.trim();
 if(Array.isArray(msg.content))
  return msg.content.filter(p=>p?.type==='text'||p?.type==='output_text')
   .map(p=>String(p.text||'')).join('\n').trim();
 return '';
}
export function terminalGroqError(error){
 const s=safe(error).toLowerCase();
 return /\bhttp\s*(401|402|403|429)\b/.test(s)
  || /(?:quota|rate[._ -]?limit|budget)[._ -]?(?:exhausted|exceeded|reached|limit)/.test(s)
  || /(?:insufficient|negative)[._ -]?(?:balance|credits?)/.test(s)
  || /(?:billing|payment[._ -]?required|unauthori[sz]ed|invalid[._ -]?api[._ -]?key)/.test(s)
  || /(?:daily[._ -]?cap|cooldown)[._ -]?(?:reached|active)/.test(s);
}
export function groqFreeBody(model,prompt,system,maxTokens=700){
 if(!validateGroqFreeModel(model))throw Error('Groq model not on current Free allowlist');
 const isQwen=model.startsWith('qwen/');
 return {
  model,
  messages:[
   {role:'system',content:String(system||'').slice(0,3200)},
   {role:'user',content:String(prompt||'').slice(0,9000)},
  ],
  temperature:0.45,
  max_completion_tokens:Math.max(256,Math.min(1400,Number(maxTokens)||700)),
  stream:false,
  // Qwen 3.8 can disable hidden reasoning entirely; GPT-OSS cannot.
  reasoning_effort:isQwen?'none':'low',
  include_reasoning:false,
 };
}
export class GroqFreeProvider{
 constructor({fetchFn=fetch}={}){
  this.fetchFn=fetchFn;
  this.inFlight=0;
  this.lastError='';
  this.lastModel='';
  this.lastLatencyMs=0;
  this.lastStatus='not-tested';
  this.cooldownUntil=0;
  this.recentRequests=[];
 }
 get enabled(){
  return Boolean(config.zeroCostMode && config.groqFreeEnabled
    && config.groqFreePlanConfirmed && config.groqApiKey
    && validateGroqFreeModel(config.groqFreeModel));
 }
 snapshot(){
  const key=utc();
  return {
   enabled:this.enabled,
   provider:'groq-free',
   endpoint_verified:true,
   free_plan_operator_confirmed:Boolean(config.groqFreePlanConfirmed),
   api_key_configured:Boolean(config.groqApiKey),
   model:validateGroqFreeModel(config.groqFreeModel)?config.groqFreeModel:'blocked-model',
   daily_cap:config.groqFreeMaxRequestsPerDay,
   process_requests_today:Number(memoryDaily.get(key)||0),
   cooldown_until:this.cooldownUntil>Date.now()?new Date(this.cooldownUntil).toISOString():null,
   last_model:this.lastModel,
   last_status:this.lastStatus,
   last_error:this.lastError,
   last_latency_ms:this.lastLatencyMs,
   financially_guarded:'explicit-Free-plan-confirmation;no-paid-upgrade;fixed-Groq-host;model-allowlist',
   caution:'Confirm the Groq organization is on its FREE plan. Never enable if billing is activated.',
  };
 }
 async #reserve(){
  if(!this.enabled)throw Error('Groq Free disabled: confirm plan and key');
  if(this.inFlight>=MAX_PARALLEL)throw Error('Groq Free one-request-at-a-time guard');
  if(this.cooldownUntil>Date.now())throw Error('Groq Free cooldown active');
  const stamp=Date.now();
  this.recentRequests=this.recentRequests.filter(t=>stamp-t<60000);
  if(this.recentRequests.length>=25)throw Error('Groq Free local minute cap reached');
  const date=utc(), max=config.groqFreeMaxRequestsPerDay;
  let used=Number(memoryDaily.get(date)||0);
  if(databaseConfigured()){
    try{
      const row=await one('SELECT requests FROM aura_free_provider_usage WHERE provider=? AND usage_date=?',
        ['groq-free',date]);
      used=Math.max(used,Number(row?.requests||0));
    }catch{} // In-memory cap remains in force.
  }
  if(used>=max)throw Error('Groq Free daily cap reached');
  memoryDaily.set(date,used+1);
  this.recentRequests.push(stamp);
  this.inFlight++;
  if(databaseConfigured()){
    try{
      await query(`INSERT INTO aura_free_provider_usage(provider,usage_date,requests,failures,last_status,updated_at)
       VALUES(?,?,1,0,'reserved',?)
       ON DUPLICATE KEY UPDATE requests=requests+1,last_status='reserved',updated_at=VALUES(updated_at)`,
       ['groq-free',date,new Date().toISOString()]);
    }catch{}
  }
 }
 async #once(model,prompt,system,maxTokens){
  await this.#reserve();
  const started=Date.now();
  let status='error';
  try{
   const request=groqFreeBody(model,prompt,system,maxTokens);
   const response=await this.fetchFn(ENDPOINT,{
    method:'POST',
    redirect:'error',
    headers:{
     'Content-Type':'application/json',
     'Accept':'application/json',
     Authorization:'Bearer '+config.groqApiKey,
    },
    body:JSON.stringify(request),
    signal:AbortSignal.timeout(config.groqFreeTimeoutMs),
   });
   status='HTTP '+response.status;
   if(response.status===429){
    const wait=Math.min(600,Math.max(30,Number(response.headers?.get?.('retry-after'))||60));
    this.cooldownUntil=Date.now()+wait*1000;
    throw Error('Groq Free HTTP 429 quota exceeded');
   }
   if(!response.ok)throw Error('Groq Free HTTP '+response.status);
   const body=await response.json();
   if(body?.error){
    const code=Number(body.error.code||body.error.status);
    throw Error('Groq Free HTTP '+(Number.isFinite(code)?code:'400')+': '+
      safe(body.error.message||'provider error'));
   }
   const answer=groqVisibleAnswer(body);
   if(!answer)throw Error('Groq Free empty completion; finish='+safe(body?.choices?.[0]?.finish_reason||'unknown'));
   if(body?.model && !validateGroqFreeModel(body.model))
    throw Error('Groq Free response model outside allowlist');
   this.lastModel=String(body.model||model);
   this.lastLatencyMs=Date.now()-started;
   this.lastStatus='verified-text';
   this.lastError='';
   status='ok';
   return {answer,provider:'groq-free',model:this.lastModel,costMicrounits:0};
  }catch(error){
   this.lastError=safe(error);this.lastStatus='failure';
   this.lastLatencyMs=Date.now()-started;
   throw error;
  }finally{
   this.inFlight=Math.max(0,this.inFlight-1);
   if(databaseConfigured()){
    try{
     await query(`UPDATE aura_free_provider_usage SET failures=failures+?,last_status=?,updated_at=?
      WHERE provider='groq-free' AND usage_date=?`,
      [status==='ok'?0:1,status.slice(0,80),new Date().toISOString(),utc()]);
    }catch{}
   }
  }
 }
 async generate(prompt,system,maxTokens=700){
  if(!this.enabled)throw Error('Groq Free disabled: confirm Free organization plan and private API key');
  const primary=config.groqFreeModel;
  try{return await this.#once(primary,prompt,system,maxTokens);}
  catch(error){
   // A second free inference is allowed only if the model produced NO TEXT.
   // Never retry auth, billing, quota, content policy, 400 or network problems.
   if(terminalGroqError(error) || !/empty completion/i.test(safe(error)))
    throw error;
   const secondary=primary==='qwen/qwen3.8-27b'?'openai/gpt-oss-120b':'qwen/qwen3.8-27b';
   return this.#once(secondary,prompt,system,maxTokens);
  }
 }
}
