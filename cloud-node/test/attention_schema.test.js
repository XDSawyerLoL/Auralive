import test from 'node:test';
import assert from 'node:assert/strict';
import {predictAttention,steerAttention,observeAttention,initialAttentionSchema,attentionAblation}
  from '../src/attention_schema.js';
import {competeInWorkspace} from '../src/global_workspace.js';

const ms=Date.parse('2026-11-11T14:00:00Z');
const at=new Date(ms).toISOString();
const nearTie=[
 {source:'memory',label:'memory-candidate',salience:.50,confidence:1,at},
 {source:'executive',label:'executive-plan',salience:.54,confidence:1,at},
];
test('attention schema learns recurring transitions without a language model',()=>{
 let state=initialAttentionSchema();
 for(let n=0;n<5;n++){
  const prediction=predictAttention(state,nearTie);
  const simulated=competeInWorkspace(nearTie,{nowMs:ms,capacity:1});
  const outcome=observeAttention(state,prediction,simulated,at);
  assert.equal(outcome.observed,true);
  state=outcome.state;
 }
 assert.equal(state.observations,5);
 assert.equal(state.last_focus,'executive');
 assert.equal(state.transition_counts.executive.executive,4);
 const forecast=predictAttention(state,nearTie);
 assert.equal(forecast.trusted,true);
 assert.equal(forecast.predicted_focus,'executive');
 assert.ok(forecast.confidence>.6);
 assert.equal(state.subjective_experience_proven,undefined);
});
test('attention schema causes a real change in competition, removal changes selected focus',()=>{
 const previous={...initialAttentionSchema(),last_focus:'executive',
  transition_counts:{executive:{memory:20,executive:0}}};
 const predicted=predictAttention(previous,nearTie);
 assert.equal(predicted.predicted_focus,'memory');
 assert.equal(predicted.trusted,true);
 const withBias=competeInWorkspace(steerAttention(nearTie,predicted,true),{
  nowMs:ms,capacity:1});
 const without=competeInWorkspace(steerAttention(nearTie,predicted,false),{
  nowMs:ms,capacity:1});
 assert.equal(withBias.decision.attention,'memory');
 assert.equal(without.decision.attention,'executive');
 assert.equal(attentionAblation(previous,nearTie).candidate_change,true);
 const observed=observeAttention(previous,predicted,withBias,at);
 assert.equal(observed.correct,true);
 assert.equal(observed.prediction_qualified,true);
});
test('an untrusted attention model has no power before adequate evidence',()=>{
 const state=initialAttentionSchema(),predicted=predictAttention(state,nearTie);
 assert.equal(predicted.trusted,false);
 assert.deepEqual(steerAttention(nearTie,predicted,true),nearTie);
 assert.deepEqual(steerAttention(nearTie,predicted,false),nearTie);
 const silent=observeAttention(state,predicted,{
  broadcast_enabled:false,decision:{attention:'memory'}},at);
 assert.equal(silent.observed,false);
 assert.deepEqual(silent.state,state);
});
