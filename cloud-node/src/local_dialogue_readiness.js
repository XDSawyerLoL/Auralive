// Path-free, user-visible readiness contract for offline-only conversation.
// A model file is NOT evidence of a responsive inference server.
const ACTIVE_STAGES=new Set([
 'locating-existing-install','downloading-cpu-runtime',
 'extracting-cpu-runtime','downloading-open-model',
 'installed-verified','starting','verifying-inference'
]);
const RESOURCE_BLOCKS=new Set([
 'embedded-insufficient-cgroup-headroom','embedded-insufficient-memory',
 'embedded-insufficient-cgroup-memory','embedded-thread-capacity-exhausted'
]);
const FATAL_CODES=new Set([
 'host-disallows-native-execution','embedded-incompatible-binary',
 'embedded-cpu-instruction-unsupported','embedded-unsupported-startup-option'
]);
export function localDialogueReadiness({
 localOnly=false,runtime={},booting=false,bridgeOnline=false,
 autoProvision=false,now=Date.now()
}={}){
 const base={schema:'aura-local-language-readiness-v1',local_only:Boolean(localOnly),
  ready:false,model_verified:false,phase:'unavailable',reason:'',retry_after_seconds:5,
  retryable:false,model_profile:null};
 if(!localOnly)return {...base,ready:true,phase:'mixed-mode',reason:'remote-fallback-permitted',
  retryable:true};
 const status=String(runtime.status||'unknown');
 const provisioning=runtime.provisioning||{};
 const p=String(provisioning.stage||'not-started');
 const failure=String(runtime.failure_code||provisioning.error_code||'').slice(0,100);
 const verified=runtime.probe_verified===true&&runtime.ready===true;
 if(verified||bridgeOnline)return {...base,ready:true,model_verified:verified,
  phase:verified?'ready-gguf':'ready-local-bridge',
  reason:verified?'verified-local-generation':'verified-local-bridge',
  model_profile:verified?String(runtime.active_model_profile||'').slice(0,90):null,
  retryable:true};
 if(FATAL_CODES.has(failure))return {...base,phase:'blocked',reason:failure,
  retry_after_seconds:0,retryable:false};
 const cooldown=Number(runtime.cooldown_until)||0;
 const provisionTime=Date.parse(String(provisioning.retry_after||''));
 const nextTime=Math.max(cooldown,Number.isFinite(provisionTime)?provisionTime:0);
 if(!booting && nextTime>now){
  return {...base,phase:'retry-scheduled',reason:failure||p||status,
   retry_after_seconds:Math.max(1,Math.ceil((nextTime-now)/1000)),
   retryable:true};
 }
 if(!booting&&RESOURCE_BLOCKS.has(failure)){
  return {...base,phase:'blocked',reason:failure,
   retry_after_seconds:30,retryable:Boolean(autoProvision||runtime.installed)};
 }
 if(booting || (ACTIVE_STAGES.has(p)&&p!=='installed-verified'
    && runtime.status!=='startup-failed') ||
    status==='starting'||status==='verifying-inference')
  return {...base,phase:p==='downloading-open-model'?'downloading-model'
    :p==='downloading-cpu-runtime'?'downloading-runtime'
    :p==='extracting-cpu-runtime'?'installing-runtime'
    :status==='verifying-inference'?'verifying-model':'starting-model',
   reason:p==='not-started'?status:p,retryable:true,retry_after_seconds:5};
 if(p==='blocked'){
  return {...base,phase:'blocked',reason:failure||'provisioning-blocked',
   retry_after_seconds:0,retryable:false};
 }
 if(autoProvision||runtime.installed){
  // A failed launch is not the same thing as an idle but healthy installation.
  // Surface the classified failure code while the supervisor schedules retry.
  if(status==='startup-failed' && failure)
    return {...base,phase:'startup-failed',reason:failure,
      retryable:true,retry_after_seconds:5};
  return {...base,phase:'pending-start',
   reason:runtime.installed?'model-present-not-ready':'model-installation-not-started',
   retryable:true,retry_after_seconds:5};
 }
 return {...base,phase:'unavailable',reason:failure||status,retryable:false};
}
