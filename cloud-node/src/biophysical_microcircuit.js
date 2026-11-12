// AURA biological research: conductance-based, dimensional microcircuit.
// Hodgkin-Huxley 1952 ionic equations (original squid axon parameters),
// NOT a validated human neuron nor a brain-region reconstruction.
// Region names below are connectivity hypotheses, not anatomical evidence.
// Research-only: no automatic control of production policy, memory, or UI.
const numeric = (x,lo,hi,def)=>Number.isFinite(x)?Math.max(lo,Math.min(hi,x)):def;
const clip01=x=>numeric(Number(x),0,1,0);
const round=(v,n=6)=>Number(v.toFixed(n));
export const HH_BASELINE=Object.freeze({
  C_uF_cm2:1, gNa_mS_cm2:120, gK_mS_cm2:36, gL_mS_cm2:.3,
  ENa_mV:50, EK_mV:-77, EL_mV:-54.387,
  provenance:'Hodgkin-Huxley 1952 squid giant axon, not human calibrated',
  doi:'10.1113/jphysiol.1952.sp004764',
});
function exprel(x,k){return Math.abs(x)<1e-7?k:x/(-Math.expm1(-x/k));}
export function ionicGates(v){
  const am=.1*exprel(v+40,10),bm=4*Math.exp(-(v+65)/18);
  const ah=.07*Math.exp(-(v+65)/20),bh=1/(1+Math.exp(-(v+35)/10));
  const an=.01*exprel(v+55,10),bn=.125*Math.exp(-(v+65)/80);
  return {am,bm,ah,bh,an,bn};
}
export function restingGates(v=-65){
  const r=ionicGates(v);
  return {m:r.am/(r.am+r.bm),h:r.ah/(r.ah+r.bh),
    n:r.an/(r.an+r.bn)};
}
export function hhCell(v=-65){
  return {v,m:restingGates(v).m,h:restingGates(v).h,
    n:restingGates(v).n,spikes:0,wasAbove:false};
}
export function advanceHH(cell,{
  dtMs=.025,externalCurrent_uA_cm2=0,
  ampa_mS_cm2=0,gaba_mS_cm2=0,temperature_C=6.3,
}={}){
  if(!(dtMs>0&&dtMs<=.05))throw new RangeError('HH dtMs must be (0, 0.05] ms');
  if(temperature_C!==6.3)throw new RangeError('Temperature not calibrated: HH baseline 6.3C only');
  for(const x of [externalCurrent_uA_cm2,ampa_mS_cm2,gaba_mS_cm2])
    if(!Number.isFinite(x))throw new TypeError('non-finite current/conductance');
  if(ampa_mS_cm2<0||gaba_mS_cm2<0)throw new RangeError('negative conductance');
  const r=ionicGates(cell.v);
  // Exact first-order relaxation of channel states for fixed voltage.
  const relax=(old,a,b)=>clip01(a/(a+b)+(old-a/(a+b))*Math.exp(-(a+b)*dtMs));
  const m=relax(cell.m,r.am,r.bm),h=relax(cell.h,r.ah,r.bh);
  const n=relax(cell.n,r.an,r.bn);
  const p=HH_BASELINE;
  const INa=p.gNa_mS_cm2*m*m*m*h*(cell.v-p.ENa_mV);
  const IK=p.gK_mS_cm2*n**4*(cell.v-p.EK_mV);
  const IL=p.gL_mS_cm2*(cell.v-p.EL_mV);
  const IE=ampa_mS_cm2*(cell.v-0);
  const II=gaba_mS_cm2*(cell.v-(-80));
  const dV=dtMs*(externalCurrent_uA_cm2-INa-IK-IL-IE-II)/p.C_uF_cm2;
  const v=cell.v+dV;
  if(!Number.isFinite(v)||Math.abs(v)>250)throw new Error('HH solver unstable');
  const above=v>=-20;
  const spiked=!cell.wasAbove&&above;
  return {cell:{v,m,h,n,wasAbove:above,spikes:cell.spikes+(spiked?1:0)},
    spiked,ionicCurrent_uA_cm2:round(INa+IK+IL)};
}
const REGIONS=Object.freeze([
  'thalamus','amygdala','hippocampus','prefrontal',
  'prefrontal_interneuron','hypothalamus','insula','brainstem',
]);
const PROJECTIONS=Object.freeze([
  ['thalamus','amygdala','AMPA',.42],
  ['thalamus','hippocampus','AMPA',.35],
  ['hippocampus','prefrontal','AMPA',.42],
  ['prefrontal','prefrontal_interneuron','AMPA',.42],
  ['prefrontal_interneuron','amygdala','GABA_A',.48],
  ['amygdala','hypothalamus','AMPA',.5],
  ['hypothalamus','brainstem','AMPA',.45],
  ['brainstem','insula','AMPA',.36],
  ['insula','prefrontal','AMPA',.35],
]);
export const MICRO_REGIONS=REGIONS;
export const MICRO_PROJECTIONS=PROJECTIONS;
// These first-order endocrine variables represent *relative concentrations*,
// not measured hormone concentrations nor a calibrated human HPA axis.
export function defaultBody(){
  return {crh:0,acth:0,glucocorticoid:0,sympathetic:0,
    parasympathetic:.3,heartRate_bpm:70,elapsed_s:0};
}
export function advanceBody(input,{seconds=1,hypothalamicDrive=0,
  vagalDrive=0,externalStressor=0}={}){
  if(!(seconds>0&&seconds<=10))throw new RangeError('body timestep must be (0, 10] s');
  let s={...input};
  let remaining=seconds;
  while(remaining>1e-10){
    const dt=Math.min(remaining,.25);
    const drive=clip01(hypothalamicDrive),vagal=clip01(vagalDrive);
    const stress=clip01(externalStressor);
    const symTarget=clip01(.75*drive+.25*stress);
    const parasymTarget=clip01(.3+.4*vagal-.20*symTarget);
    s.sympathetic=clip01(s.sympathetic+dt*(symTarget-s.sympathetic)/3);
    s.parasympathetic=clip01(s.parasympathetic+dt*(parasymTarget-s.parasympathetic)/5);
    // CRH -> ACTH -> glucocorticoid with delayed negative feedback.
    const crhTarget=clip01(.85*drive+.15*stress)/
      (1+1.3*s.glucocorticoid);
    s.crh=clip01(s.crh+dt*(crhTarget-s.crh)/25);
    s.acth=clip01(s.acth+dt*(s.crh-s.acth)/90);
    s.glucocorticoid=clip01(s.glucocorticoid+
      dt*(s.acth-s.glucocorticoid)/240);
    const heartTarget=70+38*s.sympathetic-24*(s.parasympathetic-.3);
    s.heartRate_bpm=numeric(s.heartRate_bpm+
      dt*(heartTarget-s.heartRate_bpm)/4,40,180,70);
    s.elapsed_s+=dt;
    remaining-=dt;
  }
  return Object.fromEntries(Object.entries(s).map(([key,v])=>[key,round(v)]));
}
export function runMicrocircuit({
  durationMs=120,dtMs=.025,sensoryCurrent_uA_cm2=14,
  sensoryOnMs=10,sensoryOffMs=80,removeProjections=[],
  body=defaultBody(),biophysicalInteroceptiveFeedback=true,
}={}){
  if(!(durationMs>0&&durationMs<=1000))throw new RangeError('duration must be (0,1000] ms');
  if(!(dtMs>0&&dtMs<=.05))throw new RangeError('invalid timestep');
  if(!Number.isFinite(sensoryCurrent_uA_cm2)||
    Math.abs(sensoryCurrent_uA_cm2)>80)throw new RangeError('unphysical research drive');
  const removed=new Set(removeProjections);
  if([...removed].some(v=>!PROJECTIONS.some(p=>p[0]+'>'+p[1]===v)))
    throw new RangeError('unknown projection');
  const cells=Object.fromEntries(REGIONS.map(id=>[id,hhCell()]));
  const receptors=Object.fromEntries(REGIONS.map(id=>[id,{ampa:0,gaba:0}]));
  let simulated=0;const sampleEvery=1;let nextSample=0;
  const trace=[];
  const dtCount=Math.ceil(durationMs/dtMs);
  for(let i=0;i<dtCount;i++){
    const t=i*dtMs;
    // Presynaptic spikes trigger postsynaptic conductance after the
    // completed synchronous update; no backwards causality.
    for(const id of REGIONS){
      receptors[id].ampa*=Math.exp(-dtMs/4);
      receptors[id].gaba*=Math.exp(-dtMs/8);
    }
    const spikes=[];
    for(const id of REGIONS){
      let inject=0;
      if(id==='thalamus'&&t>=sensoryOnMs&&t<sensoryOffMs)
        inject+=sensoryCurrent_uA_cm2;
      if(id==='insula'&&biophysicalInteroceptiveFeedback)
        inject+=numeric((body.heartRate_bpm-70)*.09,0,8,0);
      const syn=receptors[id];
      const result=advanceHH(cells[id],{dtMs,
        externalCurrent_uA_cm2:inject,
        ampa_mS_cm2:syn.ampa,gaba_mS_cm2:syn.gaba});
      cells[id]=result.cell;
      if(result.spiked)spikes.push(id);
    }
    for(const src of spikes){
      for(const [pre,post,receptor,weight] of PROJECTIONS){
        if(src!==pre||removed.has(pre+'>'+post))continue;
        receptors[post][receptor==='AMPA'?'ampa':'gaba']+=weight;
      }
    }
    if(t>=nextSample){
      trace.push({at_ms:round(t,2),
        membrane_mV:Object.fromEntries(REGIONS.map(k=>[k,round(cells[k].v,3)])),
        cumulative_spikes:Object.fromEntries(REGIONS.map(k=>[k,cells[k].spikes]))});
      nextSample+=sampleEvery;
    }
    simulated+=dtMs;
  }
  const spikes=Object.fromEntries(REGIONS.map(k=>[k,cells[k].spikes]));
  // Body coupling runs in physiological seconds, separately from membrane
  // integration in milliseconds; don't advance minutes of hormones per tick.
  const hypothalamicDrive=clip01(spikes.hypothalamus/Math.max(1,durationMs/12));
  const vagalDrive=clip01(spikes.brainstem/Math.max(1,durationMs/12));
  const nextBody=advanceBody(body,{seconds:durationMs/1000,
    hypothalamicDrive,vagalDrive});
  return {
    version:'biophysical-microcircuit-research-v1',
    model_origin:'HH1952-squid-axon-not-human-calibrated',
    region_mapping:'illustrative-pathway-map-not-human-connectome',
    cell_count:REGIONS.length,projection_count:PROJECTIONS.length-removed.size,
    simulated_ms:round(simulated,3),step_ms:dtMs,spikes,
    body:nextBody,trace,
    conductance_units:'mS/cm2',current_units:'uA/cm2',
    decision_scope:'research-evidence-only',
    governs_production_choices:false,
    biological_fidelity:'unvalidated-human',
    no_llm:true,external_actions_executed:false,
    original_brain_emulated:false,subjective_consciousness_proven:false,
  };
}
export function ablateMicroProjection(options={},projection='thalamus>amygdala'){
  const baseline=runMicrocircuit(options);
  const removed=runMicrocircuit({...options,
    removeProjections:[...(options.removeProjections||[]),projection]});
  return {projection,baseline:{spikes:baseline.spikes,body:baseline.body},
    counterfactual:{spikes:removed.spikes,body:removed.body},
    effects:Object.fromEntries(REGIONS.map(k=>[k,
      removed.spikes[k]-baseline.spikes[k]])),
    same_initial_conditions:true,
    biological_validity:'not-human-calibrated',
    experiment_kind:'in-silico-illustrative',production_state_changed:false};
}
