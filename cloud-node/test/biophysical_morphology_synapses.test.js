import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNeuronSWC,constructHumanPassiveArbor,
  advancePassiveArbor,runPassiveArbor} from '../src/biophysical_morphology.js';
import {magnesiumUnblock,RECEPTOR_KINETICS,conductanceAt,
  synapticInputsAt,simulateSynapticArbor} from '../src/biophysical_synapses.js';
import {ALLEN_FEATURE_SCHEMA} from '../src/human_ephys_calibration.js';

// Synthetic TEST morphology and ephys, not authentic human samples.
const swc=`# synthetic geometry, in micrometres
1 1 0 0 0 10 -1
2 3 0 40 0 2 1
3 3 0 80 0 1.5 2
4 4 20 0 0 1.2 1
`;
function ephys(){
  return {schema_version:ALLEN_FEATURE_SCHEMA,species:'Homo sapiens',
    specimen_id:643625553,
    features:{vrest_mV:-65,input_resistance_MOhm:150,membrane_tau_ms:18},
    source:{dataset:'Allen Cell Types Database',
      method:'AllenSDK.CellTypesCache.get_ephys_features',
      human_specimen_verified:true,
      url:'https://celltypes.brain-map.org/data?donor__species=Homo+Sapiens',
      feature_units:{vrest:'mV',ri:'MOhm',tau:'ms'},
      extraction_software:'synthetic-test-fixture-only'}};
}
const model=()=>constructHumanPassiveArbor({swcText:swc,humanFeatures:ephys()});
const err=(fn)=>assert.throws(fn);

test('SWC branching connectivity, units, geometry and species provenance remain explicit',()=>{
  const parsed=parseNeuronSWC(swc,{expectedSpecimenId:643625553});
  assert.equal(parsed.root_id,1);
  assert.equal(parsed.compartment_count,4);
  const arbor=model();
  assert.equal(arbor.specimen_id,'643625553');
  assert.deepEqual(arbor.parent,[-1,0,1,0]);
  assert.equal(arbor.count,4);
  assert.ok(arbor.gAxial_nS[2]>0);
  assert.ok(arbor.total_surface_um2>0);
  const cap=arbor.capacitance_pF.reduce((a,b)=>a+b,0);
  const g=arbor.leak_nS.reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(cap-120)<1e-8,'18 ms and 150 MOhm imply 120 pF');
  assert.ok(Math.abs(g-(1000/150))<1e-10);
  assert.equal(arbor.source_authenticity_verified_by_server,false);
  assert.equal(arbor.active_ion_channels,false);
});

test('SWC rejects missing parent, cycle, duplicate root, zero-length branch and bogus units',()=>{
  err(()=>parseNeuronSWC(''));
  err(()=>parseNeuronSWC(swc.replace('0 80 0 1.5 2','0 80 0 1.5 44')));
  err(()=>parseNeuronSWC(swc.replace('0 40 0 2 1','0 40 0 2 3')));
  err(()=>parseNeuronSWC(swc.replace('4 4 20 0 0 1.2 1','4 1 20 0 0 1.2 -1')));
  err(()=>constructHumanPassiveArbor({
    swcText:swc.replace('0 40 0 2 1','0 0 0 2 1'),humanFeatures:ephys()}));
  err(()=>parseNeuronSWC(swc.replace('0 40 0 2 1','0 40 0 -1 1')));
});

test('passive cable propagates currents and recovers without spontaneous spikes',()=>{
  const m=model(),initial=new Array(m.count).fill(-65);
  const next=advancePassiveArbor(m,initial,{
    dt_ms:.1,injected_pA:{1:130}});
  assert.ok(next[0]>-65);
  assert.ok(next[2]>-65,'soma signal reaches distal branch through axial coupling');
  const stim=runPassiveArbor(m,{
    duration_ms:50,dt_ms:.1,soma_current_pA:130});
  const idle=runPassiveArbor(m,{duration_ms:50,dt_ms:.1});
  assert.ok(stim.trace.at(-1).soma_mV>idle.trace.at(-1).soma_mV+4);
  assert.equal(stim.no_action_potentials,true);
  assert.equal(stim.production_memory_unchanged,true);
  assert.equal(stim.no_llm,true);
});

