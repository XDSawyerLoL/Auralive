import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {competeInWorkspace,workspaceInput} from '../src/global_workspace.js';
import {workspaceHas,languageWorkspaceProjection,semanticWorkspaceContext,executionWorkspaceGate}
  from '../src/workspace_boundary.js';
import {initialPredictionState,predictModule,observePrediction,currentPredictionSignal}
  from '../src/prediction_error_bus.js';
import {initialViability,evolveViability,viabilityAblation} from '../src/viability_budget.js';
import {consolidationDue,consolidateRows,verifyConsolidation,OfflineConsolidation}
  from '../src/offline_consolidation.js';

const time=Date.parse('2026-11-11T13:00:00Z');
const at=new Date(time).toISOString();
const w=options=>competeInWorkspace(workspaceInput({
  userPresent:true,plan:{act:'respond'},nowMs:time,...options,
}),{nowMs:time,capacity:3});

test('language cannot receive unfocused autobiographical context',()=>{
 const workspace=w();
 assert.equal(workspaceHas(workspace,'hippocampus','memory'),false);
 const plan={
  act:'user_recognition',user_text:'Qui suis-je ?',goal:'Identifier la personne',
  facts:['Un fait dans la mémoire privée'],founder_profile:[{detail:'nom privé'}],
  conversation_context:[{role:'user',content:'un souvenir privé'}],
  experiential_memory:[{note:'identité non sélectionnée'}],
  history_guidance:{eligible:true},relationship:{familiarity:.9},
 };
 const projected=languageWorkspaceProjection(plan,workspace,{privateView:true});
 assert.equal(projected.allowed,true);
 assert.equal(projected.memory_included,false);
 assert.equal(projected.plan.experiential_memory.length,0);
 assert.equal(projected.plan.conversation_context.length,0);
 assert.equal(projected.plan.founder_profile.length,0);
 assert.equal(projected.plan.history_guidance,null);
 assert.doesNotMatch(JSON.stringify(projected.plan),/nom privé|souvenir privé|Un fait dans la mémoire privée/);
 assert.equal(semanticWorkspaceContext('contexte privé',workspace),'');
 const rejected=languageWorkspaceProjection(plan,
   competeInWorkspace(workspaceInput({userPresent:true,nowMs:time}),{
     nowMs:time,broadcast:false,
   }),{privateView:true});
 assert.equal(rejected.allowed,false);
 assert.equal(rejected.plan,null);
});
test('verified memory enters language only if broadcast won',()=>{
 const workspace=w({history:{changed:true,eligible:true,action:'clarify'}});
 const p=languageWorkspaceProjection({act:'respond',
  experiential_memory:[{note:'memory'}],
  conversation_context:[{role:'user',content:'remembered'}],
  history_guidance:{eligible:true}},workspace,{privateView:true});
 assert.equal(p.memory_included,true);
 assert.equal(p.plan.experiential_memory.length,1);
 assert.ok(semanticWorkspaceContext('authorized context',workspace).includes('authorized'));
});
test('operator entry depends on delivered executive plan, not an LLM claim',()=>{
 const possible=competeInWorkspace(workspaceInput({
  nowMs:time,userPresent:false,plan:{act:'task_first'},
 }),{nowMs:time});
 assert.equal(executionWorkspaceGate(possible).allowed,true);
 assert.equal(executionWorkspaceGate(possible).authorization_granted,false);
 const cut=competeInWorkspace(workspaceInput({
  nowMs:time,userPresent:false,plan:{act:'task_first'},
 }),{nowMs:time,broadcast:false});
 assert.equal(executionWorkspaceGate(cut).allowed,false);
});
test('prospective prediction error changes attention only with machine observation',()=>{
 const original=initialPredictionState();
 const prediction=predictModule(original,{module:'language',operationId:'req-1',at});
 assert.equal(prediction.observations_before_prediction,0);
 assert.equal(prediction.probability,.5);
 const evaluated=observePrediction(original,prediction,{
  success:false,source:'machine-observed',at,
 });
 assert.equal(evaluated.accepted,true);
 assert.equal(evaluated.state.modules.language.brier_mean,.25);
 assert.equal(evaluated.state.modules.language.ece,.5);
 assert.equal(evaluated.state.modules.language.n,1);
 assert.equal(observePrediction(evaluated.state,prediction,{
  success:false,source:'machine-observed',at,
 }).reason,'duplicate-outcome');
 const signal=currentPredictionSignal(evaluated.state,time);
 assert.equal(signal.error,.5);
 const candidates=workspaceInput({userPresent:false,nowMs:time,
  prediction:signal});
 assert.ok(candidates.some(x=>x.label==='cross-module-surprise'));
 const noError=workspaceInput({userPresent:false,nowMs:time});
 assert.ok(candidates.length>noError.length);
 const ablated=workspaceInput({userPresent:false,nowMs:time,
  prediction:currentPredictionSignal(evaluated.state,time+121000)});
 assert.equal(ablated.some(x=>x.label==='cross-module-surprise'),false);
 const reported=observePrediction(original,predictModule(original,{
  module:'task',operationId:'req-2',at}),{success:false,source:'reported',at});
 assert.equal(reported.eligible_for_attention,false);
 assert.equal(currentPredictionSignal(reported.state,time),null);
});
test('viability reserve degrades and recovers, reducing attention capacity without deletion',()=>{
 let v=initialViability();
 let t=time;
 for(let n=0;n<160;n++){
  t+=30000;
  v=evolveViability(v,{homeostasis:{
    sensor:{source:'node-process',sampled_at:new Date(t).toISOString(),
      compute_pressure:1},failure_ema:.8,
  }},t);
 }
 assert.ok(v.capacity<3);
 assert.equal(v.optional_work_allowed,false);
 assert.equal(v.irreversible_destruction_allowed,false);
 const restricted=competeInWorkspace(workspaceInput({
  userPresent:true,plan:{act:'respond'},nowMs:t,
  metacognition:{verify:true},
 }),{nowMs:t,capacity:v.capacity});
 assert.equal(restricted.selected.length,v.capacity);
 const constrained=v.reserve;
 for(let n=0;n<300;n++){
  t+=30000;
  v=evolveViability(v,{homeostasis:{}},t);
 }
 assert.ok(v.reserve>constrained);
 assert.equal(v.recovery_possible,true);
 const differs=viabilityAblation(initialViability(),{
  homeostasis:{sensor:{source:'node-process',sampled_at:at,
    compute_pressure:1}}},time);
 assert.equal(differs.causal,true);
});
test('offline consolidation uses only independently verified outcomes and is tamper evident',async()=>{
 const key='test-key-material-only-not-production'.repeat(2);
 const rows=[
  {context_tag:'code_review',action:'verify',success:1,source:'machine-verified'},
  {context_tag:'code_review',action:'verify',success:0,source:'machine-verified'},
  {context_tag:'code_review',action:'verify',success:1,source:'external-report'},
  {context_tag:'chat',action:'respond',success:1,source:'founder-feedback'},
 ];
 const durable=consolidateRows(rows,{at,signingKey:key});
 assert.equal(durable.signed,true);
 assert.equal(durable.verified_rows,2);
 assert.deepEqual(durable.evidence.map(x=>x.context),['code_review']);
 assert.equal(durable.evidence[0].successes,1);
 assert.equal(durable.evidence[0].failures,1);
 assert.equal(verifyConsolidation(durable,key),true);
 assert.equal(verifyConsolidation({...durable,verified_rows:20},key),false);
 assert.equal(verifyConsolidation(durable,'different-key'.repeat(4)),false);
 const plain=consolidateRows(rows,{at});
 assert.equal(plain.signed,false);
 assert.equal(plain.integrity,'sha256-unkeyed');
 const calls=[];
 const engine=new OfflineConsolidation({clock:()=>time,signingKey:key,
  db:{execute:async(sql)=>{
   calls.push(sql);return [rows];
  }}});
 const result=await engine.step();
 assert.equal(result.executed,true);
 assert.equal(result.signed,true);
 assert.equal(result.state.evidence.length,1);
 assert.equal(consolidationDue(result.state,time+1000),false);
 assert.equal((await engine.step(result.state)).reason,'not-due');
 assert.equal(calls.length,1);
 assert.match(calls[0],/o.source='machine-verified'/);
});
test('kernel implementation wires all four mechanisms and keeps direct tasks accessible',()=>{
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 for(const pattern of [
  /languageWorkspaceProjection\(plan,workspace/,
  /semanticWorkspaceContext\(await this\.contextForAi/,
  /executionWorkspaceGate\(workspace\)/,
  /this\.soulCache\.viability=evolveViability/,
  /this\.offlineConsolidation\.step/,
  /module:'language',operationId:brainFlowId/,
  /currentPredictionSignal\(this\.soulCache\.prediction_bus\)/,
  /Boolean\(String\(text\)\.trim\(\)\)/,
 ])assert.match(kernel,pattern);
});
