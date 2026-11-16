import test from 'node:test';
import assert from 'node:assert/strict';
import {
 initialSocialHomeostasis,advanceSocialHomeostasis,chooseSocialAction,
 beginSocialTrial,observeSocialTrial,socialMotivationContext
} from '../src/social_homeostasis.js';
import {AuraOrganism} from '../src/organism.js';

const deficit={uncertainty:.96,coherence:.19,novelty_deficit:.95,energy:.18};
const recovered={uncertainty:.11,coherence:.93,novelty_deficit:.12,energy:.91};
const canPropose={contactConsent:true,engagementAuthorized:true};
const observed=(state,id,action,after=deficit)=> {
 const initiated=beginSocialTrial(state,{id,action});
 assert.equal(initiated.accepted,true);
 return observeSocialTrial(initiated.state,{id,after,
  source:action==='seek_contact'?'authenticated-correlated-user-feedback':
   'machine-verified-local-state',verified:true,correlated:true,
  contactConsent:true});
};

test('autonomous needs drift without a programmed loneliness or social bonus',()=>{
 const state=initialSocialHomeostasis();
 const before=socialMotivationContext(state);
 const after=advanceSocialHomeostasis(state,{seconds:3600,resourcePressure:.3});
 assert.ok(after.needs.uncertainty>state.needs.uncertainty);
 assert.ok(after.needs.novelty_deficit>state.needs.novelty_deficit);
 assert.ok(after.needs.energy>=state.needs.energy);
 assert.equal(after.needs.coherence,state.needs.coherence,
  'lack of human contact must not fake a contradiction');
 assert.equal(before.contact_is_not_a_vital_requirement,true);
 assert.equal(before.selected_action,'silence');
 assert.equal(before.no_paid_model_required,true);
});
test('contact is not privileged: silence/local options compete at equal learning prior',()=>{
 const state={...initialSocialHomeostasis(),needs:deficit};
 const unconsented=chooseSocialAction(state);
 assert.equal(unconsented.ranked.some(r=>r.action==='seek_contact'),false);
 const consented=chooseSocialAction(state,canPropose);
 assert.equal(consented.action,'inspect_local');
 assert.ok(consented.ranked.find(r=>r.action==='inspect_local').score>
  consented.ranked.find(r=>r.action==='seek_contact').score);
});
test('social contact is discovered only after local alternatives fail and consent exists',()=>{
 let state={...initialSocialHomeostasis(),needs:deficit};
 for(const [action,id] of [
   ['inspect_local','trial_inspection_0001'],
   ['consolidate_memory','trial_memory_0001']
 ]){
  const episode=observed(state,id,action,deficit);
  assert.equal(episode.accepted,true);
  state=episode.state;
 }
 assert.equal(chooseSocialAction(state,canPropose).action,'seek_contact');
 assert.equal(chooseSocialAction(state,{contactConsent:false,
   engagementAuthorized:true}).action,'silence');
 const episode=observed(state,'trial_contact_0001','seek_contact',recovered);
 assert.equal(episode.accepted,true);
 state=episode.state;
 assert.equal(state.consequences.seek_contact.count,1);
 assert.equal(state.last_outcome.verified_source,
  'authenticated-correlated-user-feedback');
 assert.equal(chooseSocialAction(state,canPropose).action,'silence',
  'after recovery, talking again must not be rewarded');
 state={...state,needs:deficit};
 assert.equal(chooseSocialAction(state,canPropose).action,'seek_contact',
  'same deficit can reuse successful evidence instead of a fixed timeout');
});
test('unhelpful or irrelevant contact does not earn a fictitious social reward',()=>{
 let state={...initialSocialHomeostasis(),needs:deficit};
 const first=observed(state,'trial_contact_bad1','seek_contact',deficit);
 assert.equal(first.accepted,true);
 state=first.state;
 assert.equal(state.consequences.seek_contact.total_gain,0);
 assert.notEqual(chooseSocialAction(state,canPropose).action,'seek_contact');
});
test('unauthenticated, unrelated, repeated or spoofed feedback never updates learning',()=>{
 const state={...initialSocialHomeostasis(),needs:deficit};
 const start=beginSocialTrial(state,{id:'trial_contact_0002',action:'seek_contact'});
 assert.equal(start.accepted,true);
 for(const args of [
  {id:'trial_other_0002',source:'authenticated-correlated-user-feedback',
   verified:true,correlated:true,contactConsent:true},
  {id:'trial_contact_0002',source:'authenticated-correlated-user-feedback',
   verified:false,correlated:true,contactConsent:true},
  {id:'trial_contact_0002',source:'unverified-llm-claim',
   verified:true,correlated:true,contactConsent:true},
  {id:'trial_contact_0002',source:'authenticated-correlated-user-feedback',
   verified:true,correlated:true,contactConsent:false},
 ]){
  const bad=observeSocialTrial(start.state,{after:recovered,...args});
  assert.equal(bad.accepted,false);
  assert.equal(bad.state.consequences.seek_contact.count,0);
 }
 const good=observeSocialTrial(start.state,{id:'trial_contact_0002',
  source:'authenticated-correlated-user-feedback',
  verified:true,correlated:true,contactConsent:true,after:recovered});
 assert.equal(good.accepted,true);
 const replay=observeSocialTrial(good.state,{id:'trial_contact_0002',
  source:'authenticated-correlated-user-feedback',
  verified:true,correlated:true,contactConsent:true,after:recovered});
 assert.equal(replay.accepted,false);
 assert.equal(replay.state.consequences.seek_contact.count,1);
});
test('AURA organism actually evolves functional needs, never sends a message',()=>{
 const sensor={sample:()=>({source:'node-process',compute_pressure:.1,
  heap_utilization:.21,cpu_utilization:.1,heap_used_bytes:12345,
  rss_bytes:112233,sampled_at:new Date().toISOString(),
  coverage:'current-process-only'})};
 const organ=new AuraOrganism({sensor});
 const seed=organ.defaultState({developmental:true});
 assert.equal(organ.publicState(seed).autonomous_need_model.selected_action,'silence');
 const old=seed.autonomous_needs.needs.uncertainty;
 organ.regulate(seed,'ambient',1800);
 assert.ok(seed.autonomous_needs.needs.uncertainty>old);
 const publicState=organ.publicState(seed);
 assert.equal(publicState.autonomous_need_model.no_external_action_from_context,true);
 assert.equal(publicState.autonomous_need_model.contact_is_not_a_vital_requirement,true);
 assert.equal(publicState.autonomous_need_model.action_space.length,4);
 assert.equal(organ.planAutonomousNeedAction(seed,{contactConsent:true})
  .ranked.some(a=>a.action==='seek_contact'),false,
  'without explicit persistent consent, no contact option exists');
});


