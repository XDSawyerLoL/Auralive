// CORTEX 08: deterministic visual expressions of REAL, dated software metrics.
// No hormone/neuron measurement, random cognitive event, or fake heartbeat.
const clip=n=>Math.max(0,Math.min(1,n));
const pct=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))
  ?null:clip(Number(v)/100);
const validDate=(value,nowMs)=>{
 const t=Date.parse(String(value||''));
 return Number.isFinite(t)&&t<=nowMs+2000&&t>=nowMs-120000?t:null;
};
const pick=(vitals,name,nowMs)=>{
 const sign=(Array.isArray(vitals)?vitals:[]).find(v=>v?.id===name);
 return sign?.available===true&&validDate(sign.observed_at,nowMs)!==null
  ?pct(sign.value):null;
};
const round=x=>Number(x.toFixed(4));
export function computeCortex08Physiology(telemetry={},nowMs=Date.now()){
 const vital=telemetry.neuro_vitals||{};
 const source=vital.vitals||[];
 const cpu=pick(source,'cpu',nowMs),heap=pick(source,'heap',nowMs);
 const reserve=pick(source,'reserve',nowMs);
 const stability=pick(source,'stability',nowMs);
 const workspace=telemetry.global_workspace||{};
 const attention=workspace.broadcast_enabled===true&&
   validDate(workspace.at,nowMs)!==null&&
   workspace.freshness?.status==='recent'
    ?pct(workspace.selected?.[0]?.score):null;
 const freshPrediction=(telemetry.prediction?.modules||[]).filter(m=>
   validDate(m.last_at,nowMs)!==null&&m.last_error!==null);
 const error=freshPrediction.length?
   Math.max(...freshPrediction.map(m=>pct(m.last_error)||0)):null;
 const pressure=telemetry.somatic?.freshness?.status==='recent'&&
   telemetry.somatic?.source==='node-process'&&
   validDate(telemetry.somatic?.freshness?.updated_at,nowMs)!==null
   ?pct(telemetry.somatic.compute_pressure):null;
 const measured=vital.sensor_fresh===true&&cpu!==null&&heap!==null;
 const reserveFactor=reserve===null?null:reserve;
 const tension=measured?clip(.65*(pressure??cpu)+.35*(1-(stability??.5))):null;
 // All changes represent measured *process effort*, not life or neural spikes.
 const movement=measured?clip(.12+.42*cpu+.16*(pressure??cpu)):null;
 const brightness=measured?clip(.19+.30*cpu+.22*(reserveFactor??.5)):null;
 const coherence=stability===null?null:stability;
 const density=heap===null?null:clip(.2+.75*heap);
 const instability=error===null?null:error;
 const focus=attention===null?null:attention;
 const state=!measured?'unobserved':tension>=.8?'strained':
   tension>=.56?'mobilized':tension>=.32?'active':'quiet';
 const metrics={
  cpu,heap,stability,reserve,pressure,attention,prediction_error:error,
 };
 const controls={
  movement,brightness,tension,coherence,density,instability,focus,
  // Explicitly an animation rate, not a heartbeat or biological respiration.
  ambient_wave_hz:measured?clip(.045+.11*cpu+.065*(pressure??cpu)):null,
  surface_displacement:measured?clip(.002+.012*cpu+.006*(1-(stability??.5))):null,
 };
 const samples=Object.fromEntries(Object.entries(metrics).map(([id,v])=>[
  id,v===null?null:round(v)]));
 return {
  version:'cortex08-visual-physiology-v1',
  sampled_at:new Date(nowMs).toISOString(),
  state,measured,source:'server-sourced-process-and-software-projection',
  metrics:samples,
  controls:Object.fromEntries(Object.entries(controls).map(([id,v])=>[
   id,v===null?null:round(v)])),
  focus_source:focus===null?null:String(workspace.selected?.[0]?.source||'').slice(0,32),
  source_timestamps:{
   process:measured?telemetry.somatic?.freshness?.updated_at:null,
   organism:stability===null?null:telemetry.source?.updated_at,
   workspace:focus===null?null:workspace.at,
  },
  observed_hops_required_for_spikes:true,
  ambient_motion_is_metric_analogy:true,
  biological_measurement:false,consciousness_proven:false,
 };
}
