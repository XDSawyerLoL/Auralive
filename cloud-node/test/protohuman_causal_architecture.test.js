import test from 'node:test';
import assert from 'node:assert/strict';
import {ActiveInferenceEngine} from '../src/active_inference.js';
import {evolveHomeostasis} from '../src/somatic_dynamics.js';
import {organAblation,organSignals} from '../src/organ_regulation.js';
import {HistoryLedger,historyChoice,ablationComparison} from '../src/history_provenance.js';
import {NativePolicyLearner} from '../src/native_learning.js';
import {InnerDialogueEngine} from '../src/inner_dialogue.js';
import {IdentityAutogenesis} from '../src/identity_autogenesis.js';

const TIME=Date.parse('2026-11-11T11:00:00.000Z');
const at=new Date(TIME).toISOString();
const somatic={
 stabilite:.72,clarte:.72,confiance:.7,satisfaction:.55,frustration:.15,
 engagement:.7,agency:.72,besoin_de_silence:.2,
 homeostasis:{seed:11,success_ema:.2,failure_ema:.05,steps:0},
};
test('proto-humain: an actual outcome changes functional homeostasis more than an empty tick',()=>{
 const ambient=evolveHomeostasis(somatic,{signal:'ambient',seconds:60,nowMs:TIME});
 const failed=evolveHomeostasis(somatic,{signal:'action_failure',seconds:60,nowMs:TIME});
 assert.ok(failed.homeostasis.failure_ema>ambient.homeostasis.failure_ema);
 assert.ok(failed.frustration>ambient.frustration);
 assert.ok(failed.clarte<ambient.clarte);
 assert.equal(failed.homeostasis.sensor,null);
});
test('proto-humain: recent insular process reading changes computation; stale one cannot',()=>{
 const organism={homeostasis:{
  sensor:{source:'node-process',sampled_at:at,compute_pressure:.94},
  failure_ema:.89,
 }};
 const input={compute_tier:'deep',token_budget:700,risk:.14,novelty:.5};
 const ablation=organAblation(input,organism,{nowMs:TIME});
 assert.equal(ablation.pressure_causal,true);
 assert.equal(ablation.failure_causal,true);
 assert.ok(ablation.actual.token_budget<ablation.noPressure.token_budget);
 const old={homeostasis:{...organism.homeostasis,
  sensor:{...organism.homeostasis.sensor,
   sampled_at:new Date(TIME-121000).toISOString()}}};
 assert.equal(organSignals(old,TIME).resource_pressure,0);
});
test('proto-humain: executive inference reacts to risk, and outcome learning affects inference weights',()=>{
 const engine=new ActiveInferenceEngine();
 const input={stabilite:.68,clarte:.7,intention_field:{potentials:{explorer:.6,verifier:.3}}};
 const baseline=engine.assess(input,{novelty:.4,risk:0});
 const highRisk=engine.assess(input,{novelty:.4,risk:.98});
 assert.ok(highRisk.difficulty>baseline.difficulty);
 const learner=new NativePolicyLearner();
 const initial=learner.defaultState();
 const learned=learner.update(initial,{ok:false,surprise:.9,risk:.9});
 assert.ok(learned.params.risk_weight>initial.params.risk_weight);
 assert.ok(learned.params.deep_threshold<initial.params.deep_threshold);
 const without=engine.assess(input,{novelty:.4,risk:.9,policy:initial.params});
 const withLearning=engine.assess(input,{novelty:.4,risk:.9,policy:learned.params});
 assert.notEqual(withLearning.difficulty,without.difficulty);
});
test('proto-humain: verified contextual memory changes a later action, ablation restores baseline',()=>{
 const records=[{
  active:1,hypothesis_status:'promoted',context_tag:'dialogue-correction',
  rule_action:'clarify',confidence:.88,policy_id:4,hypothesis_id:5,
  evidence:[
   {source:'machine-verified',polarity:'support',ablated:0,episode_id:41},
   {source:'machine-verified',polarity:'support',ablated:0,episode_id:42},
   {source:'founder-feedback',polarity:'support',ablated:0,episode_id:43},
  ],
 }];
 const input={context:'dialogue-correction',baseline:'respond',rows:records};
 const actual=historyChoice(input);
 assert.equal(actual.action,'clarify');
 assert.equal(actual.provenance.filter(x=>x.item_type==='episode').length,2);
 const isolated=ablationComparison(input);
 assert.equal(isolated.withoutHistory.action,'respond');
 assert.equal(isolated.withoutEpisodes.action,'respond');
 assert.equal(isolated.causalChange,true);
 assert.equal(new HistoryLedger({db:{}}).verifyOutcome instanceof Function,true);
});
test('proto-humain: learned prudence can change harmless arbitration, not consciousness',()=>{
 const engine=new InnerDialogueEngine();
 const organism={
  clarte:.9,confiance:.85,frustration:.05,curiosite:.45,
  curiosite_sociale:.35,agency:.65,
  homeostasis:{resource_pressure:0,success_ema:.05,failure_ema:0,seed:99},
 };
 const none=engine.deliberate({organism,plan:{act:'respond'},
  identity:{},message:'Bonjour',now:at});
 const learned=engine.deliberate({organism,plan:{act:'respond'},
  identity:{dimensions:{
    prudence:{value:.98,evidence:6},
    initiative:{value:.09,evidence:6},
  }},message:'Bonjour',now:at});
 assert.notDeepEqual(learned.learned_effect,none.learned_effect);
 assert.equal(learned.learned_effect.prudence>none.learned_effect.prudence,true);
 assert.equal(learned.conscious_experience_claim,false);
});
test('proto-humain: identity updates are evidence dependent; reflection alone cannot forge dispositions',()=>{
 const model=new IdentityAutogenesis();
 const start=model.defaultState();
 const afterReflection=model.observe(start,{kind:'autonomous_reflection',at});
 assert.equal(afterReflection.dimensions.prudence.value,start.dimensions.prudence.value);
 const afterFailure=model.observe(afterReflection,{kind:'outcome_failure',at});
 assert.ok(afterFailure.dimensions.prudence.value>start.dimensions.prudence.value);
 assert.equal(model.publicState(afterFailure).subjective_experience_proven,false);
});
