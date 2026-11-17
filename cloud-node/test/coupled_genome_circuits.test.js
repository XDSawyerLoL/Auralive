import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNeuroGenome} from '../src/neurodevelopmental_genome.js';
import {simulateCoupledGenomeCircuit,pairedGeneticCircuitAblation}
 from '../src/coupled_genome_circuits.js';
const env={developmental_stage:.55,activity:.7,metabolic_supply:.8,inflammation:.15};
const options={duration_ms:700,dt_ms:5,stimuli:[
 {node:'thalamus_relay',amplitude:1,start_ms:0,end_ms:500},
 {node:'entorhinal',amplitude:.9,start_ms:0,end_ms:500},
 {node:'dentate_granule',amplitude:.8,start_ms:0,end_ms:500}]};
test('numerical cell-class expression has causal influence on research circuit gains',()=>{
 const genome=createNeuroGenome({seed:'research-test'});
 const result=simulateCoupledGenomeCircuit({genome,environment:env,circuit_options:options});
 assert.equal(result.causal_inputs.myelin_proxy_locus>=0,true);
 assert.ok(result.derived_gains.excitatory_gain>=.2);
 assert.ok(result.derived_gains.inhibitory_gain>=.2);
 assert.ok(result.derived_gains.plasticity_learning_gain>=0);
 assert.ok(result.derived_gains.conduction_gain>=.5);
 assert.equal(result.genome_sequence_not_returned,true);
 assert.equal(result.production_state_unchanged,true);
 assert.equal(result.hypotheses.regulation_from_real_human_transcriptomics,false);
 assert.deepEqual(result,simulateCoupledGenomeCircuit({
  genome,environment:env,circuit_options:options}));
});
test('silencing an excitability locus changes computed downstream trajectories',()=>{
 const genome=createNeuroGenome({seed:'membrane-ablation'});
 const x=pairedGeneticCircuitAblation({genome,locus:'membrane_excitability',
  environment:env,circuit_options:options});
 assert.equal(x.observed_effect_in_toy,true);
 assert.notEqual(x.baseline.derived_gains.excitatory_gain,x.perturbed.derived_gains.excitatory_gain);
 assert.equal(x.independent_human_gene_to_neuron_validation,false);
 assert.equal(x.production_state_unchanged,true);
 assert.equal(x.intervention,'numeric-locus-lowered-to-AAAAAA-not-biological-knockout');
});
test('learning locus changes circuit coactivity plasticity even without an LLM',()=>{
 const genome=createNeuroGenome({seed:'learning-ablation'});
 const x=pairedGeneticCircuitAblation({genome,locus:'learning_plasticity',
  environment:env,circuit_options:options});
 assert.notEqual(x.baseline.derived_gains.plasticity_learning_gain,
  x.perturbed.derived_gains.plasticity_learning_gain);
 const pre=x.baseline.circuit.plasticity.weight_changes;
 const after=x.perturbed.circuit.plasticity.weight_changes;
 assert.ok(pre.some((row,i)=>row.after!==after[i].after));
 assert.equal(x.llm_used,false);
});
test('glial and myelin loci influence independent supply and conduction coefficients',()=>{
 const genome=createNeuroGenome({seed:'neuroglia-ablation'});
 const a=pairedGeneticCircuitAblation({genome,locus:'astrocyte_energy_reserve',
  environment:env,circuit_options:options});
 assert.ok(a.baseline.model_environment.metabolic_supply>=
  a.perturbed.model_environment.metabolic_supply);
 const b=pairedGeneticCircuitAblation({genome,locus:'myelin_maintenance',
  environment:env,circuit_options:options});
 assert.ok(b.baseline.derived_gains.conduction_gain>=
  b.perturbed.derived_gains.conduction_gain);
 assert.equal(b.baseline.hypotheses.myelin_conduction_link_validated,false);
});
test('an unsupported mutation or excessive CPU budget is refused',()=>{
 const genome=createNeuroGenome({seed:'invalid-input'});
 assert.throws(()=>pairedGeneticCircuitAblation({
  genome,locus:'invented-gene'}),/unknown/);
 assert.throws(()=>simulateCoupledGenomeCircuit({genome,environment:{
  metabolic_supply:2}}),/invalid/);
 assert.throws(()=>simulateCoupledGenomeCircuit({
  genome,circuit_options:{duration_ms:3000}}),/invalid/);
});
test('coupled-genome route is guarded and never activates biological identity in production',()=>{
 const src=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const at=src.indexOf("app.post('/api/research/neurobiology/coupled-genome'");
 assert.ok(at>0);
 const block=src.slice(at,at+1500);
 assert.match(block,/requirePrivate\(request,reply\)/);
 assert.match(block,/sameOrigin\(request\)/);
 assert.match(block,/private, no-store/);
 assert.match(block,/production_state_unchanged:true/);
 assert.match(block,/human_gene_to_neuron_calibrated:false/);
});
