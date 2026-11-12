import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HH_BASELINE,ionicGates,restingGates,hhCell,advanceHH,
  runMicrocircuit,ablateMicroProjection,defaultBody,advanceBody,
} from '../src/biophysical_microcircuit.js';

test('ionic rates have continuous removable singularities and calibrated HH dimensions',()=>{
  const rest=restingGates(-65);
  assert.ok(rest.m>.04&&rest.m<.07);
  assert.ok(rest.h>.5&&rest.h<.7);
  assert.ok(rest.n>.3&&rest.n<.35);
  assert.ok(Number.isFinite(ionicGates(-40).am));
  assert.ok(Number.isFinite(ionicGates(-55).an));
  assert.equal(HH_BASELINE.gNa_mS_cm2,120);
  assert.equal(HH_BASELINE.gK_mS_cm2,36);
  assert.match(HH_BASELINE.provenance,/not human calibrated/);
});

test('sufficient physical injected current creates actual action potentials',()=>{
  let cell=hhCell(),maxV=-100;
  for(let t=0;t<100;t+=.025){
    cell=advanceHH(cell,{
      dtMs:.025,externalCurrent_uA_cm2:t>=10&&t<85?12:0,
    }).cell;
    maxV=Math.max(maxV,cell.v);
  }
  assert.ok(maxV>0,'voltage crosses 0 mV during an action potential');
  assert.ok(cell.spikes>=2,'evoked spiking must be repeatable');
  for(const k of ['v','m','h','n'])assert.ok(Number.isFinite(cell[k]));
  for(const k of ['m','h','n'])assert.ok(cell[k]>=0&&cell[k]<=1);
});

test('synaptic inhibitory conductance changes membrane response causally',()=>{
  let active=hhCell(),inhibited=hhCell();
  for(let t=0;t<70;t+=.025){
    const c=t>=10&&t<60?11:0;
    active=advanceHH(active,{dtMs:.025,externalCurrent_uA_cm2:c}).cell;
    inhibited=advanceHH(inhibited,{dtMs:.025,
      externalCurrent_uA_cm2:c,gaba_mS_cm2:2}).cell;
  }
  assert.ok(active.spikes>0);
  assert.ok(inhibited.spikes<active.spikes,'GABA_A inhibition reduces spiking');
});

test('connected HH neurons conduct causal synaptic signals with an actual voltage trace',()=>{
  const baseline=runMicrocircuit({durationMs:130,dtMs:.025,
    sensoryCurrent_uA_cm2:16});
  const control=runMicrocircuit({durationMs:130,dtMs:.025,
    sensoryCurrent_uA_cm2:16,removeProjections:['thalamus>amygdala']});
  assert.ok(baseline.spikes.thalamus>=1);
  assert.equal(baseline.model_origin,'HH1952-squid-axon-not-human-calibrated');
  assert.ok(baseline.trace.length>=120);
  assert.ok(baseline.trace.some(x=>x.membrane_mV.thalamus>0));
  assert.notDeepEqual(baseline.trace.map(x=>x.membrane_mV.amygdala),
    control.trace.map(x=>x.membrane_mV.amygdala));
  assert.equal(baseline.no_llm,true);
  assert.equal(baseline.governs_production_choices,false);
  assert.equal(baseline.biological_fidelity,'unvalidated-human');
});

test('HPA endocrine chain and autonomic heart response have distinct time scales',()=>{
  let stimulated=defaultBody(),resting=defaultBody();
  for(let i=0;i<300;i++){
    stimulated=advanceBody(stimulated,{
      seconds:1,hypothalamicDrive:.8,externalStressor:.4});
    resting=advanceBody(resting,{seconds:1});
  }
  assert.ok(stimulated.heartRate_bpm>resting.heartRate_bpm+10);
  assert.ok(stimulated.crh>resting.crh);
  assert.ok(stimulated.acth>resting.acth);
  assert.ok(stimulated.glucocorticoid>resting.glucocorticoid);
  assert.ok(stimulated.heartRate_bpm>=40&&stimulated.heartRate_bpm<=180);
  const recovered=advanceBody(stimulated,{seconds:10,hypothalamicDrive:0});
  assert.ok(recovered.sympathetic<stimulated.sympathetic);
});

test('ablation is reproducible and never alters source state or real cognition',()=>{
  const body=defaultBody();
  const opts={durationMs:120,dtMs:.025,body,
    sensoryCurrent_uA_cm2:16};
  const one=ablateMicroProjection(opts,'thalamus>amygdala');
  const two=ablateMicroProjection(opts,'thalamus>amygdala');
  assert.deepEqual(one,two);
  assert.deepEqual(body,defaultBody());
  assert.equal(one.same_initial_conditions,true);
  assert.equal(one.production_state_changed,false);
  assert.equal(one.biological_validity,'not-human-calibrated');
  assert.throws(()=>runMicrocircuit({removeProjections:['unknown-region>x']}),RangeError);
  assert.throws(()=>advanceHH(hhCell(),{dtMs:1}),RangeError);
});
