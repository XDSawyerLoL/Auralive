import test from 'node:test';
import assert from 'node:assert/strict';
import {initialCausalWorld,predictCausalWorld,observeVerifiedCausalWorld,
 causalWorldChoice,causalWorldAblation,proposeCausalPolicyTransfer,causalPolicyTransferAblation}
 from '../src/causal_world_learning.js';
const context='docs_readability';
const receipt=(id,source='machine-verified')=>({
 episode_id:id,source,calibrated:source==='machine-verified'
});
function experience(state,id,{success=true,source='machine-verified',
 contextTag=context,action='verify',at=id*10,affordances=[]}={}){
 const issued='2026-11-14T10:'+String(at).padStart(2,'0')+':00.000Z';
 const observed='2026-11-14T10:'+String(at).padStart(2,'0')+':01.000Z';
 const p=predictCausalWorld(state,{
  episodeId:id,context:contextTag,action,issuedAt:issued,affordances});
 assert.equal(p.accepted,true);
 const result=observeVerifiedCausalWorld(
  JSON.parse(JSON.stringify(p.state)),{
    episodeId:id,runId:'distinct-run-'+id,success,observedAt:observed,
    proofHash:String(id%10).repeat(64),
    ledgerReceipt:receipt(id,source)
  });
 return result;
}
test('new world makes an explicit prediction before real observation',()=>{
 const state=initialCausalWorld();
 const p=predictCausalWorld(state,{
  episodeId:1,context,action:'verify',
  issuedAt:'2026-11-14T10:10:00.000Z'});
 assert.equal(p.accepted,true);
 assert.equal(p.prediction.expected_success,0.5);
 assert.equal(p.state.pending.length,1);
 assert.equal(p.state.episodes.length,0);
 assert.equal(p.prediction.observations_before_prediction,0);
});
test('only a HistoryLedger-confirmed machine receipt changes the world model',()=>{
 const initial=initialCausalWorld();
 const predicted=predictCausalWorld(initial,{
  episodeId:1,context,action:'verify',issuedAt:'2026-11-14T10:10:00.000Z'});
 const args={episodeId:1,runId:'run1',success:true,
  observedAt:'2026-11-14T10:11:00.000Z',proofHash:'a'.repeat(64)};
 for(const ledgerReceipt of [
  receipt(1,'external-report'),
  {episode_id:1,source:'machine-verified',calibrated:false},
  {episode_id:9,source:'machine-verified',calibrated:true},
 ]){
  const rejected=observeVerifiedCausalWorld(predicted.state,{...args,ledgerReceipt});
  assert.equal(rejected.accepted,false);
  assert.equal(rejected.state.episodes.length,0);
 }
 const premature=observeVerifiedCausalWorld(predicted.state,{
  ...args,ledgerReceipt:receipt(1),observedAt:'2026-11-14T10:09:00.000Z'});
 assert.equal(premature.accepted,false);
 const valid=observeVerifiedCausalWorld(predicted.state,{...args,ledgerReceipt:receipt(1)});
 assert.equal(valid.accepted,true);
 assert.equal(valid.state.episodes.length,1);
 assert.equal(valid.state.pending.length,0);
 assert.equal(valid.evidence.predicted_probability,0.5);
 assert.equal(observeVerifiedCausalWorld(valid.state,{...args,ledgerReceipt:receipt(1)}).accepted,false);
});
test('two independent machine outcomes shift a decision, persist and ablation reverses it',()=>{
 let world=initialCausalWorld();
 assert.equal(causalWorldChoice(world,{context}).action,'respond');
 for(const id of [1,2]){
  const r=experience(world,id);
  assert.equal(r.accepted,true);
  world=r.state;
 }
 const revised=causalWorldChoice(world,{context});
 assert.equal(revised.action,'verify');
 assert.equal(revised.changed,true);
 assert.deepEqual(revised.evidence_ids,[1,2]);
 const persisted=JSON.parse(JSON.stringify(world));
 assert.deepEqual(causalWorldChoice(persisted,{context}),revised);
 const ablation=causalWorldAblation(persisted,{context});
 assert.equal(ablation.decision_changed,true);
 assert.equal(ablation.without_evidence.action,'respond');
 assert.equal(ablation.evidence_count,2);
 assert.equal(causalWorldChoice(persisted,{context:'other_context'}).action,'respond');
});
test('contradictory verified evidence revises expected success but cannot force unwarranted belief',()=>{
 let world=initialCausalWorld();
 for(const id of [1,2,3]){
  const r=experience(world,id,{success:id===1});
  assert.equal(r.accepted,true);
  world=r.state;
 }
 assert.equal(causalWorldChoice(world,{context}).changed,false);
 const p=predictCausalWorld(world,{
  episodeId:4,context,action:'verify',
  issuedAt:'2026-11-14T10:40:00.000Z'});
 assert.equal(p.prediction.expected_success,0.4);
});
test('pending prediction does not count as evidence after a process restart',()=>{
 const p=predictCausalWorld(initialCausalWorld(),{
  episodeId:5,context,action:'verify',issuedAt:'2026-11-14T10:50:00.000Z'});
 const restarted=JSON.parse(JSON.stringify(p.state));
 assert.equal(restarted.pending.length,1);
 assert.equal(causalWorldChoice(restarted,{context}).changed,false);
 const falseReceipt=observeVerifiedCausalWorld(restarted,{
  episodeId:5,runId:'test',success:true,
  observedAt:'2026-11-14T10:51:00.000Z',proofHash:'a'.repeat(64),
  ledgerReceipt:{episode_id:5,source:'founder-feedback',calibrated:false}
 });
 assert.equal(falseReceipt.accepted,false);
});


