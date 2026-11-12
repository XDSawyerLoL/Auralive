import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLEN_FEATURE_SCHEMA,calibrateHumanPassiveCell,
  advanceHumanPassiveCell,simulateHumanPassiveCell,validateHumanPassiveCell,
} from '../src/human_ephys_calibration.js';

// PURELY SYNTHETIC fixtures: test arithmetic and provenance enforcement.
// They are not published or claimed as genuine donor measurements.
const record=()=>({
  schema_version:ALLEN_FEATURE_SCHEMA,
  species:'Homo sapiens',
  specimen_id:643625553,
  features:{vrest_mV:-65,input_resistance_MOhm:200,membrane_tau_ms:20},
  source:{
    dataset:'Allen Cell Types Database',
    method:'AllenSDK.CellTypesCache.get_ephys_features',
    human_specimen_verified:true,
    url:'https://celltypes.brain-map.org/data?donor__species=Homo+Sapiens',
    feature_units:{vrest:'mV',ri:'MOhm',tau:'ms'},
    extraction_software:'synthetic-test-fixture-only',
  },
});

test('human passive fit keeps explicit units and cannot claim active biological fidelity',()=>{
  const original=record();
  const model=calibrateHumanPassiveCell(original);
  assert.equal(model.species,'Homo sapiens');
  assert.equal(model.leak_conductance_nS,5);
  assert.equal(model.capacitance_pF,100);
  assert.equal(model.resting_mV,-65);
  assert.equal(model.membrane_tau_ms,20);
  assert.equal(model.ion_channel_fit,false);
  assert.equal(model.action_potential_fit,false);
  assert.equal(model.human_whole_brain_reproduced,false);
  assert.deepEqual(original,record(),'calibration never mutates input');
});

test('exact passive solver has analytical response independent of time step',()=>{
  const model=calibrateHumanPassiveCell(record());
  const one=advanceHumanPassiveCell({v_mV:-65},model,{current_pA:50,dt_ms:20});
  const expected=-55-10*Math.exp(-1);
  assert.ok(Math.abs(one.v_mV-expected)<1e-12);
  const coarse=simulateHumanPassiveCell(model,{current_pA:Array(80).fill(50),dt_ms:1});
  const fine=simulateHumanPassiveCell(model,{current_pA:Array(320).fill(50),dt_ms:.25});
  assert.ok(Math.abs(coarse.voltage_mV.at(-1)-fine.voltage_mV.at(-1))<1e-5);
  assert.ok(coarse.voltage_mV.at(-1)>-56);
  assert.equal(coarse.no_llm,true);
  assert.equal(coarse.no_production_write,true);
});

test('unknown or nonhuman biological data are always rejected',()=>{
  for(const wrong of [
    {species:'Mus musculus'}, {species:'human'},
    {features:{vrest_mV:NaN}}, {features:{membrane_tau_ms:null}},
    {source:{human_specimen_verified:false}},
    {source:{feature_units:{ri:'kOhm'}}},
    {specimen_id:'human01'}, {schema_version:'unknown'},
  ]){
    const r=record();
    for(const [key,val] of Object.entries(wrong)){
      if(['features','source'].includes(key))r[key]={...r[key],...val};
      else r[key]=val;
    }
    assert.throws(()=>calibrateHumanPassiveCell(r),undefined,
      'must reject unverified '+JSON.stringify(wrong));
  }
});

test('held-out sweep scoring reports errors but never certifies biological fidelity',()=>{
  const r=record(),model=calibrateHumanPassiveCell(r);
  const current=Array(100).fill(50);
  const trace=simulateHumanPassiveCell(model,{current_pA:current,dt_ms:1});
  const heldout={
    specimen_id:model.specimen_id,sweep_number:42,used_for_fit:false,
    source:{origin:'Allen Cell Types Database'},
    stimulus_current_pA:current,voltage_mV:[-65,...trace.voltage_mV.slice(1)],
    dt_ms:1,
  };
  const report=validateHumanPassiveCell(r,heldout);
  assert.equal(validateHumanPassiveCell(r,{...heldout,specimen_id:Number(model.specimen_id)}).validation.samples,100);
  assert.equal(report.validation.samples,100);
  assert.ok(report.validation.rmse_mV>=0);
  assert.ok(report.validation.rmse_mV<1);
  assert.equal(report.validation.externally_validated,false);
  assert.equal(report.validation.performance_classification,'unreviewed');
  assert.equal(report.validation.action_potential_fidelity,'not-applicable-passive-only');
  assert.throws(()=>validateHumanPassiveCell(r,{...heldout,used_for_fit:true}));
  assert.throws(()=>validateHumanPassiveCell(r,{...heldout,specimen_id:'123456789'}));
  assert.throws(()=>validateHumanPassiveCell(r,{
    ...heldout,voltage_mV:Array(99).fill(-65)}));
  assert.throws(()=>validateHumanPassiveCell(r,{
    ...heldout,source:{origin:'generated-by-LLM'}}));
});

test('passive model forbids unstable data and unbounded simulations',()=>{
  const model=calibrateHumanPassiveCell(record());
  assert.throws(()=>advanceHumanPassiveCell({v_mV:-65},model,
    {current_pA:Infinity,dt_ms:1}));
  assert.throws(()=>advanceHumanPassiveCell({v_mV:-65},model,
    {current_pA:1,dt_ms:-.01}));
  assert.throws(()=>simulateHumanPassiveCell(model,{
    current_pA:Array(50001).fill(1),dt_ms:1}));
});
