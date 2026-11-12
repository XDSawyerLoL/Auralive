import test from 'node:test';
import assert from 'node:assert/strict';
import {arbitrateConversationInitiative as decide} from '../src/conversation_initiative.js';
const at='2026-11-12T21:00:00.000Z';
const receipt={at:'2026-11-12T20:59:00.000Z',origin:'kernel-autonomous-test',
  probe:'context_policy_ablation',outcome:'supported',causal_change:true,
  external_success_verified:false,context:'dialogue_general',experience_revision:4};
const candidate={id:'candidate-4',status:'pending-opt-in',
  source:'independent-kernel-probe',evidence_key:'dialogue_general:4',
  external_success_verified:false,outbound_action_executed:false};
test('real local policy evidence can lead to an unspoken review question',()=>{
  const result=decide({receipt,candidate,now:at});
  assert.equal(result.act,'ask');
  assert.equal(result.requires_opt_in,true);
  assert.equal(result.delivered,false);
  assert.equal(result.external_success_verified,false);
});
test('never mistake speculation, external claims or malformed timestamps for verified facts',()=>{
  for(const patch of [{outcome:'inconclusive'},{causal_change:false},
    {external_success_verified:true},{origin:'llm-generated'},
    {at:'no date'},{context:'../../private'},{experience_revision:0}]){
    assert.equal(decide({receipt:{...receipt,...patch},candidate,now:at}).act,'silence');
  }
});
test('repeated evidence, waiting opt-in and cooldown prefer silence',()=>{
  assert.equal(decide({receipt,candidate,now:at,
    previous:{last_evidence_key:'dialogue_general:4'}}).reason,'evidence-already-considered');
  assert.equal(decide({receipt,candidate,now:at,
    previous:{pending:{status:'pending-opt-in'}}}).reason,'previous-initiative-pending');
  assert.equal(decide({receipt,candidate,now:at,
    previous:{last_decision_at:'2026-11-12T20:00:00.000Z'}}).reason,'conversation-cooldown');
});
test('without social impulse AURA chooses silence even with local evidence',()=>{
  const result=decide({receipt,candidate:null,now:at});
  assert.equal(result.act,'silence');
  assert.equal(result.reason,'social-drive-prefers-silence');
});
test('future receipts, unconsented delivery and unrelated candidates cannot speak',()=>{
  assert.equal(decide({receipt:{...receipt,at:'2026-11-13T21:00:00.000Z'},candidate,now:at}).act,'silence');
  assert.equal(decide({receipt,candidate:{...candidate,outbound_action_executed:true},now:at}).act,'silence');
  assert.equal(decide({receipt,candidate:{...candidate,evidence_key:'dialogue_social:4'},now:at}).act,'silence');
});
