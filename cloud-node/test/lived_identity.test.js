import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CognitionEngine} from '../src/cognition.js';
import {requiresExternalKnowledge} from '../src/kernel.js';
import {InnerDialogueEngine} from '../src/inner_dialogue.js';
import {IdentityAutogenesis} from '../src/identity_autogenesis.js';
import {LivedExperience,contextForExperience,isExplicitCorrection,isExplicitApproval} from '../src/lived_experience.js';
import {substantiveRequest} from '../src/composite_intent.js';

const learner=new LivedExperience();
const time='2026-11-09T01:00:00.000Z';
const organism={stabilite:.76,clarte:.75,confiance:.73,frustration:.1,
 agency:.7,curiosite:.65,curiosite_sociale:.65,
 homeostasis:{resource_pressure:.12,seed:270,success_ema:.15,failure_ema:.03}};

test('greetings or negated courtesies never consume a substantive technical task',()=>{
 const engine=new CognitionEngine();
 const soul={name:'AURA',organism,current_intention:'analyse'};
 const requests=[
  'Analyse pourquoi mon serveur plante.',
  'Bonjour, analyse pourquoi mon serveur plante.',
  'Ne me réponds pas juste bonjour : analyse pourquoi mon serveur plante.',
  'Salut, vérifie pourquoi mon site a une erreur.',
 ];
 for(const text of requests){
  assert.equal(substantiveRequest(text),true,text);
  const plan=engine.planReply({text,soul});
  assert.equal(plan.act,'analyze_substantive_request',text);
  assert.equal(plan.needs_semantic_support,true,text);
  assert.equal(plan.semantic_query,text);
 }
 assert.equal(engine.planReply({text:'Bonjour !',soul}).act,'greet');
 assert.equal(substantiveRequest('Bonjour !'),false);
 assert.equal(requiresExternalKnowledge('Bonjour, cherche sur le web la documentation API'),true);
 assert.equal(requiresExternalKnowledge('Bonjour, comment vas-tu ?'),false);
});

test('two authentic founder corrections make a persistent context-specific policy',()=>{
 let state=learner.defaultState();
 const example='Bonjour, analyse pourquoi mon serveur plante';
 const context=contextForExperience(example,{act:'greet'});
 assert.equal(context,'task_with_greeting');
 assert.equal(learner.select(state,context).strategy,'respond');
 for(let i=0;i<2;i++){
  state=learner.createPending(state,{text:example,plan:{act:'greet'},privateFounder:true,at:time});
  state=learner.observeFounderCorrection(state,{at:time});
 }
 const saved=JSON.parse(JSON.stringify(state));
 const restored=learner.migrate(saved);
 const recommendation=learner.select(restored,context);
 assert.equal(recommendation.changed,true);
 assert.equal(recommendation.strategy,'task_first');
 assert.equal(recommendation.basis,'contextual-feedback');
 assert.equal(recommendation.independently_verified,false);
 assert.equal(learner.select(restored,'dialogue_ambivalent').changed,false,
  'technical feedback must not make AURA more compliant in unrelated conversations');
 assert.equal(contextForExperience('Salut, diagnostique pourquoi mon site bug'),context);
});

test('history is revisable after later counterexamples, not a permanent founder command',()=>{
 let state=learner.defaultState();
 const text='Bonjour, analyse pourquoi mon serveur plante';
 const context=contextForExperience(text);
 for(let i=0;i<2;i++){
  state=learner.createPending(state,{text,plan:{act:'greet'},privateFounder:true,at:time});
  state=learner.observeFounderCorrection(state,{at:time});
 }
 assert.equal(learner.select(state,context).strategy,'task_first');
 for(let i=0;i<4;i++){
  state=learner.createPending(state,{text,plan:{learned_strategy:'task_first'},privateFounder:true,at:time});
  state=learner.observeFounderApproval(state,{at:time});
 }
 assert.equal(learner.select(state,context).strategy,'task_first');
 for(let i=0;i<12;i++){
  state=learner.createPending(state,{text,plan:{learned_strategy:'task_first'},privateFounder:true,at:time});
  state=learner.observeFounderCorrection(state,{at:time});
 }
 assert.equal(learner.select(state,context).changed,false,
  'contradictory experience should suspend a previously learned policy');
});

test('founder feedback is not independent proof or a public identity mutation',()=>{
 const text='Bonjour, analyse pourquoi mon serveur plante';
 let state=learner.defaultState();
 const publicPending=learner.createPending(state,{text,privateFounder:false});
 assert.equal(publicPending.pending,null);
 assert.equal(learner.observeFounderCorrection(publicPending).observations,0);
 state=learner.observe(state,{context:'task_with_greeting',
  strategy:'respond',result:'failure',source:'machine-verified',privateFounder:false});
 assert.equal(state.observations,0);
 assert.equal(isExplicitCorrection("C'est pas ce que j'ai dit."),true);
 assert.equal(isExplicitApproval('Tu as raison, merci !'),true);
 assert.equal(isExplicitApproval("Tu n'as pas compris."),false);
 state=learner.createPending(state,{text,plan:{},privateFounder:true,at:time});
 state=learner.observeFounderCorrection(state,{at:time});
 const publicView=learner.publicState(state);
 assert.equal(publicView.observations,1);
 assert.equal(publicView.pattern_count,1);
 assert.equal(publicView.recent_evidence,undefined);
 assert.equal(publicView.patterns,undefined);
 const privateView=learner.publicState(state,{includeEvidence:true});
 assert.equal(privateView.recent_evidence[0].source,'founder-correction');
 assert.equal(privateView.patterns[0].independently_verified,0);
 assert.doesNotMatch(JSON.stringify(privateView),/serveur plante|PRIVATE_PASSWORD/);
 assert.equal(privateView.subjective_experience_proven,false);
});