test('implicit Euler passive tree converges under finer temporal discretization',()=>{
  const m=model();
  const a=runPassiveArbor(m,{duration_ms:40,dt_ms:.1,soma_current_pA:100});
  const b=runPassiveArbor(m,{duration_ms:40,dt_ms:.05,soma_current_pA:100});
  assert.ok(Math.abs(a.final_mV[0]-b.final_mV[0])<.12);
  assert.ok(Math.abs(a.final_mV[2]-b.final_mV[2])<.12);
});

test('GABA synaptic current inhibits and AMPA drives dendritic depolarization',()=>{
  const m=model(),initial=new Array(m.count).fill(-65);
  const excited=advancePassiveArbor(m,initial,{
    dt_ms:1,synapticConductance_nS:{2:[{g_nS:20,reversal_mV:0}]}});
  const inhibited=advancePassiveArbor(m,initial,{
    dt_ms:1,synapticConductance_nS:{2:[{g_nS:20,reversal_mV:-80}]}});
  assert.ok(excited[1]>-60);
  assert.ok(inhibited[1]<-65);
  assert.ok(excited[0]>inhibited[0]);
});

test('AMPA and NMDA have independent kinetics and NMDA Mg voltage block',()=>{
  assert.equal(RECEPTOR_KINETICS.AMPA.tauDecay_ms,2);
  assert.equal(RECEPTOR_KINETICS.NMDA.tauDecay_ms,35);
  const s={receptor:'NMDA',compartment_id:2,
    g_peak_nS:15,release_times_ms:[0]};
  assert.ok(magnesiumUnblock(-70)<magnesiumUnblock(20));
  const earlier=conductanceAt(s,5,-70);
  const late=conductanceAt(s,5,20);
  assert.ok(late.g_nS>earlier.g_nS*3);
  assert.equal(earlier.voltage_dependent,true);
  assert.equal(conductanceAt(s,-1,-65).g_nS,0);
  err(()=>conductanceAt({...s,magnesium_mM:500},1,-65));
  err(()=>conductanceAt({...s,receptor:'dopamine'},1,-65));
});

test('NMDA/AMPA excitation and GABA inhibition are measured through real cable output',()=>{
  const m=model();
  const ampa={receptor:'AMPA',compartment_id:3,
    g_peak_nS:35,release_times_ms:[5,15,25]};
  const gaba={receptor:'GABA_A',compartment_id:3,
    g_peak_nS:35,release_times_ms:[5,15,25]};
  const baseline=simulateSynapticArbor(m,[],{duration_ms:40,dt_ms:.1});
  const excited=simulateSynapticArbor(m,[ampa],{duration_ms:40,dt_ms:.1});
  const inhibited=simulateSynapticArbor(m,[gaba],{duration_ms:40,dt_ms:.1});
  const last=x=>x.trace.at(-1).soma_mV;
  assert.ok(last(excited)>last(baseline)+1);
  assert.ok(last(inhibited)<last(baseline)-.1);
  assert.equal(excited.ion_channel_spiking_implemented,false);
  assert.equal(excited.source_authenticated,false);
  assert.equal(excited.production_memory_mutated,false);
  const input=synapticInputsAt([ampa],10,m.node_ids,new Array(m.count).fill(-65));
  assert.ok(input[3][0].g_nS>0);
  err(()=>synapticInputsAt([{...ampa,compartment_id:500}],5,m.node_ids,
    new Array(m.count).fill(-65)));
});

test('all biophysical research computations are immutable to supplied morphology and state',()=>{
  const m=model();
  const before=JSON.stringify(m);
  const r=simulateSynapticArbor(m,[{receptor:'AMPA',compartment_id:2,
    g_peak_nS:5,release_times_ms:[1]}],{duration_ms:20,dt_ms:.1});
  assert.equal(before,JSON.stringify(m));
  assert.equal(r.llm_used,false);
  assert.equal(m.whole_cell.action_potential_fit,false);
});
