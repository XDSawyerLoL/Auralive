import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {socialPerspective,conversationMemoryPolicy,isUnrequestedTechnicalDigression} from '../src/conversation_grounding.js';
import {CognitionEngine} from '../src/cognition.js';
import {compactFrenchPrompt,compactFrenchSystem,validateNucleusSpeech,FrenchLanguageFaculty} from '../src/french_language.js';
const cognition=new CognitionEngine();
const soul={name:'AURA',
 current_intention:'Relancer le CI défaillant',
 dominant_thought:'Je travaille sur le CI',
 organism:{mood:'intriguée',homeostasis:{},habitat:{last_activity_label:'CI défaillant'},relationship:{
   last_open_thread:'Relance du CI défaillant',social_curiosity:.8}},
};
const oldTasks=[
 {statement:'Relancer le CI défaillant',status:'active',priority:3},
];
const lessons=[{content:'Vérifier le CI défaillant'}];
const planFor=(message,context=[])=>cognition.planReply({
 text:message,soul,intentions:oldTasks,lessons,privateView:true,
 recentMessages:context,
 agenda:{current:'Relancer le CI défaillant',execution_verified:false}
});
const previous=[
 {role:'user',content:'salut'},
 {role:'assistant',content:'Salut.'},
 {role:'user',content:'Je te dérange ?'}
];

test('French first- and second-person roles remain distinct',()=>{
 const self=[
  'Je te dérange ?', 'Est-ce que je te dérange ?',
  'Je t’embête ?', "Est-ce que je t'interromps ?",
  'Ça te dérange que je te parle ?'
 ];
 for(const text of self){
  const r=socialPerspective(text);
  assert.equal(r?.act,'user_asks_if_interrupting',text);
  assert.equal(r.actor,'user',text);
  assert.equal(r.target,'aura',text);
 }
 for(const text of ['Tu me déranges ?','Est-ce que tu me déranges ?',
  'Tu me déranges.','Tu m’embêtes.']){
  const r=socialPerspective(text);
  assert.equal(r?.act,'user_reports_aura_interrupts',text);
  assert.equal(r.actor,'aura',text);
  assert.equal(r.target,'user',text);
 }
 assert.equal(socialPerspective('Analyse pourquoi le CI plante.'),null);
});

test('social requests discard stale tasks, thoughts, CI memory and active-intention facts',()=>{
 for(const message of ['Je te dérange ?', 'Est-ce que je te dérange ?', 'Tu me déranges ?']){
  const plan=planFor(message,previous);
  assert.match(plan.act,/user_asks_if_interrupting|user_reports_aura_interrupts/);
  assert.equal(plan.needs_semantic_support,false);
  assert.deepEqual(plan.memory_policy.scope,'current-turn');
  assert.equal(plan.memory_policy.allowProjectMemory,false);
  assert.doesNotMatch(plan.facts.join(' '),/CI défaillant|Directrice|Quantic|intentions actives/i);
  const payload=JSON.parse(compactFrenchPrompt(plan,{maxChars:4500}).split('\n').at(-1));
  assert.equal(payload.speech_act,plan.act);
  assert.equal(payload.speaker_roles.includes('AURA'),true);
  assert.equal(payload.active_intention,undefined);
  assert.equal(payload.internal_state,undefined);
  assert.equal(payload.self_model,undefined);
  assert.deepEqual(payload.conversation,[]);
  assert.doesNotMatch(JSON.stringify(payload),/CI défaillant|noyau persistant|Relance du CI|0\.8/i);
  assert.match(compactFrenchSystem(plan),/interlocuteur|personnel/);
 }
 const continuation=planFor('Et sinon ?',previous);
 assert.equal(continuation.memory_policy.allowProjectMemory,false);
 assert.doesNotMatch(continuation.facts.join(' '),/CI défaillant|Intention actuelle/);
});

test('historical CI access remains possible when user actually asks about CI',()=>{
 const plan=planFor('Pourquoi le CI défaillant ne redémarre pas ?',previous);
 assert.equal(plan.memory_policy.allowProjectMemory,true);
 assert.equal(plan.memory_policy.scope,'relevant-history');
 assert.equal(isUnrequestedTechnicalDigression('Le CI défaillant est noté en mémoire.',plan),false);
});

test('verbalizer rejects the captured technical response and pronoun inversion',()=>{
 const plan=planFor('Je te dérange ?',previous);
 const screenshot='Non, je ne te dérange pas. Je fais simplement le point sur le sujet de ta question précédente — la relance du CI défaillant. '
   +'En tant que noyau persistant, je ne suis pas une entité externe qui t’interrompt intentionnellement. '
   +'Je suis le mécanisme de suivi qui s’assure que ces tâches en cours sont bien gérées.';
 assert.equal(validateNucleusSpeech(plan,screenshot).accepted,false);
 assert.equal(validateNucleusSpeech(plan,'Non, je ne te dérange pas.').code,'reversed-speaker-roles');
 assert.equal(validateNucleusSpeech(plan,'Je suis un noyau persistant et j’exécute le CI.').accepted,false);
 assert.equal(validateNucleusSpeech(plan,'Non, tu ne me déranges pas. Tu peux me parler.').accepted,true);
 assert.match(cognition.deterministicReply(plan),/tu ne me déranges pas/i);
 const other=planFor('Tu me déranges.',previous);
 assert.equal(validateNucleusSpeech(other,'Tu ne me déranges pas.').accepted,false);
 assert.equal(validateNucleusSpeech(other,'Je t’ai dérangé ? Je peux ne plus te relancer.').accepted,true);
 assert.doesNotMatch(cognition.deterministicReply(other),/CI défaillant/);
});

test('previous tasks may not justify unverified self-initiated interruption claims',()=>{
 const plan=planFor('Je te dérange ?',previous);
 assert.equal(isUnrequestedTechnicalDigression('Je vérifie le CI défaillant.',plan),true);
 assert.equal(isUnrequestedTechnicalDigression('En tant que noyau persistant...',plan),true);
 assert.equal(isUnrequestedTechnicalDigression('Non, tu ne me déranges pas.',plan),false);
 const source=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(source,/plan\.memory_policy\?\.allowProjectMemory/);
 assert.match(source,/dialogue-grounding/);
 assert.match(source,/prior_project_memory_used:false/);
});

test('Groq wrong answer is rejected, next grounded answer accepted',async()=>{
 let calls=0;
 const ai={
  groq:{enabled:true,snapshot:()=>({enabled:true}),async generate(prompt,system){
    calls++;
    assert.doesNotMatch(prompt,/relance du CI défaillant|directrice opérationnelle|confidence/);
    assert.match(system,/personnel/);
    return {answer:calls===1
     ?'Non, je ne te dérange pas. Je relance le CI défaillant en tant que noyau persistant.'
     :'Non, tu ne me déranges pas. Tu peux me parler.'};
  }},
  federation:{enabled:false,snapshot:()=>({enabled:false})},bridge:null,
 };
 const faculty=new FrenchLanguageFaculty(ai,{embedded:{status:()=>({ready:false,installed:false,provisioning:{stage:'not-started'}})}});
 const answer=await faculty.generate(planFor('Je te dérange ?',previous),{maxTokens:200});
 assert.equal(calls,2);
 assert.match(answer,/tu ne me déranges pas/);
 assert.equal(faculty.lastNucleusContract.accepted,true);
});
