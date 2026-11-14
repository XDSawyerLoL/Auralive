// Local GGUF supervision: deterministic decision, no network and no side
// effects. The host process owns the timer and can stop it on shutdown.
const PERMANENT_BLOCKS=new Set([
  'host-disallows-native-execution',
  'embedded-incompatible-binary',
  'embedded-cpu-instruction-unsupported',
  'embedded-unsupported-startup-option'
]);
export function localLanguageRecoveryDecision({
  warmup=false,localOnly=false,ready=false,booting=false,
  installed=false,canProvision=false,now=Date.now(),
  cooldownUntil=0,provisionRetryAfter=0,failureCode=''
}={}){
  const result=(start,reason,allowProvision=false)=>({
    start,reason,allowProvision,retryable:
      !PERMANENT_BLOCKS.has(String(failureCode||''))&&Boolean(installed||canProvision)
  });
  if(!warmup||!localOnly)return result(false,'language-supervision-disabled');
  if(ready)return result(false,'already-responsive');
  if(booting)return result(false,'startup-already-running');
  if(!installed&&!canProvision)return result(false,'no-installed-or-provisionable-model');
  if(PERMANENT_BLOCKS.has(String(failureCode||'')))
    return result(false,'requires-host-intervention');
  const blockedUntil=Math.max(Number(cooldownUntil)||0,Number(provisionRetryAfter)||0);
  if(now<blockedUntil)return result(false,'retry-cooldown');
  return result(true,installed?'retry-native-start':'retry-verified-install',Boolean(canProvision));
}

export function localLanguageRetryAfter(provisioning={}){
  const parsed=Date.parse(String(provisioning?.retry_after||''));
  return Number.isFinite(parsed)?parsed:0;
}
