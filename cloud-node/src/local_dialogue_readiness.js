// Public, path-free readiness contract for local-only dialogue.
// Model files present != running GGUF != verified inference.
const ACTIVE_STAGES=new Set([
 'locating-existing-install','downloading-cpu-runtime',
 'extracting-cpu-runtime','downloading-open-model',
 'installed-verified','starting','verifying-inference'
]);
const permanentFailure=s=>/insufficient|not-supported|permission|noexec|incompatible|unable|blocked/.test(s);
export function localDialogueReadiness({
 localOnly=false,runtime={},booting=false,bridgeOnline=false,
 autoProvision=false
}={}){
 const base={schema:'aura-local-language-readiness-v1',local_only:Boolean(localOnly),
  ready:false,model_verified:false,phase:'unavailable',reason:'',retry_after_seconds:5,
  retryable:false,model_profile:null};
 if(!localOnly)return {...base,ready:true,phase:'mixed-mode',reason:'remote-fallback-permitted',
  retryable:true};
 const status=String(runtime.status||'unknown');
 const provisioning=runtime.provisioning||{};
 const p=String(provisioning.stage||'not-started');
 const failure=String(runtime.failure_code||provisioning.error_code||'');
 const verified=runtime.probe_verified===true&&runtime.ready===true;
 if(verified||bridgeOnline)return {...base,ready:true,model_verified:verified,
  phase:verified?'ready-gguf':'ready-local-bridge',
  reason:verified?'verified-local-generation':'verified-local-bridge',
  model_profile:verified?String(runtime.active_model_profile||'').slice(0,90):null,
  retryable:true};
 if(p==='blocked'||(!booting&&failure&&permanentFailure(failure)))
  return {...base,phase:'blocked',reason:failure||'provisioning-blocked',
   retry_after_seconds:60,retryable:false};
 if(booting||ACTIVE_STAGES.has(p)||status==='starting'||status==='verifying-inference')
  return {...base,phase:p==='downloading-open-model'?'downloading-model'
    :p==='downloading-cpu-runtime'?'downloading-runtime'
    :p==='extracting-cpu-runtime'?'installing-runtime'
    :status==='verifying-inference'?'verifying-model':'starting-model',
   reason:p==='not-started'?status:p,retryable:true,retry_after_seconds:5};
 if(autoProvision||runtime.installed)
  return {...base,phase:'pending-start',reason:runtime.installed?'model-present-not-ready':
    'model-installation-not-started',retryable:true,retry_after_seconds:5};
 return {...base,phase:'unavailable',reason:failure||status,retryable:false};
}
