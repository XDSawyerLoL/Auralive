// Dimensional synapse kinetics for scientific research, not verified human
// receptor parameters. Rise-decay conductances are driven by timed release
// events (not by an LLM); NMDA includes voltage-dependent Mg2+ block.
// NMDA kinetics: published illustrative cortical example 3/35 ms;
// AMPA 0.2/2 ms (see 10.1038/s41467-018-06070-y).
// GABA kinetics are illustrative and require cell-type calibration.
const assertFinite=(x,label)=>{
  if(typeof x!=='number'||!Number.isFinite(x))
    throw new TypeError(label+' must be a finite numeric value');
  return x;
};
const R=Object.freeze({
  AMPA:Object.freeze({tauRise_ms:.2,tauDecay_ms:2,reversal_mV:0}),
  NMDA:Object.freeze({tauRise_ms:3,tauDecay_ms:35,reversal_mV:0}),
  GABA_A:Object.freeze({tauRise_ms:.5,tauDecay_ms:8,reversal_mV:-75}),
  GABA_B:Object.freeze({tauRise_ms:15,tauDecay_ms:160,reversal_mV:-90}),
});
export const RECEPTOR_KINETICS=R;
function normalizedDoubleExponential(delay,tauRise,tauDecay){
  if(delay<0)return 0;
  const tpeak=Math.log(tauDecay/tauRise)/(1/tauRise-1/tauDecay);
  const peak=Math.exp(-tpeak/tauDecay)-Math.exp(-tpeak/tauRise);
  return Math.max(0,(Math.exp(-delay/tauDecay)-Math.exp(-delay/tauRise))/peak);
}
export function magnesiumUnblock(voltage_mV,magnesium_mM=1){
  assertFinite(voltage_mV,'NMDA voltage');
  assertFinite(magnesium_mM,'magnesium concentration');
  if(magnesium_mM<0||magnesium_mM>5)
    throw new RangeError('extracellular magnesium outside research limits');
  // Jahr & Stevens approximation: conductance Mg block ~
  // [1+ ([Mg]/3.57) exp(-0.062 V)]^-1.
  return 1/(1+(magnesium_mM/3.57)*Math.exp(-.062*voltage_mV));
}
export function validateSynapse(s){
  if(!s||typeof s!=='object'||!Object.hasOwn(R,s.receptor))
    throw new TypeError('known AMPA/NMDA/GABA receptor required');
  if(!Number.isSafeInteger(s.compartment_id)||s.compartment_id<=0)
    throw new TypeError('target SWC segment required');
  assertFinite(s.g_peak_nS,'synaptic peak conductance');
  if(s.g_peak_nS<0||s.g_peak_nS>3000)
    throw new RangeError('synaptic conductance outside computational bounds');
  if(!Array.isArray(s.release_times_ms)||s.release_times_ms.length>1500)
    throw new TypeError('bounded release event times required');
  let before=-Infinity;
  for(const t of s.release_times_ms){
    assertFinite(t,'release event time');
    if(t<0||t>1e6||t<before)
      throw new RangeError('release times must be sorted and nonnegative');
    before=t;
  }
  const params=R[s.receptor];
  return {...params,receptor:s.receptor,compartment_id:s.compartment_id,
    g_peak_nS:s.g_peak_nS,release_times_ms:s.release_times_ms,
    magnesium_mM:s.receptor==='NMDA'?
      (s.magnesium_mM??1):null};
}
export function conductanceAt(s,time_ms,voltage_mV){
  const config=validateSynapse(s);
  assertFinite(time_ms,'time');
  let total=0;
  for(const releasedAt of config.release_times_ms){
    if(releasedAt>time_ms)break;
    if(time_ms-releasedAt>config.tauDecay_ms*15)continue;
    total+=normalizedDoubleExponential(time_ms-releasedAt,
      config.tauRise_ms,config.tauDecay_ms);
  }
  const magnesium=config.receptor==='NMDA'
    ?magnesiumUnblock(voltage_mV,config.magnesium_mM):1;
  return {receptor:config.receptor,g_nS:config.g_peak_nS*total*magnesium,
    reversal_mV:config.reversal_mV,
    voltage_dependent:config.receptor==='NMDA',
    magnesium_factor:magnesium};
}
export function synapticInputsAt(synapses,time_ms,node_ids,voltages_mV){
  if(!Array.isArray(synapses)||synapses.length>200)
    throw new RangeError('bounded synapse set required');
  if(!Array.isArray(node_ids)||!Array.isArray(voltages_mV)||
    node_ids.length!==voltages_mV.length)
    throw new TypeError('matching membrane voltage samples required');
  const byNode=new Map(node_ids.map((n,i)=>[n,i]));
  const result={};
  for(const s of synapses){
    if(!byNode.has(s.compartment_id))
      throw new RangeError('target compartment not present in morphology');
    const i=byNode.get(s.compartment_id);
    const g=conductanceAt(s,time_ms,voltages_mV[i]);
    if(!result[s.compartment_id])result[s.compartment_id]=[];
    result[s.compartment_id].push(g);
  }
  return result;
}
// Coupled with real morphology and passive cable solver; active human
// Na/K/Ca dynamics and synaptic plasticity are NOT yet calibrated.
export function simulateSynapticArbor(model,synapses,{
  duration_ms=40,dt_ms=.1,initial_mV=model?.vrest_mV,
  injected_pA={},
}={}){
  if(!model||model.kind!=='human-feature-fitted-passive-SWC-arbor-v1')
    throw new TypeError('human fitted passive morphology required');
  assertFinite(duration_ms,'duration');
  assertFinite(dt_ms,'timestep');
  if(duration_ms<=0||duration_ms>200||dt_ms<.01||dt_ms>2)
    throw new RangeError('simulation outside resource bounds');
  const steps=Math.ceil(duration_ms/dt_ms);
  if(steps>12000)throw new RangeError('simulation too long');
  const voltages=new Array(model.count).fill(initial_mV);
  let membrane=voltages;
  const trace=[];
  // Explicit import isolates physical cable solver from synapse kinetics.
  // Function is async-free, so this module never calls a backend model.
  for(let i=0;i<steps;i++){
    const t=i*dt_ms;
    const syn=synapticInputsAt(synapses,t,model.node_ids,membrane);
    membrane=advancePassiveArbor(model,membrane,{
      dt_ms,injected_pA,synapticConductance_nS:syn});
    trace.push({time_ms:Number(((i+1)*dt_ms).toFixed(4)),
      soma_mV:Number(membrane[0].toFixed(6)),
      mean_mV:Number((membrane.reduce((a,b)=>a+b,0)/membrane.length).toFixed(6))});
  }
  return {kind:'passive-human-feature-arbor-and-synaptic-conductances',
    trace,final_mV:membrane,
    ion_channel_spiking_implemented:false,
    source_authenticated:false,
    receptor_parameters_human_calibrated:false,
    llm_used:false,production_memory_mutated:false};
}
import { advancePassiveArbor } from './biophysical_morphology.js';
