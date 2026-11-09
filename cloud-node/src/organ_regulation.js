// Functional regulation based on measured Node.js process observations.
// This is neither biological interoception nor a claim of subjective feeling.
// Only explicitly allowed effects are routed to the decision engine.
const clamp=(x)=>Math.max(0,Math.min(1,Number.isFinite(Number(x))?Number(x):0));
export const FUNCTIONAL_ORGANS=Object.freeze({
  prefrontal:'plan_and_authority_gate',
  amygdala:'risk_alert_gate',
  hippocampus:'evidence_linked_episodes',
  hypothalamus:'resource_budget_setpoints',
  basal_ganglia:'verified_contextual_policy',
  insula:'process_signal_interpretation',
  cerebellum:'measured_skill_feedback',
  endocrine:'slow_bounded_failure_adaptation',
  vagal:'fast_failure_response',
  immune:'recurrent_failure_quarantine',
  metabolic:'cpu_heap_and_budget',
});
const tierMin={native:0,fast:120,deep:350,verified:700};
const tierMax={native:0,fast:180,deep:700,verified:1000};
function freshSample(homeostasis,nowMs){
  const sensor=homeostasis?.sensor;
  if(sensor?.source!=='node-process')return null;
  const sampled=Date.parse(String(sensor.sampled_at||''));
  if(!Number.isFinite(sampled)||sampled>nowMs+10000||nowMs-sampled>120000)return null;
  return sensor;
}
export function organSignals(organism={},nowMs=Date.now()){
  const homeostasis=organism.homeostasis||{};
  const sample=freshSample(homeostasis,nowMs);
  // Derived pressure is accepted only if a recent process sample supports it.
  const pressure=sample?clamp(sample.compute_pressure):0;
  const failure=clamp(homeostasis.failure_ema??0);
  const compute=pressure>=.75?'critical':pressure>=.45?'constrained':'normal';
  return {
    source:sample?'node-process':'no-current-process-reading',
    sample_age_ms:sample?Math.max(0,nowMs-Date.parse(sample.sampled_at)):null,
    resource_pressure:pressure,
    observed_failure_ema:failure,
    compute_state:compute,
    signal_confidence:sample?1:0,
    functional_organs:['insula','hypothalamus','metabolic','vagal','prefrontal'],
  };
}
export function organRegulate(inference={},organism={},{
  nowMs=Date.now(),enabled=true,neutralize=[],
}={}){
  const actual=organSignals(organism,nowMs);
  const omissions=new Set(neutralize);
  const resourcePressure=enabled&&!omissions.has('resource_pressure')
    ?actual.resource_pressure:0;
  const failures=enabled&&!omissions.has('failure_ema')
    ?actual.observed_failure_ema:0;
  const tier=String(inference.compute_tier||'native');
  const risk=clamp(inference.risk??0),novelty=clamp(inference.novelty??0);
  const baselineBudget=Math.max(0,Math.floor(Number(inference.token_budget)||0));
  // Never disable verification on a critical or high-risk request. Existing
  // safety checks and tool permissions are unchanged.
  const highStakes=tier==='verified'||risk>=.6;
  const optionalComputation=resourcePressure>=.45&&!highStakes;
  const saving=optionalComputation
    ?resourcePressure>=.75?.58:.78:1;
  const minimum=tierMin[tier]??0;
  const maximum=tierMax[tier]??baselineBudget;
  const budget=Math.min(maximum,Math.max(minimum,Math.floor(baselineBudget*saving)));
  // A recurring failure can request a verification check; it is not evidence
  // of a new task outcome and cannot revoke an authorized mission.
  const verifyRecentFailures=failures>=.65&&tier!=='verified'&&risk<.6;
  const action=optionalComputation?'conserve_optional_compute'
    :verifyRecentFailures?'verify_repeated_failures':'unchanged';
  return {...inference,token_budget:budget,
    organ_regulation:{
      enabled,action,compute_state:actual.compute_state,
      source:actual.source,resource_pressure:actual.resource_pressure,
      effective_pressure:resourcePressure,
      failure_ema:actual.observed_failure_ema,
      effective_failure_ema:failures,
      optional_computation_reduced:budget<baselineBudget,
      verification_preserved:highStakes,
      risk,novelty,
      signal_age_ms:actual.sample_age_ms,
      modality:'functional-simulated-organs',
      subjective_emotion_claim:false,
    },
    // This is an explicit decision output, not a cosmetic metric.
    execution_preference:verifyRecentFailures?'verify-failures'
      :optionalComputation?'conserve':'normal',
  };
}
export function organAblation(inference,organism,{nowMs=Date.now()}={}){
  const actual=organRegulate(inference,organism,{nowMs});
  const noPressure=organRegulate(inference,organism,{
    nowMs,neutralize:['resource_pressure'],
  });
  const noFailures=organRegulate(inference,organism,{
    nowMs,neutralize:['failure_ema'],
  });
  const changed=(a,b)=>a.token_budget!==b.token_budget||
    a.execution_preference!==b.execution_preference;
  return {actual,noPressure,noFailures,
    pressure_causal:changed(actual,noPressure),
    failure_causal:changed(actual,noFailures),
    deterministic_replay:true};
}
