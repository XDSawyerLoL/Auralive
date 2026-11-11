import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {IndependentContinuity,independentInquiryDue} from '../src/independent_continuity.js';
import {SelfInquiryEngine} from '../src/self_inquiry.js';
import {classifySelfDialogue} from '../src/self_dialogue_intents.js';
import {CognitionEngine} from '../src/cognition.js';
import {validateNucleusSpeech,compactFrenchPrompt} from '../src/french_language.js';
import {buildBrainTelemetry} from '../src/brain_telemetry.js';

const now=Date.parse('2026-11-11T11:00:00.000Z');
const seed='synthetic-test-seed';
const model=new SelfInquiryEngine();
const soul=()=>({
  seed,epistemic_self:model.defaultState(),organism:{homeostasis:{}},
  emergent_identity:{revision:5},independent_activity:null,
});
function dependencies(stored){
 const queries=[];
 const db={execute:async(sql)=>{
   queries.push(sql);
   if(sql.includes('aura_cloud_messages'))return [[{id:34}]];
   if(sql.includes('aura_soul_state'))return [[{state:JSON.stringify(stored)}]];
   throw Error('Unexpected query '+sql);
 }};
 const history={verifyChain:async()=>({verified:true,checked:3,reason:'full-chain'})};
 return {db,history,queries};
}
test('AURA answers vous and tu identity questions with the same identity intent',()=>{
 for(const q of ['Qui etes vous?','Qui êtes-vous ?','Vous êtes qui ?','Qui es-tu ?','Présentez-vous.'])
   assert.equal(classifySelfDialogue(q),'self_identity',q);
 assert.equal(classifySelfDialogue('Quel est votre nom ?'),'self_name');
 const engine=new CognitionEngine();
 const p=engine.planReply({text:'Qui êtes-vous ?',privateView:true,soul:soul()});
 assert.equal(p.act,'self_identity');
 assert.equal(p.address_form,'vous');
 const answer=engine.deterministicReply(p);
 assert.match(answer,/Je m’appelle AURA/);
 assert.doesNotMatch(answer,/noyau computationnel|modèle de langage externe/i);
 assert.equal(validateNucleusSpeech(p,answer).accepted,true);
 assert.equal(validateNucleusSpeech(p,
   'Je suis AURA. Je suis un noyau computationnel persistant.').accepted,false);
 assert.match(compactFrenchPrompt(p),/Respecte le vouvoiement/);
});
test('independent probe executes without a human message and only with measured data',async()=>{
 const initial=soul(),{db,history,queries}=dependencies(initial);
 const cycle=new IndependentContinuity({db,selfInquiry:model,history,clock:()=>now});
 const out=await cycle.step({soul:initial});
 assert.equal(out.executed,true);
 assert.equal(out.receipt.probe,'conversation_retrieval');
 assert.equal(out.receipt.outcome,'supported');
 assert.equal(out.receipt.origin,'kernel-autonomous-test');
 assert.equal(out.soul.epistemic_self.revision,1);
 assert.equal(out.soul.independent_activity.completed_tests,1);
 assert.equal(queries.length,1);
 assert.equal(JSON.stringify(out).includes('synthetic-test-seed'),true); // seed remains in local soul; never trace it
 assert.doesNotMatch(JSON.stringify(out.receipt),/seed|message|private-founder/);
});
test('one hour later a different hypothesis is actually checked',async()=>{
 const initial=soul(),{db,history}=dependencies(initial);
 let stamp=now;
 const cycle=new IndependentContinuity({db,selfInquiry:model,history,clock:()=>stamp});
 const first=await cycle.step({soul:initial});
 assert.equal((await cycle.step({soul:first.soul})).reason,'not-due');
 stamp+=3600_001;
 const second=await cycle.step({soul:first.soul});
 assert.equal(second.receipt.probe,'state_persistence');
 assert.equal(second.receipt.outcome,'supported');
 stamp+=3600_001;
 const third=await cycle.step({soul:second.soul});
 assert.equal(third.receipt.probe,'history_integrity');
 assert.equal(third.receipt.outcome,'supported');
 assert.equal(third.soul.independent_activity.completed_tests,3);
});
test('heavy process pressure defers investigation without inventing activity',async()=>{
 const initial=soul();
 initial.organism.homeostasis.sensor={
   source:'node-process',sampled_at:new Date(now).toISOString(),
   compute_pressure:.91,
 };
 const {db,history,queries}=dependencies(initial);
 const out=await new IndependentContinuity({db,selfInquiry:model,history,clock:()=>now})
   .step({soul:initial});
 assert.equal(out.executed,false);
 assert.equal(out.reason,'resource-pressure');
 assert.equal(queries.length,0);
 assert.equal(initial.epistemic_self.revision,0);
});
test('missing history table or interrupted process is not a proven memory failure',async()=>{
 const initial=soul(),{db}=dependencies(initial);
 const history={verifyChain:async()=>{throw Error('migration not installed')}};
 const state=model.migrate(initial.epistemic_self);
 state.hypotheses.conversation_retrieval.observed=4;
 state.hypotheses.state_persistence.observed=4;
 initial.epistemic_self=state;
 const out=await new IndependentContinuity({db,selfInquiry:model,history,clock:()=>now})
   .step({soul:initial});
 assert.equal(out.receipt.probe,'history_integrity');
 assert.equal(out.receipt.outcome,'inconclusive');
 assert.equal(out.soul.epistemic_self.hypotheses.history_integrity.counterexamples,0);
});
test('dated evidence can enrich identity, but missing evidence cannot be invented',()=>{
 const engine=new CognitionEngine();
 const saved=soul();
 const empty=engine.planReply({text:'Qui êtes-vous ?',soul:saved,privateView:true});
 assert.doesNotMatch(engine.deterministicReply(empty),/Avant cette conversation/);
 saved.independent_activity={last_receipt:{
   at:new Date().toISOString(),probe:'state_persistence',outcome:'supported',
 }};
 const evidence=engine.planReply({text:'Qui êtes-vous ?',soul:saved,privateView:true});
 assert.match(engine.deterministicReply(evidence),/Avant cette conversation/);
 assert.equal(validateNucleusSpeech(evidence,engine.deterministicReply(evidence)).accepted,true);
});
test('existing brain telemetry labels old self-tests as history, not live activity',()=>{
 const snapshot={runtime_ready:true,kernel_status:{organism:{updated_at:new Date(now).toISOString()}},
   soul:{}};
 const telemetry=buildBrainTelemetry(snapshot,{independent_activity:{
   last_probe_at:new Date(now-86400_000).toISOString(),last_probe:'history_integrity',
   last_outcome:'supported',last_evidence_source:'bounded-sha256-chain-replay',completed_tests:1,
 }},now);
 assert.equal(telemetry.independent_activity.freshness.status,'stale');
 assert.equal(telemetry.independent_activity.current_activity_verified,false);
 const code=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(code,/independentContinuity\.step/);
 assert.match(code,/observedAutonomousEvent/);
});