test('existing independent initiative cannot bypass causal learning and consent',async()=>{
 const {InnerDialogueEngine}=await import('../src/inner_dialogue.js');
 const engine=new InnerDialogueEngine();
 const receipt={probe:'context_policy_ablation',outcome:'supported',
  causal_change:true,external_success_verified:false,
  origin:'kernel-autonomous-test',context:'dialogue_general',
  experience_revision:4,at:'2026-11-16T14:00:00.000Z',
  baseline_action:'defer',observed_action:'clarify'};
 const other={identity:{dimensions:{}},receipt,previous:null,
  viability:{optional_work_allowed:true},
  now:'2026-11-16T14:10:00.000Z'};
 const organism={homeostasis:{resource_pressure:.05},
  besoin_de_silence:.1,curiosite_sociale:.94,
  agency:.96,clarte:.95,frustration:.25,
  autonomous_needs:{...initialSocialHomeostasis(),needs:deficit},
  social_contact_policy:{explicit_consent:false}};
 assert.equal(engine.proposeSocialInitiative({...other,organism}),null,
  'fixed social-drive values must not force a proposal without consent');
 organism.social_contact_policy.explicit_consent=true;
 assert.equal(engine.proposeSocialInitiative({...other,organism}),null,
  'consent alone cannot bypass local exploration or predicted utility');
 let state=organism.autonomous_needs;
 for(const [action,id,after] of [
  ['inspect_local','trial_inner_local',deficit],
  ['consolidate_memory','trial_inner_memory',deficit],
  ['seek_contact','trial_inner_contact',recovered]
 ]){
  const episode=observed(state,id,action,after);
  assert.equal(episode.accepted,true);
  state=episode.state;
  // A different verified need-state emerges, not a time-based trigger.
  if(action==='seek_contact')state={...state,needs:deficit};
 }
 organism.autonomous_needs=state;
 const candidate=engine.proposeSocialInitiative({...other,organism});
 assert.equal(candidate?.status,'pending-opt-in');
 assert.equal(candidate?.outbound_action_executed,false);
 assert.equal(candidate?.llm_used,false);
 organism.social_contact_policy.explicit_consent=false;
 assert.equal(engine.proposeSocialInitiative({...other,organism}),null);
});


test('causal ablation changes contact decision, without learning silence wins',()=>{
 let state={...initialSocialHomeostasis(),needs:deficit};
 const success=observed(state,'trial_contact_ablation1','seek_contact',recovered);
 assert.equal(success.accepted,true);
 const target={uncertainty:.70,coherence:.10,novelty_deficit:.40,energy:.20};
 state={...success.state,needs:target};
 const learned=chooseSocialAction(state,canPropose);
 assert.equal(learned.action,'seek_contact');
 const ablated={...state,
  consequences:{...state.consequences,
   seek_contact:{count:0,total_gain:0}}};
 const control=chooseSocialAction(ablated,canPropose);
 assert.equal(control.action,'silence');
 assert.ok(learned.ranked.find(x=>x.action==='seek_contact').score>0);
 assert.ok(control.ranked.find(x=>x.action==='seek_contact').score<0);
});
test('heavy compute load protects all optional work and leaves silence possible',()=>{
 const state={...initialSocialHomeostasis(),needs:deficit};
 const decision=chooseSocialAction(state,{...canPropose,resourcePressure:.95});
 assert.deepEqual(decision.ranked.map(x=>x.action),['silence']);
 assert.equal(decision.external_message_authorized,false);
});
