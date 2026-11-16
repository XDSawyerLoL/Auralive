// Quantitative glial homeostasis RESEARCH TOY. No human kinetic calibration.
// States cannot affect AURA speech, memory, control policy, or live brain UI.
const finite=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n))throw new TypeError('invalid '+label);return n};
const within=(n,lo,hi,label)=>{finite(n,label);if(n<lo||n>hi)throw new RangeError(label+' outside research bounds');return n};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const round=n=>Number(n.toFixed(6));
export const GLIA_MODEL_SCHEMA='aura-glial-homeostasis-toy-v1';
export function initialGlialState(){
 return {schema:GLIA_MODEL_SCHEMA,time_s:0,
  extracellular_potassium_mM:3.5,astrocyte_k_pool_mM_equivalent:0,
  extracellular_glutamate_relative:0,astrocyte_atp_fraction:.85,
  microglial_activation:0,myelin_integrity:.8};
}
function check(input){
 if(!input||input.schema!==GLIA_MODEL_SCHEMA)throw new TypeError('glial research state required');
 const limits={time_s:[0,1e9],extracellular_potassium_mM:[2,20],
  astrocyte_k_pool_mM_equivalent:[0,100],extracellular_glutamate_relative:[0,1],
  astrocyte_atp_fraction:[0,1],microglial_activation:[0,1],myelin_integrity:[0,1]};
 for(const [key,[min,max]] of Object.entries(limits))within(input[key],min,max,key);
 return {...input};
}
export function advanceGlialState(input,{seconds=1,neuronal_k_release_mM_per_s=0,
 neuronal_glutamate_release_relative_per_s=0,energy_supply=1,
 inflammatory_signal=0,astrocyte_uptake_enabled=true}={}){
 const state=check(input);
 within(seconds,.001,60,'seconds');
 within(neuronal_k_release_mM_per_s,0,1,'potassium release');
 within(neuronal_glutamate_release_relative_per_s,0,.5,'glutamate release');
 within(energy_supply,0,1,'energy supply');
 within(inflammatory_signal,0,1,'inflammatory signal');
 if(typeof astrocyte_uptake_enabled!=='boolean')throw new TypeError('uptake flag required');
 let k=state.extracellular_potassium_mM,store=state.astrocyte_k_pool_mM_equivalent;
 let glu=state.extracellular_glutamate_relative,atp=state.astrocyte_atp_fraction;
 let microglia=state.microglial_activation,myelin=state.myelin_integrity;
 let time=0,uk=0,ug=0;
 // Bounded ODE integration with <=100 ms substeps. Coefficients are illustrative.
 while(time<seconds-1e-10){
  const dt=Math.min(.1,seconds-time),excess=Math.max(0,k-3.5);
  const available=astrocyte_uptake_enabled?atp:0;
  const kFlux=Math.min(excess,.22*excess/(1+excess/4)*available)*dt;
  const gluFlux=Math.min(glu,.35*glu*available)*dt;
  k=clamp(k+neuronal_k_release_mM_per_s*dt-kFlux,2,20);
  store=clamp(store+kFlux-.025*store*dt,0,100);
  glu=clamp(glu+neuronal_glutamate_release_relative_per_s*dt-gluFlux,0,1);
  atp=clamp(atp+(energy_supply-atp)*.02*dt-(kFlux+gluFlux)*.12,0,1);
  microglia=clamp(microglia+(inflammatory_signal-microglia)*dt/45,0,1);
  myelin=clamp(myelin+(.85*atp*(1-.4*microglia)-myelin)*dt/600,0,1);
  uk+=kFlux;ug+=gluFlux;time+=dt;
 }
 return {state:{schema:GLIA_MODEL_SCHEMA,time_s:round(state.time_s+seconds),
  extracellular_potassium_mM:round(k),astrocyte_k_pool_mM_equivalent:round(store),
  extracellular_glutamate_relative:round(glu),astrocyte_atp_fraction:round(atp),
  microglial_activation:round(microglia),myelin_integrity:round(myelin)},
  exchange:{potassium_uptake_mM_equivalent:round(uk),glutamate_uptake_relative:round(ug)},
  annotation:{model:'illustrative-glia-compartment-ODE',biological_calibration:false,
   human_glial_equivalence:false,cellular_mechanisms_complete:false,
   real_human_data_used:false,production_mutation_allowed:false,
   hypothesis:'energy-limited astrocytic uptake and slow inflammatory modulation',
   uncertainty:'unquantified-parameters-not-fitted',extrapolation_to_consciousness:false}};
}
export function compareGlialUptake(input,stimulus={}){
 const on=advanceGlialState(input,{...stimulus,astrocyte_uptake_enabled:true});
 const off=advanceGlialState(input,{...stimulus,astrocyte_uptake_enabled:false});
 return {with_uptake:on,without_uptake:off,
  extracellular_k_difference_mM:round(on.state.extracellular_potassium_mM-off.state.extracellular_potassium_mM),
  comparison:'paired-numerical-ablation-not-empirical-causation',
  brain_function_validated:false,production_mutation_allowed:false};
}