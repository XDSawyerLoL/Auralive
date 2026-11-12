// AURA biological research — dimensional, passive, multi-compartment neuron.
// SWC segments have measured geometry; cable currents are solved with
// implicit Euler on an arbor tree (direct leaf-elimination, no unstable
// explicit coupling). Requires caller-supplied reconstruction and human
// passive whole-cell measurements; NOT an independently authenticated human
// donor, active-channel fit or a biologically validated human circuit.
import { calibrateHumanPassiveCell } from './human_ephys_calibration.js';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const safe=(v,name,min,max)=>{
  if(!finite(v)||v<min||v>max)throw new RangeError(name+' outside research bounds');
  return v;
};
const accepted=new Set([1,2,3,4]);
const TWO_PI=2*Math.PI;
const MAX_COMPARTMENTS=6000;
export function parseNeuronSWC(raw,{expectedSpecimenId=null}={}){
  if(typeof raw!=='string'||raw.length>950000)
    throw new TypeError('bounded SWC text required');
  const lines=raw.split(/\r?\n/),nodes=[],byId=new Map();
  for(const line of lines){
    const s=line.trim();
    if(!s||s.startsWith('#'))continue;
    const parts=s.split(/\s+/);
    if(parts.length!==7)throw new TypeError('SWC line must have seven columns');
    const nums=parts.map(Number);
    if(nums.some(n=>!finite(n)))throw new TypeError('SWC non-finite coordinate');
    const [id,type,x,y,z,radius,parent]=nums;
    if(!Number.isSafeInteger(id)||id<=0||byId.has(id)||
      !Number.isSafeInteger(parent)||!accepted.has(type))
      throw new TypeError('SWC invalid or duplicate compartment');
    for(const [n,k] of [[x,'x'],[y,'y'],[z,'z']])
      safe(n,k,-1e6,1e6);
    safe(radius,'SWC radius in micrometres',.001,500);
    const node={id,type,x,y,z,radius_um:radius,parent_id:parent};
    nodes.push(node);byId.set(id,node);
    if(nodes.length>MAX_COMPARTMENTS)
      throw new RangeError('SWC exceeds computational ceiling');
  }
  if(nodes.length<2)throw new TypeError('SWC needs soma and at least one process');
  const roots=nodes.filter(n=>n.parent_id===-1);
  if(roots.length!==1||roots[0].type!==1)
    throw new TypeError('a single soma root is required');
  const root=roots[0];
  const children=new Map(nodes.map(n=>[n.id,[]]));
  for(const n of nodes){
    if(n.id===root.id)continue;
    if(n.parent_id===n.id||!byId.has(n.parent_id))
      throw new TypeError('SWC contains missing parent or cycle');
    children.get(n.parent_id).push(n.id);
  }
  // Reachability rejects disconnected cycles, even if a soma root exists.
  const reached=new Set(),ordered=[];
  function visit(id){
    if(reached.has(id))throw new TypeError('SWC directed cycle');
    reached.add(id);ordered.push(id);
    for(const child of children.get(id))visit(child);
  }
  visit(root.id);
  if(reached.size!==nodes.length)throw new TypeError('SWC contains disconnected branches or cycles');
  const arranged=ordered.map(id=>byId.get(id));
  if(expectedSpecimenId!==null&&(!Number.isSafeInteger(expectedSpecimenId)||expectedSpecimenId<1))
    throw new TypeError('expected specimen identifier invalid');
  return {format:'SWC',units:'micrometres',root_id:root.id,
    compartment_count:arranged.length,
    nodes:arranged,source_authenticity_verified_by_server:false,
    expected_specimen_id:expectedSpecimenId};
}
function geometry(swc,{axialResistivity_ohm_cm=150}={}){
  safe(axialResistivity_ohm_cm,'axial resistivity',10,1000);
  const ids=new Map(swc.nodes.map((n,i)=>[n.id,i]));
  const n=swc.nodes.length,parent=new Int32Array(n).fill(-1);
  const area_um2=new Float64Array(n),gAxial_nS=new Float64Array(n);
  for(let i=0;i<n;i++){
    const node=swc.nodes[i],r=node.radius_um;
    if(i===0){
      // Surface of spherical soma; SWC processes approximated as cylinders.
      area_um2[i]=4*Math.PI*r*r;continue;
    }
    const j=ids.get(node.parent_id);
    if(j===undefined||j>=i)throw new TypeError('SWC must be in rooted parent-first order');
    parent[i]=j;
    const anc=swc.nodes[j];
    const length_um=Math.hypot(node.x-anc.x,node.y-anc.y,node.z-anc.z);
    if(length_um<.01)throw new RangeError('zero or near-zero SWC cable segment');
    const effectiveRadius_um=Math.min(node.radius_um,anc.radius_um);
    // Ra [ohm cm], r/L [cm] -> conductance [1/ohm] -> nS.
    const rcm=effectiveRadius_um*1e-4,lcm=length_um*1e-4;
    gAxial_nS[i]=1e9*Math.PI*rcm*rcm/(axialResistivity_ohm_cm*lcm);
    area_um2[i]=TWO_PI*(node.radius_um+anc.radius_um)*.5*length_um;
  }
  const area=area_um2.reduce((a,b)=>a+b,0);
  return {parent,area_um2,gAxial_nS,totalArea_um2:area,
    axialResistivity_ohm_cm};
}
export function constructHumanPassiveArbor({swcText,humanFeatures,axialResistivity_ohm_cm=150}={}){
  if(humanFeatures?.specimen_id===undefined)
    throw new TypeError('matched human ephys specimen required');
  const measured=calibrateHumanPassiveCell(humanFeatures);
  const swc=parseNeuronSWC(swcText,{expectedSpecimenId:Number(measured.specimen_id)});
  const shape=geometry(swc,{axialResistivity_ohm_cm});
  const area=Array.from(shape.area_um2);
  const capacitance_pF=area.map(a=>measured.capacitance_pF*a/shape.totalArea_um2);
  const leak_nS=area.map(a=>measured.leak_conductance_nS*a/shape.totalArea_um2);
  return {
    kind:'human-feature-fitted-passive-SWC-arbor-v1',
    specimen_id:measured.specimen_id,
    species:'Homo sapiens (caller-asserted)',
    count:swc.compartment_count,
    node_ids:swc.nodes.map(n=>n.id),
    node_types:swc.nodes.map(n=>n.type),
    parent:Array.from(shape.parent),
    capacitance_pF,leak_nS,gAxial_nS:Array.from(shape.gAxial_nS),
    vrest_mV:measured.resting_mV,
    axialResistivity_ohm_cm,whole_cell:measured,
    total_surface_um2:shape.totalArea_um2,
    _physical_model:'passive-linear-cable',
    source_authenticity_verified_by_server:false,
    validated_on_heldout_morpho_ephys:false,
    active_ion_channels:false,
  };
}
export function advancePassiveArbor(model,voltage_mV,{
  dt_ms=.1,injected_pA={},synapticConductance_nS={},
}={}){
  if(model?.kind!=='human-feature-fitted-passive-SWC-arbor-v1')
    throw new TypeError('human passive arbor required');
  safe(dt_ms,'membrane timestep',.0001,20);
  const n=model.count;
  if(!Array.isArray(voltage_mV)||voltage_mV.length!==n)
    throw new TypeError('one finite voltage per compartment required');
  const a=new Float64Array(n),b=new Float64Array(n);
  const edge=model.gAxial_nS,parent=model.parent;
  for(let i=0;i<n;i++){
    safe(voltage_mV[i],'membrane voltage',-150,150);
    const id=model.node_ids[i],gLeak=model.leak_nS[i],
      capacitance=model.capacitance_pF[i];
    let synG=0,synGE=0;
    const syn=synapticConductance_nS[id]||[];
    if(!Array.isArray(syn)||syn.length>64)
      throw new RangeError('invalid synaptic conductance input');
    for(const current of syn){
      const conductance=safe(current.g_nS,'synapse conductance',0,5000);
      const reversal=safe(current.reversal_mV,'synapse reversal',-120,70);
      synG+=conductance;synGE+=conductance*reversal;
    }
    const injected=safe(Object.hasOwn(injected_pA,id)?injected_pA[id]:0,
      'injected current',-100000,100000);
    a[i]=capacitance/dt_ms+gLeak+synG+
      (parent[i]===-1?0:edge[i]);
    b[i]=capacitance*voltage_mV[i]/dt_ms+
      gLeak*model.vrest_mV+synGE+injected;
    if(i>0)a[parent[i]]+=edge[i];
  }
  // Tree elimination, leaves -> root. All coefficients are positive for
  // a passive membrane and nonnegative channel conductances.
  for(let i=n-1;i>0;i--){
    const j=parent[i],g=edge[i];
    if(!(a[i]>0))throw new Error('nonpositive passive cable diagonal');
    a[j]-=g*g/a[i];
    b[j]+=g*b[i]/a[i];
  }
  if(!(a[0]>0))throw new Error('nonpositive reduced soma diagonal');
  const out=new Array(n);
  out[0]=b[0]/a[0];
  for(let i=1;i<n;i++){
    out[i]=(b[i]+edge[i]*out[parent[i]])/a[i];
    if(!Number.isFinite(out[i]))throw new Error('invalid cable voltage');
  }
  return out;
}
export function runPassiveArbor(model,{
  duration_ms=40,dt_ms=.1,soma_current_pA=0,
  synapticConductance_nS={},initial_mV=model?.vrest_mV,
}={}){
  safe(duration_ms,'duration',.001,500);
  safe(dt_ms,'membrane time step',.0001,20);
  safe(soma_current_pA,'soma injection',-100000,100000);
  if(Math.ceil(duration_ms/dt_ms)>50000)
    throw new RangeError('excessive simulation steps');
  safe(initial_mV,'initial voltage',-150,150);
  let voltage=new Array(model.count).fill(initial_mV);
  const trace=[],nSteps=Math.ceil(duration_ms/dt_ms);
  for(let i=0;i<nSteps;i++){
    voltage=advancePassiveArbor(model,voltage,{
      dt_ms,injected_pA:{[model.node_ids[0]]:soma_current_pA},
      synapticConductance_nS});
    trace.push({t_ms:Number(((i+1)*dt_ms).toFixed(4)),
      soma_mV:Number(voltage[0].toFixed(6)),
      end_mV:Number(voltage[model.count-1].toFixed(6))});
  }
  return {model:'passive-SWC-cable',trace,final_mV:voltage,
    no_action_potentials:true,source_authenticated:false,
    no_llm:true,production_memory_unchanged:true};
}