test('verified source actions transfer a safety competence into a novel domain and survive restart',()=>{
 const features=['read_only','filesystem','path_access','precheck_available'];
 let world=initialCausalWorld();
 for(const row of [
  [1,'config_health'],[2,'article_media']
 ]){
  const out=experience(world,row[0],{contextTag:row[1],affordances:features});
  assert.equal(out.accepted,true);
  world=out.state;
 }
 const options={targetContext:'backup_review',affordances:features};
 const first=proposeCausalPolicyTransfer(world,options);
 assert.equal(first.transferred,true);
 assert.equal(first.action,'verify');
 assert.equal(first.target_outcome_verified,false);
 assert.deepEqual(first.source_domains,['article_media','config_health']);
 assert.deepEqual(first.evidence_ids,[1,2]);
 assert.match(first.safety,/private-authorized-probe/);
 assert.deepEqual(proposeCausalPolicyTransfer(JSON.parse(JSON.stringify(world)),options),first);
 const ablation=causalPolicyTransferAblation(world,options);
 assert.equal(ablation.transfer_depends_on_verified_history,true);
 assert.equal(ablation.without.transferred,false);
 assert.equal(proposeCausalPolicyTransfer(world,{
  targetContext:'external_camera',affordances:['vision','realtime']}).transferred,false);
});
test('a contrary verified outcome stops transfer instead of silently rewarding majority',()=>{
 const features=['read_only','filesystem','path_access','precheck_available'];
 let world=initialCausalWorld();
 for(const row of [
  [1,'config_health',true],[2,'article_media',true],
  [3,'backup_review',false]
 ]){
  const out=experience(world,row[0],{
   contextTag:row[1],success:row[2],affordances:features});
  world=out.state;
 }
 const outcome=proposeCausalPolicyTransfer(world,{
  targetContext:'new_backup_check',affordances:features});
 assert.equal(outcome.transferred,false);
 assert.equal(outcome.contrary_outcomes,1);
});
test('same domain or repeated run cannot masquerade as independent cross-domain proof',()=>{
 const features=['read_only','filesystem'];
 let world=initialCausalWorld();
 for(const id of [1,2]){
  const out=experience(world,id,{
   contextTag:'same_context',affordances:features});
  world=out.state;
 }
 assert.equal(proposeCausalPolicyTransfer(world,{
  targetContext:'new_context',affordances:features}).transferred,false);
});
