// Scientific mesoscale circuit motifs: NOT a human cellular connectome.
// Rate populations, explicit directed E/I projections, delays and depletion.
// Biological names describe TESTABLE circuit hypotheses, not human equivalence.
import {initialGlialState,advanceGlialState} from './biophysical_glia.js';
export const CIRCUIT_MOTIF_SCHEMA='aura-anatomical-rate-motifs-v1';
const N=[
 ['thalamus_relay','thalamus','E',18],['thalamus_reticular','thalamus','I',12],
 ['cortex_l1_int','cortex_L1','I',12],['cortex_l2_pyr','cortex_L2','E',22],
 ['cortex_l3_pyr','cortex_L3','E',22],['cortex_l4_spiny','cortex_L4','E',16],
 ['cortex_l5_pyr','cortex_L5','E',26],['cortex_l6_pyr','cortex_L6','E',22],
 ['cortex_l23_int','cortex_L2_L3','I',12],['cortex_l5_int','cortex_L5','I',12],
 ['entorhinal','hippocampal','E',20],['dentate_granule','hippocampal','E',24],
 ['ca3_pyramidal','hippocampal','E',24],['ca1_pyramidal','hippocampal','E',24],
 ['subiculum','hippocampal','E',20],['hippocampal_int','hippocampal','I',12],
 ['striatum_d1','basal_ganglia','I',26],['striatum_d2','basal_ganglia','I',26],
 ['globus_pallidus_external','basal_ganglia','I',20],
 ['globus_pallidus_internal','basal_ganglia','I',20],
 ['subthalamic_nucleus','basal_ganglia','E',16],
 ['thalamus_motor','basal_ganglia','E',18],
 ['cerebellum_mossy','cerebellum','E',14],
 ['cerebellum_granule','cerebellum','E',15],
 ['cerebellum_purkinje','cerebellum','I',22],
 ['cerebellum_deep','cerebellum','E',20],
 ['inferior_olive','cerebellum','E',30],
 ['amygdala_basolateral','amygdala','E',24],
 ['amygdala_intercalated','amygdala','I',12],
 ['amygdala_central','amygdala','I',22],
 ['hypothalamus_pvn','hypothalamus','E',26]
];
const E=[
 // Thalamo-cortical layers, inhibitory interneurons, corticothalamic loop.
 ['thalamus_relay','cortex_l4_spiny',.9,5],
 ['thalamus_relay','thalamus_reticular',.65,5],
 ['thalamus_reticular','thalamus_relay',.65,5],
 ['cortex_l4_spiny','cortex_l2_pyr',.85,5],
 ['cortex_l4_spiny','cortex_l23_int',.55,5],
 ['cortex_l2_pyr','cortex_l3_pyr',.8,5],
 ['cortex_l3_pyr','cortex_l5_pyr',.75,5],
 ['cortex_l3_pyr','cortex_l1_int',.45,5],
 ['cortex_l1_int','cortex_l2_pyr',.45,5],
 ['cortex_l23_int','cortex_l3_pyr',.65,5],
 ['cortex_l5_pyr','cortex_l6_pyr',.6,5],
 ['cortex_l5_pyr','cortex_l5_int',.5,5],
 ['cortex_l5_int','cortex_l5_pyr',.7,5],
 ['cortex_l6_pyr','thalamus_relay',.6,10],
 // Entorhinal -> dentate -> CA3 -> CA1 -> subiculum -> entorhinal.
 ['entorhinal','dentate_granule',.95,5],
 ['dentate_granule','ca3_pyramidal',.95,5],
 ['ca3_pyramidal','ca3_pyramidal',.4,5],
 ['ca3_pyramidal','ca1_pyramidal',.95,5],
 ['ca1_pyramidal','subiculum',.85,5],
 ['subiculum','entorhinal',.45,10],
 ['entorhinal','ca1_pyramidal',.4,5],
 ['ca3_pyramidal','hippocampal_int',.65,5],
 ['hippocampal_int','ca1_pyramidal',.65,5],
 // Direct, indirect and hyperdirect basal ganglia motifs.
 ['cortex_l5_pyr','striatum_d1',.85,5],
 ['cortex_l5_pyr','striatum_d2',.85,5],
 ['cortex_l5_pyr','subthalamic_nucleus',.65,5],
 ['striatum_d1','globus_pallidus_internal',.85,5],
 ['striatum_d2','globus_pallidus_external',.8,5],
 ['globus_pallidus_external','subthalamic_nucleus',.75,5],
 ['globus_pallidus_external','globus_pallidus_internal',.4,5],
 ['subthalamic_nucleus','globus_pallidus_internal',.9,5],
 ['globus_pallidus_internal','thalamus_motor',.9,5],
 ['thalamus_motor','cortex_l5_pyr',.6,5],
 // Cerebellar granule–Purkinje–deep nuclei, mossy and climbing fibers.
 ['cerebellum_mossy','cerebellum_granule',.9,5],
 ['cerebellum_granule','cerebellum_purkinje',.9,5],
 ['inferior_olive','cerebellum_purkinje',.8,5],
 ['cerebellum_purkinje','cerebellum_deep',.9,5],
 ['cerebellum_mossy','cerebellum_deep',.65,5],
 ['cerebellum_deep','thalamus_motor',.65,5],
 // Amygdalar nuclei are NOT one generic fear node.
 ['amygdala_basolateral','amygdala_intercalated',.65,5],
 ['amygdala_basolateral','amygdala_central',.7,5],
 ['amygdala_intercalated','amygdala_central',.9,5],
 ['amygdala_central','hypothalamus_pvn',.55,5],
 ['entorhinal','amygdala_basolateral',.35,5]
];
const freezeDeep=list=>Object.freeze(list.map(x=>Object.freeze(x)));
const nodes=freezeDeep(N.map(([id,region,kind,tau_ms])=>({id,region,kind,tau_ms,
  neuron_population_not_single_cell:true})));
