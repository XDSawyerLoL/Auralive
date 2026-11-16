// AURA medulla analogue: real, bounded and reversible regulation.
// No biological/subjective claims; no forced restart of the Node process.
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(Number(x))?Number(x):0));
const safeInt=x=>Number.isFinite(Number(x))?Math.max(0,Math.floor(Number(x))):null;
export function medullaDecision({
  language={},resources={},nowMs=Date.now(),lastAttemptAt=0,
  attemptsInWindow=0,maxAttempts=3,recoveryWindowMs=900000,
  cooldownMs=120000,localOnly=true,warmup=true,
}={}){
  const ready=language.ready===true&&language.probe_verified===true;
  const booting=language.booting===true||language.status==='starting'
    ||language.status==='verifying-inference';
  const failure=String(language.failure_code||'');
  const rawPressure=resources.compute_pressure;
  const pressure=rawPressure===undefined||rawPressure===null?null:clamp(rawPressure);
  const memorySafe=language.memory_preflight?.safe_to_start!==false;
  const cooldownUntil=safeInt(language.cooldown_until)||0;
  const since=nowMs-Math.max(0,lastAttemptAt);
  const safe=pressure===null||pressure<.85;
  let action='observe',reason='language-verified';
  if(!localOnly||!warmup){reason='local-supervision-disabled';}
  else if(ready){reason='verified-inference-ready';}
  else if(booting){reason='engine-boot-in-progress';}
  else if(!language.installed && !language.can_provision){reason='engine-not-installed';}
  else if(!memorySafe||!safe){reason='insufficient-resources';}
  else if(nowMs<cooldownUntil){reason='embedded-runtime-cooldown';}
  else if(attemptsInWindow>=maxAttempts){reason='circuit-breaker-open';}
  else if(since<cooldownMs){reason='medulla-retry-backoff';}
  else{action='recover-local-language';reason=failure||'language-unavailable';}
  return {
    version:'aura-functional-medulla-v1',action,reason,
    language_ready:ready,resource_pressure:pressure,
    sensor_available:pressure!==null,
    attempts_in_window:attemptsInWindow,
    max_attempts:maxAttempts,
    local_only:localOnly,
    no_remote_provider_calls:true,
    no_process_kill:true,
    biological_medulla:false,
    subjective_experience_proven:false,
    next_retry_after_ms:action==='recover-local-language'?0:
      Math.max(0,cooldownUntil-nowMs,cooldownMs-since),
  };
}
export class FunctionalMedulla {
  constructor({
    engine,readResources=()=>({}),now=Date.now,
    windowMs=900000,maxAttempts=3,cooldownMs=120000,
    localOnly=()=>true,warmup=()=>true,
    onDecision=()=>{},
  }={}){
    if(!engine||typeof engine.status!=='function'||typeof engine.start!=='function')
      throw Error('functional-medulla-needs-real-language-engine');
    Object.assign(this,{engine,readResources,now,windowMs,maxAttempts,
      cooldownMs,localOnly,warmup,onDecision});
    this.attempts=[];this.lastAttemptAt=0;this.pending=null;
    this.lastDecision=null;this.lastRecoveryAt=null;this.recoverySuccesses=0;
  }
  snapshot(){
    return {
      ...this.lastDecision,
      last_recovery_at:this.lastRecoveryAt,
      successful_recoveries:this.recoverySuccesses,
      in_flight:Boolean(this.pending),
      source:'local-runtime-and-node-process',
    };
  }
  async tick(){
    const nowMs=this.now();
    this.attempts=this.attempts.filter(t=>nowMs-t<this.windowMs&&t<=nowMs);
    const status=this.engine.status();
    const resources=this.readResources();
    const decision=medullaDecision({
      language:{...status,booting:Boolean(this.engine.booting)},
      resources,nowMs,lastAttemptAt:this.lastAttemptAt,
      attemptsInWindow:this.attempts.length,
      maxAttempts:this.maxAttempts,cooldownMs:this.cooldownMs,
      localOnly:Boolean(this.localOnly()),warmup:Boolean(this.warmup()),
    });
    this.lastDecision=Object.freeze({...decision,at:new Date(nowMs).toISOString()});
    this.onDecision(this.lastDecision);
    if(decision.action!=='recover-local-language'||this.pending)return this.snapshot();
    this.attempts.push(nowMs);this.lastAttemptAt=nowMs;
    this.lastRecoveryAt=new Date(nowMs).toISOString();
    // Non-blocking, at most one native bootstrap; never in an HTTP request.
    this.pending=Promise.resolve().then(()=>this.engine.start({allowProvision:true}))
      .then(ok=>{if(ok===true&&this.engine.status().ready===true)this.recoverySuccesses++;})
      .catch(()=>{}).finally(()=>{this.pending=null;});
    return this.snapshot();
  }
}