test('two histories of acquired tendencies produce different real arbitration choices',()=>{
 const identity=new IdentityAutogenesis(),engine=new InnerDialogueEngine();
 let cautious=identity.defaultState(),fast=identity.defaultState();
 for(let i=0;i<22;i++)cautious=identity.observe(cautious,{kind:'outcome_failure',at:time});
 for(let i=0;i<26;i++)fast=identity.observe(fast,{kind:'outcome_success',at:time});
 const input={organism,message:'Quelle méthode choisirais-tu ?',now:time};
 const a=engine.deliberate({...input,identity:cautious});
 const b=engine.deliberate({...input,identity:fast});
 assert.equal(a.selected_action,'verify');
 assert.equal(b.selected_action,'respond');
 assert.ok(a.competition.caution>b.competition.caution);
 assert.ok(b.competition.initiative>a.competition.initiative);
 assert.ok(a.learned_effect.prudence>0);
 assert.ok(b.learned_effect.initiative>0);
 assert.equal(a.conscious_experience_claim,false);
});

test('40 self-reported reflections do not prove self-observation improved',()=>{
 const engine=new IdentityAutogenesis();let state=engine.defaultState();
 for(let i=0;i<40;i++)state=engine.observe(state,{kind:'autonomous_reflection',at:time});
 assert.equal(state.counters.autonomous_reflections,40);
 assert.equal(state.dimensions.auto_examen.value,.5);
 assert.equal(state.dimensions.auto_examen.evidence,0);
 assert.equal(engine.publicState(state).learned_dimensions.auto_examen.status,'insufficient-evidence');
});

test('legacy inflated autobiography is corrected without destroying history',()=>{
 const learner=new IdentityAutogenesis();
 const old={
  ...learner.defaultState(),version:'aura-emergent-identity-v1',
  observations:40,revision:40,
  dimensions:{
   prudence:{value:.63,evidence:5},initiative:{value:.57,evidence:6},
   auto_examen:{value:.92,evidence:40},adaptation:{value:.90,evidence:30},
  },
  counters:{outcome_success:7,outcome_failure:4,corrections_received:30,
   autonomous_reflections:40,inquiries_requested:0},
 };
 const migrated=learner.migrate(old);
 assert.equal(migrated.version,'aura-emergent-identity-v2');
 assert.equal(migrated.dimensions.auto_examen.value,.5);
 assert.equal(migrated.dimensions.auto_examen.evidence,0);
 assert.equal(migrated.dimensions.adaptation.value,.5);
 assert.equal(migrated.dimensions.adaptation.evidence,0);
 assert.equal(migrated.dimensions.prudence.value,.63);
 assert.equal(migrated.observations,40);
 assert.equal(migrated.counters.autonomous_reflections,40);
});

test('contextual corrections can require clarification, changing actual language tone',()=>{
 let learned=learner.defaultState();
 for(let i=0;i<2;i++){
  learned=learner.observe(learned,{context:'dialogue_general',strategy:'respond',
   source:'founder-correction',privateFounder:true,result:'failure',at:time});
 }
 const advice=learner.select(learned,'dialogue_general');
 assert.equal(advice.changed,true);
 assert.equal(advice.strategy,'clarify');
 const engine=new InnerDialogueEngine();
 const plan={act:'respond',learned_strategy:advice.strategy,
  experience_guidance:{changed_by_history:true}};
 const after=engine.deliberate({organism,message:'Quelle direction prendre ?',plan,now:time});
 assert.equal(after.selected_action,'clarify');
 assert.equal(after.tone,'attentive');
 const before=engine.deliberate({organism,message:'Quelle direction prendre ?',plan:{act:'respond'},now:time});
 assert.notEqual(after.selected_action,before.selected_action);
});

test('the cockpit can inspect only authenticated contextual evidence',()=>{
 const html=readFileSync(new URL('../src/brain_operations_console.js',import.meta.url),'utf8');
 const runtime=readFileSync(new URL('../src/brain_operations_runtime.js',import.meta.url),'utf8');
 assert.match(html,/id="livedHistoryDetails"/);
 assert.match(html,/id="livedHistoryList"/);
 assert.match(runtime,/fetch\('\/api\/brain\/experience'/);
 assert.match(runtime,/credentials:'same-origin'/);
 assert.match(runtime,/res\.status===401\|\|res\.status===403/);
});

test('kernel learns only from a previous actual founder episode and exposes an owner-only audit',()=>{
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(kernel,/this\.livedExperience\.createPending/);
 assert.match(kernel,/if\(privateView&&answer\)/);
 assert.match(kernel,/this\.livedExperience\.observeFounderCorrection/);
 assert.match(kernel,/this\.livedExperience\.observeFounderApproval/);
 assert.match(kernel,/plan\.experience_guidance/);
 assert.match(kernel,/plan\.needs_semantic_support=true/);
 const route=server.slice(server.indexOf("app.get('/api/brain/experience'"),
  server.indexOf("app.get('/api/kernel/soul'"));
 assert.match(route,/requirePrivate\(request, reply\)/);
 assert.match(route,/includeEvidence:true/);
 assert.match(server,/lived_identity: bootstrap\.runtimeReady/);
});
