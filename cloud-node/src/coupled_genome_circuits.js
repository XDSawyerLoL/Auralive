// Coupled functional *hypotheses* connecting numerical locus expression to
// research circuits. NOT human gene regulation, biological development or an
// executable genome in AURA. No writes to memory, policy or production state.
import {createNeuroGenome,sealNeuroGenome,expressNeuroGenome,
  NEURO_GENOME_LOCUS_NAMES} from './neurodevelopmental_genome.js';
import {simulateAnatomicalMotifs} from './anatomical_circuit_motifs.js';
export const COUPLED_GENOME_CIRCUIT_SCHEMA='aura-genotype-circuit-causal-prototype-v1';
const clip=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const finite=(x,a,b,label)=>{
 if(typeof x!=='number'||!Number.isFinite(x)||x<a||x>b)
  throw new RangeError('invalid '+label);
 return x;
};
const round=x=>Number(x.toFixed(7));
export function simulateCoupledGenomeCircuit({
 genome=createNeuroGenome({seed:'aura-research-coupled-genesis'}),
 environment={},
 circuit_options={}
}={}){
 if(!environment||typeof environment!=='object'||Array.isArray(environment)||
  !circuit_options||typeof circuit_options!=='object'||Array.isArray(circuit_options))
  throw new TypeError('research environment and circuit options required');
 const stage=environment.developmental_stage??.6,
  activity=environment.activity??.55,
  nutrient=environment.metabolic_supply??.9,
  inflammation=environment.inflammation??0;
 for(const [key,value] of Object.entries({
  developmental_stage:stage,activity,metabolic_supply:nutrient,inflammation
 }))finite(value,0,1,key);
 const ctx={development:stage,activity,metabolic_pressure:1-nutrient,
  inflammatory_signal:inflammation};
 const excit=expressNeuroGenome(genome,{...ctx,cell_type:'excitatory_neuron'});
 const inhib=expressNeuroGenome(genome,{...ctx,cell_type:'inhibitory_neuron'});
 const astro=expressNeuroGenome(genome,{...ctx,cell_type:'astrocyte'});
 const oligo=expressNeuroGenome(genome,{...ctx,cell_type:'oligodendrocyte'});
 const micro=expressNeuroGenome(genome,{...ctx,cell_type:'microglia'});
 const gains={
  excitatory_gain:round(.55+1.25*excit.expression.membrane_excitability),
  inhibitory_gain:round(.55+1.25*inhib.expression.inhibitory_excitability),
  plasticity_learning_gain:round(.10+2*excit.expression.learning_plasticity),
  conduction_gain:round(.7+.6*oligo.expression.myelin_maintenance),
 };
 const modelEnvironment={
  metabolic_supply:clip(nutrient*(.75+.25*astro.expression.astrocyte_energy_reserve)),
  inflammation:clip(inflammation*(1-.25*micro.expression.microglial_resolution)),
  developmental_stage:clip(stage*(.65+.35*excit.expression.synapse_formation)),
 };
 const options={...circuit_options,...gains,...modelEnvironment};
 const model=simulateAnatomicalMotifs(options);
 return {
  schema:COUPLED_GENOME_CIRCUIT_SCHEMA,genome_id:genome.id,
  causal_inputs:{
   excitability_locus:excit.expression.membrane_excitability,
   inhibitory_locus:inhib.expression.inhibitory_excitability,
   synapse_formation_locus:excit.expression.synapse_formation,
   plasticity_locus:excit.expression.learning_plasticity,
   astrocyte_energy_locus:astro.expression.astrocyte_energy_reserve,
   myelin_proxy_locus:oligo.expression.myelin_maintenance,
   microglial_resolution_locus:micro.expression.microglial_resolution
  },
  derived_gains:gains,model_environment:modelEnvironment,
  circuit:model,
  hypotheses:{
   genotype_numeric_only:true,
   regulation_from_real_human_transcriptomics:false,
   human_morphogenesis_reproduced:false,
   no_individual_human_genome:true,
   no_validated_neurophysiological_causation:true,
   myelin_conduction_link_validated:false
  },
  production_state_unchanged:true,genome_sequence_not_returned:true,
  llm_used:false};
}
export function pairedGeneticCircuitAblation({
 genome=createNeuroGenome({seed:'aura-research-coupled-genesis'}),
 locus='membrane_excitability',environment={},circuit_options={}
}={}){
 const index=NEURO_GENOME_LOCUS_NAMES.indexOf(locus);
 if(index<0)throw new TypeError('unknown research locus');
 const baseline=simulateCoupledGenomeCircuit({genome,environment,circuit_options});
 const altered=genome.dna.slice(0,index*6)+'AAAAAA'+genome.dna.slice(index*6+6);
 const reduced=sealNeuroGenome(altered,{
  generation:genome.generation,parent_ids:genome.parent_ids});
 const perturbed=simulateCoupledGenomeCircuit({
  genome:reduced,environment,circuit_options});
 const delta=Object.fromEntries(Object.keys(baseline.circuit.rates).map(key=>[
  key,round(perturbed.circuit.rates[key]-baseline.circuit.rates[key])
 ]));
 return {
  schema:COUPLED_GENOME_CIRCUIT_SCHEMA,locus,
  intervention:'numeric-locus-lowered-to-AAAAAA-not-biological-knockout',
  baseline_id:baseline.genome_id,perturbed_id:perturbed.genome_id,
  baseline,perturbed,rate_differences:delta,
  observed_effect_in_toy: Object.values(delta).some(v=>v!==0)||
   baseline.circuit.trace.some((x,i)=>Object.keys(x).some(key=>
    key!=='time_ms'&&Math.abs(x[key]-perturbed.circuit.trace[i][key])>1e-7))||
   baseline.circuit.plasticity.weight_changes.some((x,i)=>
    x.after!==perturbed.circuit.plasticity.weight_changes[i]?.after),
  causal_scope:'within-stipulated-numeric-model-only',
  independent_human_gene_to_neuron_validation:false,
  production_state_unchanged:true,llm_used:false
 };
}