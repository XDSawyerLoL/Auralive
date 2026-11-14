import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {episodeDigest,historyChoice,ablationComparison,HistoryLedger} from '../src/history_provenance.js';

const context='dialogue_correction',date='2026-11-09T17:00:00.000Z';
const rows=[{policy_id:7,hypothesis_id:4,rule_action:'clarify',active:1,
  hypothesis_status:'promoted',context_tag:context,confidence:.86,
  evidence:[
    {episode_id:12,source:'machine-verified',polarity:'support',ablated:0},
    {episode_id:13,source:'machine-verified',polarity:'support',ablated:0},
    {episode_id:14,source:'machine-verified',polarity:'support',ablated:0},
  ]}];

test('sha256 episode chain is deterministic, includes prediction and previous hash',()=>{
 const episode={ts:date,kind:'action',context_tag:context,action:'respond',
   prediction:'correct answer',confidence:.4};
 assert.equal(episodeDigest('GENESIS',episode),episodeDigest('GENESIS',episode));
 assert.notEqual(episodeDigest('GENESIS',episode),episodeDigest('other',episode));
 assert.notEqual(episodeDigest('GENESIS',episode),
   episodeDigest('GENESIS',{...episode,prediction:'other'}));
});
test('only promoted active policies backed by verified nonablated evidence affect replies',()=>{
 assert.equal(historyChoice({context,rows}).action,'clarify');
 for(const mutation of [
  {...rows[0],active:0},
  {...rows[0],hypothesis_status:'candidate'},
  {...rows[0],hypothesis_status:'refuted'},
  {...rows[0],context_tag:'different'},
  {...rows[0],evidence:[rows[0].evidence[0]]},
  {...rows[0],evidence:rows[0].evidence.map(e=>({...e,source:'founder-feedback'}))},
  {...rows[0],evidence:rows[0].evidence.map(e=>({...e,ablated:1}))},
  {...rows[0],evidence:rows[0].evidence.map(e=>({...e,polarity:'contradict'}))},
 ]){
  assert.equal(historyChoice({context,rows:[mutation]}).action,'respond');
 }
});
test('predicting an action will fail cannot make that action a future preferred policy',()=>{
 const negative={...rows[0],expected_success:0};
 assert.equal(historyChoice({context,rows:[negative]}).action,'respond');
 const positive={...rows[0],expected_success:1};
 assert.equal(historyChoice({context,rows:[positive]}).action,'clarify');
});
test('ablation demonstrates a causal choice change without mutating the real data',()=>{
 const original=JSON.stringify(rows);
 const r=ablationComparison({context,rows});
 assert.equal(r.withHistory.action,'clarify');
 assert.equal(r.withoutHistory.action,'respond');
 assert.equal(r.withoutEpisodes.action,'respond');
 assert.equal(r.causalChange,true);
 assert.equal(JSON.stringify(rows),original);
});
test('provenance identifies the exact eligible policy, hypothesis and episodes',()=>{
 const p=historyChoice({context,rows});
 assert.deepEqual(p.provenance.map(x=>x.item_type),
   ['policy','hypothesis','episode','episode','episode']);
 assert.deepEqual(p.provenance.map(x=>x.item_id),[7,4,12,13,14]);
 assert.deepEqual(historyChoice({context,rows,excludedEpisodes:[12,13]}).provenance,[]);
});
function fakeDb(){
 let lastHash='GENESIS',episodeId=1,decisionId=10;
 const transactions=[],outcomes=[],writes=[];
 return {transactions,outcomes,writes,getConnection:async()=>({
  beginTransaction:async()=>transactions.push('begin'),
  query:async sql=>{assert.match(sql,/FOR UPDATE/);return [[{last_hash:lastHash}]];},
  execute:async(sql,args)=>{
   writes.push({sql,args});
   if(sql.includes('INSERT INTO aura_history_episodes'))return [{insertId:episodeId++}];
   if(sql.includes('UPDATE aura_history_head')){lastHash=args[0];return [{}];}
   if(sql.includes('INSERT INTO aura_history_decisions'))return [{insertId:decisionId++}];
   if(sql.includes('INSERT INTO aura_history_decision_provenance'))return [{}];
   throw new Error(sql);
  },
  commit:async()=>transactions.push('commit'),
  rollback:async()=>transactions.push('rollback'),
  release:()=>transactions.push('release'),
 }),execute:async(sql,args)=>{
  if(sql.includes('INSERT INTO aura_history_outcomes')){outcomes.push(args);return [{}];}
  if(sql.includes('FROM aura_history_policies'))return [[{
   policy_id:7,hypothesis_id:4,rule_action:'clarify',active:1,
   hypothesis_status:'promoted',context_tag:context,confidence:.86,
  }]];
  if(sql.includes('FROM aura_history_hypothesis_evidence'))return [[12,13,14]
    .map(episode_id=>({hypothesis_id:4,episode_id,source:'machine-verified',
      polarity:'support',ablated:0}))];
  throw new Error(sql);
 }};
}
test('one transaction appends the episode before its separate result',async()=>{
 const db=fakeDb(),history=new HistoryLedger({db,clock:()=>date,
   verifyOutcome:async({success})=>success===1});
 const first=await history.beginEpisode({context_tag:context,action:'respond',confidence:.5});
 const second=await history.beginEpisode({context_tag:context,action:'clarify'});
 assert.equal(first.prev_hash,'GENESIS');
 assert.equal(second.prev_hash,first.hash);
 const feedback=await history.recordOutcome(first.id,{
   outcome:'founder correction',success:0,source:'founder-feedback'});
 assert.equal(feedback.calibrated,false);
 assert.equal(db.outcomes[0][2],null);
 assert.equal((await history.recordOutcome(second.id,{
   outcome:'independent test',success:1,source:'machine-verified'})).calibrated,true);
 assert.deepEqual(db.transactions,['begin','commit','release','begin','commit','release']);
});
test('a forged machine verification fails closed',async()=>{
 const db=fakeDb(),history=new HistoryLedger({db,clock:()=>date});
 await assert.rejects(()=>history.recordOutcome(1,{
   outcome:'unverified claim',success:1,source:'machine-verified'}),/Independent machine verification/);
 assert.equal(db.outcomes.length,0);
});
test('chosen decision and actual retrieval provenance commit in same transaction',async()=>{
 const db=fakeDb(),history=new HistoryLedger({db,clock:()=>date});
 const r=await history.decide({
   context_tag:context,baseline:'respond',run_id:'run-1',situation_id:'case-1'});
 assert.equal(r.action,'clarify');
 assert.equal(r.decision_id,10);
 assert.deepEqual(db.transactions,['begin','commit','release']);
 const proven=db.writes.filter(x=>x.sql.includes('decision_provenance'));
 assert.equal(proven.length,5);
 assert.equal(proven[0].args[1],'policy');
});
test('Cloud schema v18 is separated from SQLite and has immutable receipts',()=>{
 const schema=readFileSync(new URL('../src/db.js',import.meta.url),'utf8');
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(schema,/LATEST_SCHEMA_VERSION = 19/);
 assert.match(schema,/aura_history_outcomes/);
 assert.match(schema,/CREATE TRIGGER/);
 assert.match(schema,/machine-verified/);
 assert.match(kernel,/this\.history\.decide/);
 assert.match(kernel,/this\.history\.beginEpisode/);
 assert.match(kernel,/this\.history\.recordOutcome/);
});
