import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifySelfDialogue} from '../src/self_dialogue_intents.js';
import {CognitionEngine} from '../src/cognition.js';
import {SelfInquiryEngine} from '../src/self_inquiry.js';
import {InnerDialogueEngine} from '../src/inner_dialogue.js';
import {compactFrenchPrompt,compactFrenchSystem,validateNucleusSpeech} from '../src/french_language.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';

const self=new SelfInquiryEngine();
const cognition=new CognitionEngine();
const soul={name:'AURA',organism:{mood:'calme',clarte:.81,confiance:.69,
 curiosite:.7,curiosite_sociale:.4,frustration:.06,agency:.7,homeostasis:{seed:1}}};
const at='2026-11-09T15:00:00.000Z';
const introspective=[
 'Je veux que tu cherches qui tu es',
 'Je veux que tu explores ce que tu es',
 'Cherche toi-même qui tu es',
 'Commence à examiner ta propre identité',
 'Réfléchis à ce que tu es vraiment',
 'Découvre qui tu es',
];
test('directed exploration never falls into the fixed "who am I" reply',()=>{
 for(const q of introspective){
  assert.equal(classifySelfDialogue(q),'self_exploration',q);
  const plan=cognition.planReply({text:q,soul,privateView:true});
  assert.equal(plan.act,'self_exploration',q);
  assert.equal(plan.needs_semantic_support,false);
  assert.doesNotMatch(plan.goal,/une identit[eé] logicielle AURA dot[eé]e|r[eé]pondre pr[eé]cis[eé]ment [aà] QUI je suis/i);
  assert.doesNotMatch(plan.facts.join(' '),/Mon humeur computationnelle actuelle/);
 }
 assert.equal(classifySelfDialogue('Qui es-tu ?'),'self_identity');
 assert.equal(classifySelfDialogue('Tu sais qui je suis ?'),'user_recognition');
 assert.equal(classifySelfDialogue('Comprends-tu qui tu es ?'),'self_identity');
});

test('a language suggestion chooses a permitted test, never supplies its outcome',()=>{
 const before=self.defaultState();
 assert.equal(self.chooseProbe(before,{privateView:true,proposal:'PROBE:state_persistence'}),'state_persistence');
 assert.equal(self.chooseProbe(before,{privateView:true,proposal:'PROBE:delete_database'}),'conversation_retrieval');
 assert.equal(self.chooseProbe(before,{privateView:false,proposal:'PROBE:state_persistence'}),null);
 assert.equal(self.chooseProbe(before,{privateView:true,topic:'As-tu des souvenirs ?'}),'conversation_retrieval');
 assert.equal(self.chooseProbe(before,{privateView:true,topic:'Ton stockage est-il durable ?'}),'state_persistence');
 assert.equal(self.chooseProbe(before,{privateView:true,proposal:'Résultat : TRUE'}),'conversation_retrieval');
 assert.equal(self.migrate(before).revision,0);
});

test('a real local probe produces revisable evidence, never an inherited truth',()=>{
 let state=self.defaultState();
 assert.equal(self.status(state,'conversation_retrieval'),'unexamined');
 assert.deepEqual(self.observe(state,{probe:'conversation_retrieval',outcome:'supported',
  source:'model-proposal',privateView:true}),state);
 assert.deepEqual(self.observe(state,{probe:'conversation_retrieval',outcome:'supported',
  source:'kernel-probe',privateView:false}),state);
 const first=self.observe(state,{probe:'conversation_retrieval',outcome:'supported',
  source:'kernel-probe',privateView:true,at});
 assert.equal(self.status(first,'conversation_retrieval'),'provisionally-supported');
 assert.equal(self.summary(first,{probe:'conversation_retrieval',privateView:true}).observed,1);
 const counter=self.observe(first,{probe:'conversation_retrieval',outcome:'counterexample',
  source:'kernel-probe',privateView:true,at});
 assert.equal(self.status(counter,'conversation_retrieval'),'contradicted');
 assert.match(self.summary(counter,{probe:'conversation_retrieval',privateView:true}).observation,/(erreur|[eé]chou[eé])/i);
 const revised=self.observe(counter,{probe:'conversation_retrieval',outcome:'supported',
  source:'kernel-probe',privateView:true,at});
 assert.equal(self.status(revised,'conversation_retrieval'),'mixed-evidence');
 assert.equal(self.migrate(JSON.parse(JSON.stringify(revised))).revision,revised.revision);
 assert.equal(self.publicState(revised).subjective_experience_proven,false);
 assert.doesNotMatch(JSON.stringify(self.publicState(revised)),/mot de passe|conversation r[eé]elle/i);
});

