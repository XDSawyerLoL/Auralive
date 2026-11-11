// Cross-module prediction error, measured only from a prediction fixed BEFORE
// the observed outcome. No free-form prompts, unverifiable feelings or identity.
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(Number(x))?Number(x):0));
const moduleId=v=>String(v||'').replace(/[^a-z0-9_-]/gi,'').slice(0,35);
export const PREDICTION_BUS_VERSION='aura-prediction-error-v1';
export function initialPredictionState(){
  return {version:PREDICTION_BUS_VERSION,revision:0,modules:{},
    last_surprise:null,recent:[],verified_events:0,reported_events:0};
}
function safeState(v){
  const state=v&&typeof v==='object'?v:initialPredictionState();
  return {...initialPredictionState(),...state,modules:{...(state.modules||{})},
    recent:Array.isArray(state.recent)?state.recent.slice(-16):[]};
}
export function predictModule(state,{module,operationId='',at=new Date().toISOString()}={}){
  const name=moduleId(module);
  if(!name||!Number.isFinite(Date.parse(at)))throw Error('module/clock required');
  const old=safeState(state).modules[name]||{};
  const n=Math.max(0,Number(old.n)||0), successes=Math.max(0,Number(old.successes)||0);
  return {module:name,operation_id:moduleId(operationId),issued_at:at,
    probability:Number(((successes+1)/(n+2)).toFixed(4)),
    observations_before_prediction:n,
    outcome_observed:false};
}
export function observePrediction(state,prediction,{
  success,source='reported',at=new Date().toISOString(),
}={}){
  const old=safeState(state),name=moduleId(prediction?.module);
  const started=Date.parse(prediction?.issued_at||''),ended=Date.parse(at);
  if(!name||typeof success!=='boolean'||!Number.isFinite(started)||
    !Number.isFinite(ended)||ended<started||ended-started>24*3600*1000)
    return {accepted:false,reason:'missing-prospective-prediction',state:old};
  const allowed=['machine-observed','machine-verified','reported'];
  if(!allowed.includes(source))return {accepted:false,reason:'untrusted-source',state:old};
  const p=clamp(prediction.probability),y=success?1:0;
  const residual=Number(Math.abs(y-p).toFixed(4));
  const brier=Number(((y-p)**2).toFixed(4));
  const prev=old.modules[name]||{n:0,successes:0,brier_sum:0};
  const n=Math.min(100000,Math.max(0,Number(prev.n)||0)+1);
  const next={n,successes:Math.max(0,Number(prev.successes)||0)+(y===1?1:0),
    brier_sum:Number((Number(prev.brier_sum||0)+brier).toFixed(4)),
    brier_mean:Number(((Number(prev.brier_sum||0)+brier)/n).toFixed(4)),
    last_error:residual,last_at:at,last_source:source};
  const entry={module:name,at,source,error:residual,
    prediction:p,observed:y,operation_id:moduleId(prediction.operation_id)};
  const stateNext={...old,version:PREDICTION_BUS_VERSION,
    revision:Math.max(0,Number(old.revision)||0)+1,
    modules:{...old.modules,[name]:next},
    last_surprise:entry,recent:[...old.recent,entry].slice(-16),
    verified_events:old.verified_events+(source==='reported'?0:1),
    reported_events:old.reported_events+(source==='reported'?1:0),
  };
  return {accepted:true,error:residual,brier,state:stateNext,
    // Only the verified/machine-observed path may trigger mechanistic salience.
    eligible_for_attention:source!=='reported',entry};
}
export function currentPredictionSignal(state,nowMs=Date.now()){
  const value=state?.last_surprise;
  const at=Date.parse(String(value?.at||''));
  if(!Number.isFinite(at)||at>nowMs||nowMs-at>120000||
    !['machine-observed','machine-verified'].includes(value?.source))return null;
  return {module:moduleId(value.module),error:clamp(value.error),at:value.at,
    source:value.source};
}
export function predictAblation(state,prediction,observation){
  const withEvidence=observePrediction(state,prediction,observation);
  const withoutEvidence={...safeState(state)};
  return {withEvidence,withoutEvidence,
    causal:Boolean(withEvidence.accepted&&
      withEvidence.state.revision!==withoutEvidence.revision)};
}
