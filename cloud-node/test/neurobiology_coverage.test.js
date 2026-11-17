import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createNeuroGenome,expressNeuroGenome,mutateNeuroGenome,
 ablateNeuroGenomeLocus,sealNeuroGenome,NEURO_GENOME_CELL_TYPES,
 NEURO_GENOME_LOCUS_NAMES} from '../src/neurodevelopmental_genome.js';
import {initialGlialState,advanceGlialState,compareGlialUptake}
 from '../src/biophysical_glia.js';
import {neurobiologyCoverageAudit} from '../src/neurobiology_coverage.js';

test('AURA genotype models 24 distinct functional numeric loci in five cell classes',()=>{
 const g=createNeuroGenome({seed:'AURA-20261116'});
 assert.equal(g.dna.length,144);
 assert.deepEqual(g,createNeuroGenome({seed:'AURA-20261116'}));
 assert.equal(NEURO_GENOME_CELL_TYPES.length,5);
 const all=[];
 for(const cell_type of NEURO_GENOME_CELL_TYPES){
  const x=expressNeuroGenome(g,{cell_type});
  assert.equal(x.biological_equivalence,false);
  assert.equal(x.transcriptomics_fitted,false);
  assert.equal(x.production_write_authorized,false);
  for(const [name,value] of Object.entries(x.expression)){
   all.push(name);assert.ok(value>=0&&value<=1);
  }
 }
 assert.equal(new Set(all).size,24);
 assert.deepEqual(all.sort(),[...NEURO_GENOME_LOCUS_NAMES].sort());
 assert.throws(()=>expressNeuroGenome({...g,dna:'C'+g.dna.slice(1)},
  {cell_type:'astrocyte'}),/integrity/);
 assert.throws(()=>sealNeuroGenome(g.dna,{parent_ids:['bad']}),/ancestry/);
});
test('regulation uses environmental and epi parameters only in sandbox',()=>{
 const g=createNeuroGenome({seed:'glia-program'});
 const low=expressNeuroGenome(g,{cell_type:'astrocyte',metabolic_pressure:0});
 const high=expressNeuroGenome(g,{cell_type:'astrocyte',metabolic_pressure:1});
 assert.ok(high.expression.astrocyte_energy_reserve<low.expression.astrocyte_energy_reserve);
 assert.ok(high.expression.potassium_clearance<=low.expression.potassium_clearance);
 const ep=expressNeuroGenome(g,{cell_type:'astrocyte',epigenetic_marks:{potassium_clearance:1}});
 assert.ok(ep.expression.potassium_clearance>=low.expression.potassium_clearance);
 assert.equal(mutateNeuroGenome(g,{seed:'child',sites:3}).edited_bases.length,3);
 const knock=ablateNeuroGenomeLocus(g,{cell_type:'astrocyte',locus:'glutamate_uptake'});
 assert.ok(knock.after<=knock.before);
 assert.equal(knock.production_write_authorized,false);
 assert.throws(()=>expressNeuroGenome(g,{cell_type:'astrocyte',
  epigenetic_marks:{fabricated:1}}),/unknown/);
});
test('glial toy supports reproducible uptake ablation without affecting real AURA',()=>{
 const state=initialGlialState();
 const params={seconds:30,neuronal_k_release_mM_per_s:.12,
  neuronal_glutamate_release_relative_per_s:.008};
 const result=advanceGlialState(state,params);
 assert.ok(result.exchange.potassium_uptake_mM_equivalent>0);
 assert.ok(result.exchange.glutamate_uptake_relative>0);
 assert.equal(result.annotation.human_glial_equivalence,false);
 assert.equal(result.annotation.production_mutation_allowed,false);
 assert.equal(state.time_s,0);
 const pair=compareGlialUptake(state,params);
 assert.ok(pair.extracellular_k_difference_mM<0);
 assert.equal(pair.brain_function_validated,false);
 assert.deepEqual(advanceGlialState(state,params),result);
});
test('microglial and myelin variables respond to stimulus, not a synthetic UI tick',()=>{
 const state=initialGlialState();
 const stress=advanceGlialState(state,{seconds:60,inflammatory_signal:1,energy_supply:.4});
 const control=advanceGlialState(state,{seconds:60,inflammatory_signal:0,energy_supply:.4});
 assert.ok(stress.state.microglial_activation>control.state.microglial_activation);
 assert.ok(stress.state.myelin_integrity<control.state.myelin_integrity);
 assert.throws(()=>advanceGlialState(state,{seconds:100}),/bounds/);
 assert.throws(()=>advanceGlialState({...state,astrocyte_atp_fraction:Infinity}),/invalid/);
});
test('coverage exposes missing human circuits and genetic incompleteness',()=>{
 const audit=neurobiologyCoverageAudit();
 assert.equal(audit.examined_systems,32);
 assert.equal(Object.values(audit.counts).reduce((a,b)=>a+b,0),32);
 assert.ok(audit.counts['not-reconstructed']>=3);
 assert.equal(audit.whole_human_brain_equivalent,false);
 assert.equal(audit.molecular_human_genome_equivalent,false);
 assert.ok(audit.systems.every(x=>x.brain_equivalent_verified===false));
 for(const required of ['cerebellum_Purkinje_deep_nuclei',
  'hippocampus_dentate_CA3_CA1_subiculum','basal_ganglia_direct_indirect_hyperdirect'])
  assert.ok(audit.systems.some(x=>x.id===required),required);
});
test('research endpoints are origin protected and cannot write production state',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const start=server.indexOf("app.post('/api/research/neurobiology/genome'");
 const other=server.indexOf("app.post('/api/research/neurobiology/glia'");
 assert.ok(start>0&&other>start);
 for(const block of [server.slice(start,other),server.slice(other,other+1000)]){
  assert.match(block,/requirePrivate\(request,reply\)/);
  assert.match(block,/sameOrigin\(request\)/);
  assert.match(block,/private, no-store/);
 }
 assert.match(server,/app.get\('\/api\/research\/neurobiology\/coverage'/);
 assert.match(server,/production_state_unchanged:true/);
 assert.match(server,/production_genome_unchanged:true/);
});
