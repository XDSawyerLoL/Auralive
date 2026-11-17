import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PLASTICITY_SCHEMA,initialPlasticSynapse,advancePlasticSynapse,
 compareSpikeOrder} from '../src/neural_plasticity.js';
import {CIRCUIT_MOTIFS,simulateAnatomicalMotifs,pairedCircuitAblation}
 from '../src/anatomical_circuit_motifs.js';
const stimulus=(node,amplitude=.85)=>({node,amplitude,start_ms:0,end_ms:360});
const simulate=(extra={})=>simulateAnatomicalMotifs({
 duration_ms:650,dt_ms:5,stimuli:[stimulus('thalamus_relay'),stimulus('entorhinal')],
 ...extra});
test('STDP pairing order changes synaptic efficacy in opposite directions',()=>{
 const pair=compareSpikeOrder({delay_ms:9});
 assert.ok(pair.pre_before_post>.5);
 assert.ok(pair.post_before_pre<.5);
 assert.equal(pair.human_synaptic_fidelity,false);
 const a=initialPlasticSynapse();
 assert.equal(a.schema,PLASTICITY_SCHEMA);
 assert.equal(a.spike_count_pre,0);
});
test('short-term presynaptic resources deplete and then recover',()=>{
 let x=initialPlasticSynapse({weight:.7,baseline_utilization:.4});
 const baseline=x.resources;
 const effects=[];
 for(const t of [1,2,3,4]){
  const a=advancePlasticSynapse(x,{time_ms:t,pre_spike:true});
  effects.push(a.released_efficacy);x=a.state;
 }
 assert.ok(x.resources<baseline);
 assert.ok(effects.at(-1)<effects[0],'short-term depression is measurable');
 const recovered=advancePlasticSynapse(x,{time_ms:2000});
 assert.ok(recovered.state.resources>x.resources);
 assert.ok(recovered.state.resources<=1);
 assert.equal(recovered.production_write_authorized,false);
});
test('STDP can be disabled and rejects impossible times or spoofed state',()=>{
 const start=initialPlasticSynapse();
 const pre=advancePlasticSynapse(start,{time_ms:1,pre_spike:true,
  plasticity_enabled:false});
 const after=advancePlasticSynapse(pre.state,{time_ms:10,post_spike:true,
  plasticity_enabled:false});
 assert.equal(after.state.weight,start.weight);
 assert.throws(()=>advancePlasticSynapse(after.state,{time_ms:5}),/invalid/);
 assert.throws(()=>advancePlasticSynapse({schema:'other'},{time_ms:1}),/invalid/);
 assert.throws(()=>initialPlasticSynapse({a_plus:Infinity}),/invalid/);
});
test('anatomical motif graph explicitly represents cortical layers, brain regions and synapse polarity',()=>{
 assert.equal(CIRCUIT_MOTIFS.schema,'aura-anatomical-rate-motifs-v1');
 const names=new Set(CIRCUIT_MOTIFS.nodes.map(x=>x.id));
 assert.ok(names.size>=29);
 for(let layer=1;layer<=6;layer++)
  assert.ok(CIRCUIT_MOTIFS.nodes.some(x=>x.region==='cortex_L'+layer));
 for(const name of ['dentate_granule','ca3_pyramidal','ca1_pyramidal','subiculum',
  'striatum_d1','striatum_d2','globus_pallidus_external',
  'globus_pallidus_internal','subthalamic_nucleus','cerebellum_granule',
  'cerebellum_purkinje','cerebellum_deep'])
  assert.ok(names.has(name),name);
 for(const edge of CIRCUIT_MOTIFS.edges){
  assert.ok(names.has(edge.from)&&names.has(edge.to));
  assert.ok(edge.delay_ms>0);
  assert.equal(edge.anatomical_human_connection_verified,false);
  const from=CIRCUIT_MOTIFS.nodes.find(x=>x.id===edge.from);
  assert.equal(edge.transmitter_class,from.kind==='I'?'inhibitory':'excitatory');
 }
});
test('simulator propagates causal stimulation without simulating a complete human brain',()=>{
 const result=simulate();
 assert.ok(result.rates.thalamus_relay>=0);
 assert.ok(result.trace.some(s=>s.cortex_l4>0));
 assert.ok(result.trace.some(s=>s.hippocampus_ca1>0));
 assert.ok(result.rates.cerebellum_deep===0,'no artificial cerebellar spontaneous activation');
 assert.equal(result.six_cortical_layers.length,6);
 assert.equal(result.measured_human_synaptic_fidelity,false);
 assert.equal(result.production_organism_unchanged,true);
 assert.equal(result.language_model_used,false);
 assert.deepEqual(result,simulate(),'deterministic replay must reproduce state');
});
test('lesion of hippocampal DG to CA3 connection disrupts downstream CA1 activity',()=>{
 const edge=CIRCUIT_MOTIFS.edges.find(e=>e.from==='dentate_granule'&&e.to==='ca3_pyramidal');
 const result=pairedCircuitAblation({
  duration_ms:600,dt_ms:5,stimuli:[stimulus('entorhinal',.95)],
 },edge.id);
 const a=Math.max(...result.intact.trace.map(x=>x.hippocampus_ca1));
 const b=Math.max(...result.ablated.trace.map(x=>x.hippocampus_ca1));
 assert.ok(a>b,'CA1 response must depend on the intact DG→CA3 projection');
 assert.equal(result.production_write_authorized,false);
});
test('direct striatal route inhibits GPi; lesion changes effect of the same stimulus',()=>{
 const edge=CIRCUIT_MOTIFS.edges.find(e=>e.from==='striatum_d1'&&e.to==='globus_pallidus_internal');
 const result=pairedCircuitAblation({
  duration_ms:700,dt_ms:5,
  stimuli:[stimulus('striatum_d1',.95),stimulus('globus_pallidus_internal',.45)],
 },edge.id);
 assert.ok(result.ablated.trace.reduce((sum,x)=>sum+x.bg_gpi,0)>
  result.intact.trace.reduce((sum,x)=>sum+x.bg_gpi,0));
});
test('Purkinje-to-deep nucleus inhibition is causally demonstrable',()=>{
 const edge=CIRCUIT_MOTIFS.edges.find(e=>e.from==='cerebellum_purkinje'&&e.to==='cerebellum_deep');
 const result=pairedCircuitAblation({
  duration_ms:700,dt_ms:5,
  stimuli:[stimulus('cerebellum_purkinje',.9),stimulus('cerebellum_deep',.4)]
 },edge.id);
 assert.ok(result.ablated.trace.reduce((sum,x)=>sum+x.cerebellum_deep,0)>
  result.intact.trace.reduce((sum,x)=>sum+x.cerebellum_deep,0));
});
test('adequate metabolic supply and glia yield different states than low supply',()=>{
 const good=simulate({duration_ms:1000,stimuli:[stimulus('thalamus_relay',.95)],
  metabolic_supply:1,glia_enabled:true});
 const poor=simulate({duration_ms:1000,stimuli:[stimulus('thalamus_relay',.95)],
  metabolic_supply:0,glia_enabled:true});
 assert.ok(good.metabolism.atp_relative>poor.metabolism.atp_relative);
 assert.ok(good.metabolism.oxygen_relative>poor.metabolism.oxygen_relative);
 assert.ok(good.rates.thalamus_relay>=poor.rates.thalamus_relay);
 assert.equal(good.glia.schema,'aura-glial-homeostasis-toy-v1');
});
test('coactivity adjusts only selected experimental projections, not production memory',()=>{
 const s=simulate({plasticity_enabled:true,stimuli:[
  stimulus('entorhinal',1),stimulus('dentate_granule',1),stimulus('ca3_pyramidal',1)]
 });
 const inactive=simulate({plasticity_enabled:false,stimuli:[
  stimulus('entorhinal',1),stimulus('dentate_granule',1),stimulus('ca3_pyramidal',1)]
 });
 assert.ok(s.plasticity.weight_changes.some(x=>x.after!==x.before));
 assert.ok(inactive.plasticity.weight_changes.every(x=>x.after===x.before));
 assert.equal(s.production_organism_unchanged,true);
});
test('invalid anatomical stimulation and oversized workloads are rejected',()=>{
 assert.throws(()=>simulateAnatomicalMotifs({duration_ms:10000}),/invalid/);
 assert.throws(()=>simulateAnatomicalMotifs({duration_ms:2500,dt_ms:1}),/budget/);
 assert.throws(()=>simulateAnatomicalMotifs({stimuli:[stimulus('invented')]}),/unknown/);
 assert.throws(()=>simulateAnatomicalMotifs({remove_projections:['fake']}),/invalid/);
 assert.throws(()=>pairedCircuitAblation({},'fake'),/valid/);
});
test('secure routes expose bounded experiments only and never mutate AURA',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 for(const name of ['/api/research/neurobiology/circuits',
  '/api/research/neurobiology/plasticity']){
  const start=server.indexOf("app.post('"+name+"'");
  assert.ok(start>0,name);
  const block=server.slice(start,start+1100);
  assert.match(block,/requirePrivate\(request,reply\)/);
  assert.match(block,/sameOrigin\(request\)/);
  assert.match(block,/private, no-store/);
 }
 assert.match(server,/production_organism_unchanged:true/);
 assert.match(server,/production_memory_unchanged:true/);
});