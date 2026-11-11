// Reversible operational vulnerability. Never destroys identity, user data, or
// reduces safety checks; no emotional or biological inference.
const clamp=x=>Math.max(0,Math.min(1,Number.isFinite(Number(x))?Number(x):0));
const finite=v=>{const d=Date.parse(String(v||''));return Number.isFinite(d)?d:null;};
export function initialViability(){
 return {version:'aura-functional-viability-v1',reserve:1,
   capacity:3,optional_work_allowed:true,mode:'normal',at:null,
   source:'not-measured',irreversible_destruction_allowed:false};
}
export function evolveViability(previous={},organism={},nowMs=Date.now()){
 const before={...initialViability(),...(previous||{})};
 const sensor=organism.homeostasis?.sensor;
 const stamp=finite(sensor?.sampled_at);
 const verified=stamp!==null&&stamp<=nowMs&&nowMs-stamp<=120000&&
   sensor?.source==='node-process';
 const pressure=verified?clamp(sensor.compute_pressure):0;
 const failure=clamp(organism.homeostasis?.failure_ema);
 const last=finite(before.at),elapsed=last!==null
   ?Math.max(0,Math.min(3600,(nowMs-last)/1000)):30;
 // Bounded resource strain degrades computation gradually; quiet cycles restore.
 const stress=Math.max(pressure,failure*.8);
 const delta=stress>.6
   ?-Math.max(.012,elapsed/3600*.32)*(stress-.35)
   :Math.max(.002,elapsed/3600*.14)*(1-stress);
 const reserve=clamp(clamp(before.reserve)+delta);
 const capacity=reserve<.30?1:reserve<.62?2:3;
 const mode=reserve<.18?'protected-rest':capacity===1?'critical':
   capacity===2?'restricted':'normal';
 return {version:'aura-functional-viability-v1',
   at:new Date(nowMs).toISOString(),
   reserve:Number(reserve.toFixed(4)),capacity,mode,
   optional_work_allowed:reserve>=.35&&pressure<.75,
   source:verified?'node-process':'no-fresh-process-reading',
   stress:Number(stress.toFixed(4)),recovery_possible:true,
   irreversible_destruction_allowed:false};
}
export function viabilityAblation(state,organism,nowMs){
 const withRegulation=evolveViability(state,organism,nowMs);
 const withoutRegulation=evolveViability(state,{homeostasis:{}},nowMs);
 return {withRegulation,withoutRegulation,
   causal:withRegulation.reserve!==withoutRegulation.reserve||
     withRegulation.capacity!==withoutRegulation.capacity};
}
