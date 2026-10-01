#!/usr/bin/env node
import { readFileSync } from 'node:fs';

function readJson(path){ return JSON.parse(readFileSync(path,'utf8')); }
function readJsonl(path){
  return readFileSync(path,'utf8').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map((line,i)=>{
    try{return JSON.parse(line);}catch(err){throw new Error(`${path}:${i+1}: invalid JSON: ${err.message}`);}
  });
}
function number(row,key){
  const value=row[key];
  if(value==null)return null;
  if(typeof value!=='number'||!Number.isFinite(value))throw new Error(`${row.slot_id||'?'}: ${key} must be numeric`);
  return value;
}
function loadManifest(path){
  const m=readJson(path);
  if(!Array.isArray(m.slots)||m.slots.length!==50)throw new Error('manifest must contain exactly 50 slots');
  const ids=m.slots.map(x=>x.slot_id);
  if(new Set(ids).size!==ids.length)throw new Error('slot IDs must be unique');
  return m;
}
function validateHoldout(manifest,rows){
  const expected=new Set(manifest.slots.map(x=>x.slot_id));
  const required=['slot_id','mission','initial_context','perturbations','success_criteria','evaluator'];
  const errors=[],seen=new Set();
  rows.forEach((row,i)=>{
    for(const key of required)if(!(key in row))errors.push(`row ${i+1}: missing ${key}`);
    if(!expected.has(row.slot_id))errors.push(`row ${i+1}: unknown slot_id ${row.slot_id}`);
    if(seen.has(row.slot_id))errors.push(`row ${i+1}: duplicate slot_id ${row.slot_id}`);
    seen.add(row.slot_id);
  });
  for(const id of expected)if(!seen.has(id))errors.push(`missing slot ${id}`);
  if(rows.length!==50)errors.push(`expected 50 rows, found ${rows.length}`);
  return {valid:errors.length===0,row_count:rows.length,errors};
}
function score(manifest,rows){
  const expected=new Set(manifest.slots.map(x=>x.slot_id)), byId=new Map();
  for(const row of rows){
    if(!expected.has(row.slot_id))throw new Error(`unknown slot_id ${row.slot_id}`);
    if(byId.has(row.slot_id))throw new Error(`duplicate slot_id ${row.slot_id}`);
    if(typeof row.success!=='boolean')throw new Error(`${row.slot_id}: success must be boolean`);
    const q=number(row,'verified_quality');
    if(q!=null&&(q<0||q>1))throw new Error(`${row.slot_id}: verified_quality must be 0..1`);
    byId.set(row.slot_id,row);
  }
  const values=[...byId.values()];
  const q=values.map(r=>number(r,'verified_quality')).filter(v=>v!=null);
  const latency=values.map(r=>number(r,'latency_s')).filter(v=>v!=null).sort((a,b)=>a-b);
  const energy=values.map(r=>number(r,'local_joules')).filter(v=>v!=null);
  const total=k=>values.reduce((s,r)=>s+(number(r,k)||0),0);
  const success=values.filter(r=>r.success).length;
  const median=latency.length?(latency.length%2?latency[(latency.length-1)/2]:(latency[latency.length/2-1]+latency[latency.length/2])/2):null;
  return {
    mission_count:values.length,
    complete:byId.size===expected.size,
    success_count:success,
    success_rate:values.length?success/values.length:null,
    verified_quality_mean:q.length?q.reduce((a,b)=>a+b,0)/q.length:null,
    human_interventions_total:total('human_interventions'),
    human_intervention_missions:values.filter(r=>(number(r,'human_interventions')||0)>0).length,
    median_latency_s:median,
    model_calls_total:total('model_calls'),
    tool_calls_total:total('tool_calls'),
    tokens_in_total:total('tokens_in'),
    tokens_out_total:total('tokens_out'),
    local_joules_total:energy.length?energy.reduce((a,b)=>a+b,0):null,
    local_joules_coverage:values.length?energy.length/values.length:0,
    remote_provider_energy:'unknown',
    slot_ids:[...byId.keys()].sort()
  };
}
const [,,command,a,b]=process.argv;
const manifestPath=new URL('./aura-eval-manifest.json',import.meta.url);
const manifest=loadManifest(manifestPath);
if(command==='validate-holdout'){
  const out=validateHoldout(manifest,readJsonl(a)); console.log(JSON.stringify(out,null,2)); if(!out.valid)process.exitCode=1;
}else if(command==='score'){
  console.log(JSON.stringify(score(manifest,readJsonl(a)),null,2));
}else if(command==='compare'){
  const base=score(manifest,readJsonl(a)), candidate=score(manifest,readJsonl(b));
  if(JSON.stringify(base.slot_ids)!==JSON.stringify(candidate.slot_ids))throw new Error('baseline and candidate must contain the same slot IDs');
  let reduction=null;
  if(base.local_joules_coverage===1&&candidate.local_joules_coverage===1&&base.local_joules_total>0){
    reduction=(1-candidate.local_joules_total/base.local_joules_total)*100;
  }
  console.log(JSON.stringify({
    baseline:base,candidate,
    delta:{
      success_rate:(candidate.success_rate??0)-(base.success_rate??0),
      verified_quality_mean:(candidate.verified_quality_mean!=null&&base.verified_quality_mean!=null)?candidate.verified_quality_mean-base.verified_quality_mean:null,
      human_interventions_total:candidate.human_interventions_total-base.human_interventions_total,
      median_latency_s:(candidate.median_latency_s!=null&&base.median_latency_s!=null)?candidate.median_latency_s-base.median_latency_s:null,
      local_energy_reduction_pct:reduction
    },
    energy_claim_allowed:reduction!=null,
    agi_claim:'not_determined_by_this_aggregate_alone'
  },null,2));
}else{
  console.error('Usage: node evaluation/aura-eval.mjs validate-holdout HOLDOUT.jsonl | score RESULTS.jsonl | compare BASE.jsonl CANDIDATE.jsonl');
  process.exitCode=2;
}
