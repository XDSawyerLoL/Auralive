import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {InnerDialogueEngine} from '../src/inner_dialogue.js';
import {IndependentContinuity} from '../src/independent_continuity.js';
import {LivedExperience} from '../src/lived_experience.js';
import {SelfInquiryEngine} from '../src/self_inquiry.js';

const AT='2026-11-12T15:00:00.000Z';
const MS=Date.parse(AT);
const dialogue=new InnerDialogueEngine();
const lived=new LivedExperience();
const inquiry=new SelfInquiryEngine();
const organism={
  frustration:.58,clarte:.75,curiosite:.7,agency:.7,
  homeostasis:{resource_pressure:0,seed:12,success_ema:.2,failure_ema:.1},
};
const identity={dimensions:{prudence:{value:.67,evidence:4}}};
function experienceWithCorrections(count=2){
  let state=lived.defaultState();
  for(let n=0;n<count;n++)state=lived.observe(state,{
    context:'dialogue_general',strategy:'respond',result:'failure',
    source:'founder-correction',privateFounder:true,at:AT,
  });
  return state;
}
function makeSoul(experience){
  return {seed:'test-seed',organism,emergent_identity:identity,
    lived_experience:experience,epistemic_self:inquiry.defaultState(),
    independent_activity:null,endophasia:null};
}
function deps(){
  const queries=[];
  const db={execute:async sql=>{
    queries.push(sql);
    if(sql.includes('aura_cloud_messages'))return [[{id:2}]];
    throw new Error('unexpected test query');
  }};
  const history={verifyChain:async()=>({verified:true,checked:2})};
  return {queries,db,history};
}

test('no scripted inner question at genesis or from one unverified correction',()=>{
  assert.equal(dialogue.derivePrivateInquiry({
    experience:lived.defaultState(),identity,organism,now:AT}),null);
  assert.equal(dialogue.derivePrivateInquiry({
    experience:experienceWithCorrections(1),identity,organism,now:AT}),null);
});

test('a repeated social failure yields a bounded, private and contextual question',()=>{
  const experience=experienceWithCorrections();
  const observation=dialogue.derivePrivateInquiry({
    experience,identity,organism,now:AT});
  assert.equal(observation.origin,'experience-derived-private-question');
  assert.equal(observation.context,'dialogue_general');
  assert.equal(observation.experience_revision,2);
  assert.match(observation.question,/dialogue_general/);
  assert.equal(observation.evidence.reported_failures,1.3);
  assert.equal(observation.evidence.verified_outcomes,0);
  assert.equal(observation.subjective_experience_proven,false);
  const exposed=dialogue.publicInquiry({...observation,
    question:'PRIVATE USER SECRET',outcome:'supported',causal_change:true});
  assert.doesNotMatch(JSON.stringify(exposed),/PRIVATE USER SECRET/);
  assert.equal(exposed.proof_scope,'local-policy-counterfactual-not-external-success');
});

test('endophasia triggers a real local ablation, stored without claiming world success',async()=>{
  const soul=makeSoul(experienceWithCorrections());
  const {db,history,queries}=deps();
  const cycle=new IndependentContinuity({db,history,selfInquiry:inquiry,
    innerDialogue:dialogue,livedExperience:lived,clock:()=>MS});
  const output=await cycle.step({soul});
  assert.equal(output.executed,true);
  assert.equal(output.reason,'experience-derived-private-inquiry');
  assert.equal(output.receipt.probe,'context_policy_ablation');
  assert.equal(output.receipt.outcome,'supported');
  assert.equal(output.receipt.context,'dialogue_general');
  assert.equal(output.receipt.baseline_action,'respond');
  assert.equal(output.receipt.observed_action,'clarify');
  assert.equal(output.receipt.causal_change,true);
  assert.equal(output.receipt.external_action,false);
  assert.equal(output.receipt.external_success_verified,false);
  assert.equal(output.soul.endophasia.causal_change,true);
  assert.equal(output.soul.epistemic_self.revision,0);
  assert.deepEqual(queries,[]);
  const persisted=JSON.parse(JSON.stringify(output.soul));
  assert.equal(persisted.endophasia.experience_revision,2);
  assert.equal(persisted.independent_activity.last_receipt.causal_change,true);
});

test('new revision required: an idle cycle does not repeat a fictitious discovery',async()=>{
  let clock=MS;
  const {db,history,queries}=deps();
  const cycle=new IndependentContinuity({db,history,selfInquiry:inquiry,
    innerDialogue:dialogue,livedExperience:lived,clock:()=>clock});
  const first=await cycle.step({soul:makeSoul(experienceWithCorrections())});
  assert.equal((await cycle.step({soul:first.soul})).reason,'not-due');
  clock+=3600_001;
  const later=await cycle.step({soul:first.soul});
  assert.equal(later.receipt.probe,'conversation_retrieval');
  assert.equal(later.receipt.outcome,'supported');
  assert.equal(later.soul.endophasia.experience_revision,2);
  assert.equal(queries.length,1);
});

test('new experience creates a distinct inquiry; deletion of evidence removes its cause',async()=>{
  const {db,history}=deps();
  const cycle=new IndependentContinuity({db,history,selfInquiry:inquiry,
    innerDialogue:dialogue,livedExperience:lived,clock:()=>MS});
  const initial=makeSoul(experienceWithCorrections());
  const first=await cycle.step({soul:initial});
  const increased=lived.observe(initial.lived_experience,{
    context:'task_technical',strategy:'respond',result:'failure',
    source:'machine-verified',privateFounder:true,at:AT});
  const secondEvidence=lived.observe(increased,{
    context:'task_technical',strategy:'respond',result:'failure',
    source:'machine-verified',privateFounder:true,at:AT});
  const newQuestion=dialogue.derivePrivateInquiry({experience:secondEvidence,
    organism,identity,previous:first.soul.endophasia,now:AT});
  assert.ok(newQuestion);
  assert.equal(newQuestion.experience_revision,4);
  const removed=dialogue.derivePrivateInquiry({
    experience:lived.defaultState(),organism,identity,now:AT});
  assert.equal(removed,null);
});

test('resource pressure blocks costly private inquiry; never manufactures proof',async()=>{
  const full=makeSoul(experienceWithCorrections());
  full.organism={...organism,homeostasis:{sensor:{
    source:'node-process',sampled_at:AT,compute_pressure:.96,
  }}};
  const {db,history,queries}=deps();
  const cycle=new IndependentContinuity({db,history,selfInquiry:inquiry,
    innerDialogue:dialogue,livedExperience:lived,clock:()=>MS});
  const result=await cycle.step({soul:full});
  assert.equal(result.executed,false);
  assert.equal(result.reason,'resource-pressure');
  assert.equal(queries.length,0);
  assert.equal(result.soul.endophasia,null);
});

test('canonical kernel stores the inquiry and public graph exposes only safe evidence',()=>{
  const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
  const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(kernel,/innerDialogue:this\.innerDialogue,livedExperience:this\.livedExperience/);
  assert.match(kernel,/this\.soulCache\.endophasia=independent\.soul\.endophasia/);
  assert.match(kernel,/await this\.trace\('endophasia','experience-derived-inquiry'/);
  assert.match(server,/endophasia: bootstrap\.runtimeReady/);
  assert.match(server,/publicInquiry\(kernel\.soulCache\?\.endophasia\)/);
});
