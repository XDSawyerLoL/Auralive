import {lookup} from 'node:dns/promises';
import {writeFile} from 'node:fs/promises';

const base='https://antiquewhite-dolphin-780448.hostingersite.com';
const report={schema:'aura-live-language-incident-v1',base,checked_at:new Date().toISOString(),network_origin:'github-actions',endpoints:[],inference_proven:false,reason:''};
try{
 const resolved=await lookup(new URL(base).hostname);
 report.dns={resolved:true,ip_version:resolved.family};
}catch(error){
 report.dns={resolved:false,code:String(error?.code||'unknown').slice(0,50)};
}
for(const path of ['/healthz','/api/build','/api/language/ready','/api/language/embedded/status']){
 const record={path,http_status:0,reachable:false};
 const started=Date.now();
 try{
  const response=await fetch(base+path,{signal:AbortSignal.timeout(9500),
   headers:{accept:'application/json','user-agent':'AURA-incident-probe/2026-11-15'}});
  record.http_status=response.status;
  record.reachable=true;
  const ct=response.headers.get('content-type')||'';
  if(ct.includes('application/json')){
   const body=await response.json();
   // Only stable, non-sensitive indicators. Never export paths, token data,
   // raw stderr, personal messages, cookies or the full server response.
   if(path==='/healthz')record.kernel_ready=body?.ready===true;
   if(path==='/api/build')record.git_sha=String(body?.git_sha||'').slice(0,40);
   if(path==='/api/language/ready'){
    record.local_only=body?.local_only===true;
    record.phase=String(body?.phase||'').slice(0,80);
    record.reason=String(body?.reason||'').slice(0,120);
    record.ready=body?.ready===true;
    record.model_verified=body?.model_verified===true;
   }
   if(path==='/api/language/embedded/status'){
    record.binary_found=body?.binary_found===true;
    record.model_found=body?.model_found===true;
    record.probe_verified=body?.probe_verified===true;
    record.ready=body?.ready===true;
    record.failure_code=String(body?.failure_code||'').slice(0,120);
    record.status=String(body?.status||'').slice(0,100);
    record.boot_profile=String(body?.boot_profile||'').slice(0,50);
    record.model_profile=String(body?.active_model_profile||'').slice(0,120);
    record.model_requested=String(body?.requested_model_profile||'').slice(0,120);
    record.resource_before_start={
      limit_mb:Number.isFinite(body?.resource_before_start?.limit_mb)?body.resource_before_start.limit_mb:null,
      current_mb:Number.isFinite(body?.resource_before_start?.current_mb)?body.resource_before_start.current_mb:null,
      oom_events:Number.isInteger(body?.resource_before_start?.oom_events)?body.resource_before_start.oom_events:null,
      oom_kills:Number.isInteger(body?.resource_before_start?.oom_kills)?body.resource_before_start.oom_kills:null,
    };
    record.oom_kills_during_start=Number.isInteger(body?.oom_kills_during_start)?body.oom_kills_during_start:null;
    record.launch_mode=String(body?.launch_mode||'').slice(0,60);
    record.failure_stage=String(body?.failure_stage||'').slice(0,80);
    record.log_signals=Array.isArray(body?.log_signals)
      ?body.log_signals.filter(x=>typeof x==='string').map(x=>x.slice(0,60)).slice(0,20):[];
    record.process_exit={
      code:Number.isInteger(body?.process_exit?.code)?body.process_exit.code:null,
      signal:String(body?.process_exit?.signal||'').slice(0,20),
    };
    record.boot_attempts=Array.isArray(body?.boot_attempts)
      ?body.boot_attempts.slice(-4).map(item=>({
        profile:String(item.profile||'').slice(0,40),
        outcome:String(item.outcome||'').slice(0,50),
        failure_code:String(item.failure_code||'').slice(0,80),
        exit_code:Number.isInteger(item.exit_code)?item.exit_code:null,
        failure_stage:String(item.failure_stage||'').slice(0,80),
        signals:Array.isArray(item.signals)?item.signals.slice(0,12):[],
        health_seen:item.health_seen===true,
        inference_verified:item.inference_verified===true,
      })):[];
    const mem=body?.memory_preflight||{};
    record.memory_preflight={
      safe_to_start:mem.safe_to_start===true,
      limit_mb:Number.isFinite(mem.limit_mb)?mem.limit_mb:null,
      available_mb:Number.isFinite(mem.available_mb)?mem.available_mb:null,
      required_mb:Number.isFinite(mem.required_mb)?mem.required_mb:null,
    };
   }
  }else record.response_type='non-json';
 }catch(error){record.error_code=String(error?.cause?.code||error?.name||'network-failed').slice(0,80);}
 record.elapsed_ms=Date.now()-started;
 report.endpoints.push(record);
}
const embedded=report.endpoints.find(x=>x.path==='/api/language/embedded/status');
report.inference_proven=Boolean(embedded?.ready&&embedded?.probe_verified);
report.reason=!report.dns?.resolved?'dns-not-resolved'
 :!report.endpoints.find(x=>x.path==='/healthz')?.reachable?'host-unreachable'
 :!report.inference_proven?'no-verified-live-gguf-inference':'gguf-inference-probe-verified';
await writeFile('aura-language-live-incident.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.dns?.resolved||!report.endpoints.find(x=>x.path==='/healthz')?.reachable)process.exitCode=2;