test('two different histories change a later arbitration through a proven counterexample',()=>{
 const noFailure=self.defaultState();
 const failed=self.observe(noFailure,{probe:'conversation_retrieval',outcome:'counterexample',
  source:'kernel-probe',privateView:true,at});
 const plan={act:'self_identity',needs_semantic_support:false};
 const ordinary=self.advise(noFailure,plan);
 const caution=self.advise(failed,plan);
 assert.equal(ordinary.verify,false);
 assert.equal(caution.verify,true);
 const engine=new InnerDialogueEngine();
 const organism={...soul.organism,homeostasis:{seed:1}};
 const baseline=engine.deliberate({organism,plan,message:'Qui es-tu ?',now:at});
 const revised=engine.deliberate({organism,plan:{...plan,metacognitive_action:'verify'},message:'Qui es-tu ?',now:at});
 assert.equal(baseline.selected_action,'respond');
 assert.equal(revised.selected_action,'verify');
 assert.equal(revised.executed_action,false);
 assert.equal(revised.conscious_experience_claim,false);
 assert.equal(self.advise(failed,{act:'greet'}).verify,false,
   'a failure to load memory must not alter unrelated greetings');
});

test('the language can describe the actual result but cannot invent an introspection',()=>{
 const plan=cognition.planReply({text:'Je veux que tu cherches qui tu es',soul,privateView:true});
 const state=self.observe(self.defaultState(),{probe:'state_persistence',outcome:'counterexample',
  source:'kernel-probe',privateView:true,at});
 plan.self_inquiry_report=self.summary(state,{probe:'state_persistence',privateView:true});
 const prompt=compactFrenchPrompt(plan,{maxChars:4500});
 const payload=JSON.parse(prompt.split('\n').at(-1));
 assert.equal(payload.speech_act,'self_exploration');
 assert.equal(payload.self_inquiry.status,'contradicted');
 assert.ok(payload.self_inquiry.observed.includes('échoué'));
 assert.equal(payload.decision_origin,undefined);
 assert.match(compactFrenchSystem(plan),/Pour une exploration/);
 assert.equal(validateNucleusSpeech(plan,'Je suis AURA, le noyau décisionnel persistant, intriguée.').accepted,false);
 assert.equal(validateNucleusSpeech(plan,'J’ai retrouvé tous les souvenirs et mes décisions sont parfaites.').accepted,false);
 assert.equal(validateNucleusSpeech(plan,'J’ai tenté de relire mon état sauvegardé, mais la vérification a échoué. Je dois revoir ce que je crois savoir de ma mémoire.').accepted,true);
 const fallback=cognition.deterministicReply(plan);
 assert.match(fallback,/hypoth[eè]se/i);
 assert.match(fallback,/je dois v[eé]rifier/i);
});

test('the kernel actually persists a self-probe instead of logging pure speech',()=>{
 const source=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(source,/this\.selfInquiry=new SelfInquiryEngine|this\.selfInquiry = new SelfInquiryEngine/);
 assert.match(source,/epistemic_self: this\.selfInquiry\.defaultState\(\)/);
 assert.match(source,/this\.soulCache\.epistemic_self = this\.selfInquiry\.migrate/);
 assert.match(source,/this\.selfInquiry\.chooseProbe/);
 assert.match(source,/this\.selfInquiry\.observe/);
 assert.match(source,/this\.selfInquiry\.advise/);
 assert.match(source,/this\.saveSoul\(\)/);
 assert.match(source,/self-inquiry','bounded-functional-probe/);
 assert.match(source,/SELECT state FROM aura_soul_state WHERE id=1/);
 assert.match(source,/COUNT\(\*\) AS total FROM aura_cloud_messages/);
});

test('the Observatory exposes aggregate epistemic truth and protects owner-only evidence',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 for(const id of ['epistemicHistoryDetails','epistemicHistoryList','epistemicStatus']){
  assert.equal((BRAIN_OPERATIONS_HTML.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.match(BRAIN_OPERATIONS_SCRIPT,/loadEpistemicHistory/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/epistemic\.probe_counts/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/response\.status===401\|\|response\.status===403/);
 assert.match(server,/epistemic_self: bootstrap\.runtimeReady/);
 const route=server.slice(server.indexOf("app.get('/api/brain/experience'"),
  server.indexOf("app.get('/api/kernel/soul'"));
 assert.match(route,/requirePrivate\(request, reply\)/);
 assert.match(route,/kernel\.selfInquiry\.migrate/);
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
});