const nodeIndex=new Map(nodes.map((node,i)=>[node.id,i]));
const edges=freezeDeep(E.map(([from,to,weight,delay_ms],i)=>({
 id:'projection_'+i,from,to,weight,delay_ms,
 transmitter_class:nodes[nodeIndex.get(from)].kind==='I'?'inhibitory':'excitatory',
 plastic:(from==='dentate_granule'||from==='ca3_pyramidal'||
   from==='cerebellum_granule'||from==='cortex_l4_spiny'),
 anatomical_human_connection_verified:false,
 synaptic_density_measured:false
})));
export const CIRCUIT_MOTIFS=Object.freeze({schema:CIRCUIT_MOTIF_SCHEMA,nodes,edges,
 evidence:'qualitative-anatomical-motifs-not-human-quantitative-connectomics'});
const round=x=>Number(x.toFixed(7));
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const validate=(x,a,b,name)=>{
 if(typeof x!=='number'||!Number.isFinite(x)||x<a||x>b)
  throw new RangeError('invalid '+name);
 return x;
};
export function simulateAnatomicalMotifs({
 duration_ms=700,dt_ms=5,stimuli=[
  {node:'thalamus_relay',amplitude:.85,start_ms:0,end_ms:300},
  {node:'entorhinal',amplitude:.75,start_ms:0,end_ms:300}
 ],remove_projections=[],metabolic_supply=.9,
 inflammation=0,plasticity_enabled=true,glia_enabled=true,
 developmental_stage=.8,excitatory_gain=1,inhibitory_gain=1,
 plasticity_learning_gain=1
}={}){
 validate(duration_ms,5,2500,'duration');
 validate(dt_ms,1,10,'step');
 if(duration_ms/dt_ms>600)throw new RangeError('CPU simulation budget');
 validate(metabolic_supply,0,1,'metabolic supply');
 validate(inflammation,0,1,'inflammation');
 validate(developmental_stage,0,1,'development');
 validate(excitatory_gain,.2,2,'excitatory gain');
 validate(inhibitory_gain,.2,2,'inhibitory gain');
 validate(plasticity_learning_gain,0,3,'plasticity gain');
 if(typeof plasticity_enabled!=='boolean'||typeof glia_enabled!=='boolean')
  throw new TypeError('boolean circuit flags required');
 if(!Array.isArray(stimuli)||stimuli.length>16)throw new RangeError('bounded stimuli');
 for(const s of stimuli){
  if(!nodeIndex.has(s?.node))throw new TypeError('unknown input population');
  validate(s.amplitude,0,1,'stimulus amplitude');
  validate(s.start_ms,0,duration_ms,'stimulus start');
  validate(s.end_ms,0,duration_ms,'stimulus end');
  if(s.end_ms<=s.start_ms)throw new RangeError('stimulus interval');
 }
 if(!Array.isArray(remove_projections)||remove_projections.length>edges.length)
  throw new RangeError('bounded projection lesions');
 const known=new Set(edges.map(e=>e.id));
 const removed=new Set(remove_projections);
 if(removed.size!==remove_projections.length||
  [...removed].some(id=>typeof id!=='string'||!known.has(id)))
  throw new TypeError('invalid projection ablation');
 const steps=Math.ceil(duration_ms/dt_ms),n=nodes.length;
 const activity=new Float64Array(n),history=[];
 const syn=edges.map(e=>({weight:e.weight,resources:1,utilization:.22}));
 let glia=initialGlialState();
 let oxygen=.9,glucose=.9,atp=.85,lactate=.05;
 const samples=[];
 const active=edges.filter(e=>!removed.has(e.id));
 for(let tick=0;tick<steps;tick++){
  const t=tick*dt_ms,elapsed_s=dt_ms/1000;
  const avg=activity.reduce((a,v)=>a+v,0)/n;
  const consumption=avg*.35;
  oxygen=clamp(oxygen+elapsed_s*((metabolic_supply-oxygen)/.5-consumption*.20));
  glucose=clamp(glucose+elapsed_s*((metabolic_supply-glucose)/.8-consumption*.12));
  atp=clamp(atp+elapsed_s*((oxygen*glucose-atp)/.6-consumption*.40));
  lactate=clamp(lactate+elapsed_s*(consumption*.18-lactate*.08));
  if(glia_enabled){
   glia=advanceGlialState(glia,{
    seconds:elapsed_s,energy_supply:atp,inflammatory_signal:inflammation,
    neuronal_k_release_mM_per_s:clamp(avg*.25,0,1),
    neuronal_glutamate_release_relative_per_s:clamp(avg*.06,0,.5)
   }).state;
  }
  const drives=new Float64Array(n);
  for(const stimulus of stimuli){
   if(t>=stimulus.start_ms&&t<stimulus.end_ms)
    drives[nodeIndex.get(stimulus.node)]+=stimulus.amplitude;
  }
  // Delay is determined by a past activity snapshot, NEVER future activity.
  for(const edge of active){
   const idx=Number(edge.id.slice(11)),s=syn[idx];
   const pastTick=tick-Math.max(1,Math.ceil(edge.delay_ms/dt_ms));
   const past=pastTick>=0?history[pastTick][nodeIndex.get(edge.from)]:0;
   s.resources=clamp(1-(1-s.resources)*Math.exp(-dt_ms/600));
   s.utilization=clamp(.22+(s.utilization-.22)*Math.exp(-dt_ms/150));
   const release=s.weight*s.resources*s.utilization*past;
   drives[nodeIndex.get(edge.to)]+=edge.transmitter_class==='excitatory'?
    release*excitatory_gain:-release*inhibitory_gain;
   s.resources=clamp(s.resources-(dt_ms/40)*s.resources*s.utilization*past);
   s.utilization=clamp(s.utilization+.025*past*(1-s.utilization));
  }
  const excitability=(.45+.55*atp)*
    (glia_enabled?clamp(1-.06*Math.max(0,glia.extracellular_potassium_mM-3.5),.3,1):1);
  const before=Float64Array.from(activity);
  for(let i=0;i<n;i++){
   const target=clamp(drives[i]*excitability*(.75+.25*developmental_stage));
   activity[i]=clamp(activity[i]+(dt_ms/nodes[i].tau_ms)*(target-activity[i]));
  }
  if(plasticity_enabled){
   for(const e of active){
    if(!e.plastic)continue;
    const s=syn[Number(e.id.slice(11))];
    const pre=before[nodeIndex.get(e.from)],post=activity[nodeIndex.get(e.to)];
    // Co-activity rule is NOT STDP; event-level STDP is a separate model.
    s.weight=clamp(s.weight+dt_ms*.00005*plasticity_learning_gain*
      (pre*post-.05*post*post),.05,1);
   }
  }
  history.push(Float64Array.from(activity));
  if(tick%Math.max(1,Math.round(25/dt_ms))===0||tick===steps-1)
   samples.push({time_ms:round((tick+1)*dt_ms),
    cortex_l4:round(activity[nodeIndex.get('cortex_l4_spiny')]),
    hippocampus_ca1:round(activity[nodeIndex.get('ca1_pyramidal')]),
    bg_gpi:round(activity[nodeIndex.get('globus_pallidus_internal')]),
    cerebellum_deep:round(activity[nodeIndex.get('cerebellum_deep')]),
    atp:round(atp)});
 }
 const output=Object.fromEntries(nodes.map((n,i)=>[n.id,round(activity[i])]));
 return {schema:CIRCUIT_MOTIF_SCHEMA,simulation_ms:round(steps*dt_ms),
  populations:n,projections:active.length,removed_projections:[...removed],
  six_cortical_layers:['cortex_L1','cortex_L2','cortex_L3','cortex_L4','cortex_L5','cortex_L6'],
  rates:output,
  trace:samples.slice(0,110),
  metabolism:{oxygen_relative:round(oxygen),glucose_relative:round(glucose),
   atp_relative:round(atp),lactate_relative:round(lactate)},
  glia:glia_enabled?glia:null,
  plasticity:{mechanism:'rate-coactivity-on-selected-projections',
    enabled:plasticity_enabled,plastic_projection_count:active.filter(e=>e.plastic).length,
    weight_changes:active.filter(e=>e.plastic).map(e=>({
      id:e.id,from:e.from,to:e.to,
      before:e.weight,after:round(syn[Number(e.id.slice(11))].weight)
    }))},
  source:'hypothesis-level-qualitative-wiring',
  simulated_populations_not_reconstructed_human_regions:true,
  measured_human_synaptic_fidelity:false,
  gene_transcriptome_calibrated:false,
  experimental_expression_gains:{excitatory_gain,inhibitory_gain,plasticity_learning_gain},
  eeg_or_connectomics_validation:false,
  production_organism_unchanged:true,language_model_used:false};
}
export function pairedCircuitAblation(options={},projection_id){
 if(typeof projection_id!=='string'||!edges.some(e=>e.id===projection_id))
  throw new TypeError('valid projection id required');
 if(options?.remove_projections?.length)throw new TypeError('nested ablation not permitted');
 const intact=simulateAnatomicalMotifs(options);
 const ablated=simulateAnatomicalMotifs({...options,remove_projections:[projection_id]});
 const delta=Object.fromEntries(Object.keys(intact.rates).map(id=>[
   id,round(ablated.rates[id]-intact.rates[id])
 ]));
 return {intact,ablated,delta,
  inference_scope:'in-silico-model-causal-difference-not-human-biological-evidence',
  production_write_authorized:false};
}