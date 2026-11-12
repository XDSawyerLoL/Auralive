// AURA biophysical research: a dimensional passive compartment fitted to
// caller-supplied human patch-clamp feature records. No fabricated donor data.
// This is NOT a conductance-calibrated human Hodgkin-Huxley neuron, an
// amygdala model, or an estimate of subjective experience.
const finite=(x)=>typeof x==='number'&&Number.isFinite(x);
const safe=(x,min,max,name)=>{
  if(!finite(x)||x<min||x>max)throw new RangeError(name+' outside physiological research limits');
  return x;
};
export const ALLEN_FEATURE_SCHEMA='aura-allen-cell-types-human-ephys-v1';
const idPattern=/^[1-9]\d{3,14}$/;
function validateRecord(input){
  if(!input||typeof input!=='object'||Array.isArray(input))
    throw new TypeError('human neuronal feature record required');
  if(input.schema_version!==ALLEN_FEATURE_SCHEMA)
    throw new TypeError('unrecognized feature schema');
  if(input.species!=='Homo sapiens')
    throw new TypeError('human specimen only; mouse and unknown species prohibited');
  const specimen=String(input.specimen_id||'');
  if(!idPattern.test(specimen))throw new TypeError('valid Allen specimen ID required');
  if(input.source?.dataset!=='Allen Cell Types Database'||
    input.source?.method!=='AllenSDK.CellTypesCache.get_ephys_features'||
    input.source?.human_specimen_verified!==true)
    throw new TypeError('provenance not independently identified as human Allen data');
  const url='https://celltypes.brain-map.org/data?donor__species=Homo+Sapiens';
  if(input.source?.url!==url)
    throw new TypeError('unrecognized dataset source URL');
  if(input.source?.feature_units?.vrest!=='mV'||
    input.source?.feature_units?.ri!=='MOhm'||
    input.source?.feature_units?.tau!=='ms')
    throw new TypeError('feature units must be documented');
  const features=input.features||{};
  const vRest=safe(features.vrest_mV,-110,-35,'resting voltage');
  const resistance=safe(features.input_resistance_MOhm,5,3000,'input resistance');
  const tau=safe(features.membrane_tau_ms,.1,500,'membrane time constant');
  return {specimen,source:input.source,features:{vrest_mV:vRest,
    input_resistance_MOhm:resistance,membrane_tau_ms:tau}};
}
export function calibrateHumanPassiveCell(record){
  const valid=validateRecord(record);
  const {vrest_mV, input_resistance_MOhm, membrane_tau_ms}=valid.features;
  // nS = 1000 / MOhm; pF = tau(ms)*g(nS).
  const leakConductance_nS=1000/input_resistance_MOhm;
  const capacitance_pF=membrane_tau_ms*leakConductance_nS;
  return {
    kind:'measured-human-passive-RC-compartment',
    species:'Homo sapiens',specimen_id:valid.specimen,
    resting_mV:vrest_mV,leak_reversal_mV:vrest_mV,
    input_resistance_MOhm,membrane_tau_ms,
    leak_conductance_nS:leakConductance_nS,
    capacitance_pF,
    source:{dataset:valid.source.dataset,method:valid.source.method,
      specimen_id:valid.specimen,url:valid.source.url,
      feature_units:valid.source.feature_units,
      extraction_software:String(valid.source.extraction_software||'').slice(0,80)},
    fitted_features:['vrest','ri','tau'],
    fitted_species:'Homo sapiens (caller-supplied AllenSDK record)',
    provenance_check:'format-and-human-label-only; server has not authenticated Allen source',
    source_authenticity_verified_by_server:false,
    ion_channel_fit:false,action_potential_fit:false,
    human_whole_brain_reproduced:false,
    status:'fit-to-human-passive-features-not-heldout-validated',
  };
}
// Exact finite-step integration of C dV/dt = I - g(V-E).
// With pA/nS = mV, and pF/nS = ms. Current is piecewise constant.
export function advanceHumanPassiveCell({v_mV},model,{current_pA=0,dt_ms=1}={}){
  safe(current_pA,-10000,10000,'injected current');
  safe(dt_ms,.001,100,'time interval');
  if(!finite(v_mV))throw new TypeError('membrane voltage required');
  if(model?.kind!=='measured-human-passive-RC-compartment')
    throw new TypeError('human passive model required');
  const tau=model.membrane_tau_ms;
  const steady=model.resting_mV+current_pA/model.leak_conductance_nS;
  return {v_mV:steady+(v_mV-steady)*Math.exp(-dt_ms/tau)};
}
export function simulateHumanPassiveCell(model,{
  current_pA=[],dt_ms=1,initial_mV=model?.resting_mV,
}={}){
  if(!Array.isArray(current_pA)||!current_pA.length||current_pA.length>50000)
    throw new RangeError('current samples required, maximum 50000');
  safe(dt_ms,.001,100,'time step');
  if(!finite(initial_mV))throw new TypeError('initial voltage required');
  const trace=[],state={v_mV:initial_mV};
  for(let i=0;i<current_pA.length;i++){
    const next=advanceHumanPassiveCell(state,model,{current_pA:current_pA[i],dt_ms});
    state.v_mV=next.v_mV;
    trace.push(Number(state.v_mV.toFixed(6)));
  }
  return {dt_ms,voltage_mV:trace,
    duration_ms:Number((current_pA.length*dt_ms).toFixed(6)),
    produced_by:'passive-membrane-equation',
    no_llm:true,no_production_write:true};
}
export function validateHumanPassiveCell(record,heldout){
  const model=calibrateHumanPassiveCell(record);
  if(!heldout||heldout.specimen_id!==model.specimen_id)
    throw new TypeError('held-out trace must match the measured human specimen');
  if(heldout.used_for_fit!==false||
    heldout.source?.origin!=='Allen Cell Types Database'||
    !Number.isSafeInteger(heldout.sweep_number)||heldout.sweep_number<0)
    throw new TypeError('independent held-out sweep provenance required');
  const voltage=heldout.voltage_mV;
  const current=heldout.stimulus_current_pA;
  const dt=heldout.dt_ms;
  if(!Array.isArray(voltage)||!Array.isArray(current)||
    voltage.length<5||voltage.length!==current.length||
    voltage.length>50000)
    throw new TypeError('same-length held-out voltage and stimulus samples required');
  safe(dt,.001,100,'recording time interval');
  if(voltage.some(x=>!finite(x)||x< -150||x>100))
    throw new TypeError('voltage samples must be finite and within research limits');
  const prediction=simulateHumanPassiveCell(model,{current_pA:current,
    dt_ms:dt,initial_mV:voltage[0]});
  let squared=0,absolute=0;
  for(let i=0;i<voltage.length;i++){
    const residual=prediction.voltage_mV[i]-voltage[i];
    squared+=residual*residual;absolute+=Math.abs(residual);
  }
  const rmse=Math.sqrt(squared/voltage.length);
  return {model,validation:{
    provenance:'heldout-human-sweep-provided-by-caller',
    specimen_id:model.specimen_id,sweep_number:heldout.sweep_number,
    samples:voltage.length,rmse_mV:Number(rmse.toFixed(6)),
    mae_mV:Number((absolute/voltage.length).toFixed(6)),
    performance_classification:'unreviewed',
    // Errors are reported; no invented accuracy or threshold-based certification.
    externally_validated:false,
    heldout_provenance_verified_by_server:false,
    action_potential_fidelity:'not-applicable-passive-only',
  },prediction};
}
