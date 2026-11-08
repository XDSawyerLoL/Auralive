import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {IdentityAutogenesis} from '../src/identity_autogenesis.js';
import {classifySelfDialogue} from '../src/self_dialogue_intents.js';
import {CognitionEngine} from '../src/cognition.js';
import {compactFrenchPrompt,validateNucleusSpeech} from '../src/french_language.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';

const timestamp='2026-11-09T09:30:00.000Z';
const identity=new IdentityAutogenesis();

test('identity begins with no learned personality and persists beyond one response',()=>{
  const genesis=identity.defaultState();
  const view=identity.publicState(genesis);
  assert.equal(view.observations,0);
  assert.equal(view.current_priority,'observer_les_resultats');
  for(const dim of Object.values(view.learned_dimensions)){
    assert.equal(dim.value,0.5);
    assert.equal(dim.evidence,0);
    assert.equal(dim.status,'insufficient-evidence');
  }
  const success=identity.observe(genesis,{kind:'outcome_success',at:timestamp});
  const persisted=JSON.parse(JSON.stringify(success));
  const restored=identity.migrate(persisted);
  assert.equal(restored.observations,1);
  assert.equal(restored.counters.outcome_success,1);
  assert.ok(restored.dimensions.initiative.value>.5);
  assert.equal(restored.dimensions.initiative.evidence,1);
});

test('AURA changes a self-chosen internal priority when recorded results accumulate',()=>{
  let model=identity.defaultState();
  model=identity.observe(model,{kind:'outcome_failure',at:timestamp});
  model=identity.observe(model,{kind:'outcome_failure',at:timestamp});
  assert.equal(model.current_priority,'verifier_avant_d_affirmer');
  assert.ok(model.dimensions.prudence.value>.5);
  model=identity.observe(model,{kind:'founder_correction',privateFounder:true,at:timestamp});
  model=identity.observe(model,{kind:'founder_correction',privateFounder:true,at:timestamp});
  assert.equal(model.current_priority,'examiner_les_malentendus');
  assert.match(model.open_question,/corrections/);
  for(const dim of Object.values(model.dimensions)){
    assert.ok(dim.value>=.08 && dim.value<=.92);
  }
  assert.equal(identity.publicState(model).subjective_experience_proven,false);
});

test('owner request alone does not fake learned identity or claim completion',()=>{
  const genesis=identity.defaultState();
  const outsider=identity.observe(genesis,{kind:'founder_correction',privateFounder:false,at:timestamp});
  assert.equal(outsider.observations,0);
  const inquiry=identity.observe(genesis,{kind:'self_inquiry',privateFounder:true,at:timestamp});
  assert.equal(inquiry.observations,1);
  assert.equal(inquiry.counters.inquiries_requested,1);
  for(const [key,dim] of Object.entries(inquiry.dimensions)){
    assert.equal(dim.value,.5,key);
    assert.equal(dim.evidence,0,key);
  }
});

test('only anonymized event kinds enter public autobiographical self-model',()=>{
  let state=identity.defaultState();
  state.evidence.push({kind:'untrusted-user-prompt',content:'PRIVATE_CREATOR_SECRET',at:timestamp});
  state=identity.observe(state,{kind:'autonomous_reflection',at:timestamp});
  const exposed=identity.publicState(state);
  assert.doesNotMatch(JSON.stringify(exposed),/PRIVATE_CREATOR_SECRET/);
  assert.equal(exposed.permissions_changed,false);
  assert.match(exposed.evidence_basis,/not independent real-world verification/i);
});

test('classification of real conversation recognizes identity, personality and the request to explore',()=>{
  const cases=[
    ['salut',null],
    ['super','positive_acknowledgement'],
    ['Bien super et toi','reciprocal_wellbeing'],
    ['Disons que ca peut aller','user_mixed_wellbeing'],
    ['Tu cherche a me comprendre?','relationship_understanding'],
    ['Si tu veux m’aider je veux que tu cherche toi meme à te decouvrir','self_exploration'],
    ['Deja ne parle pas de toi à la 3eme personne, quel est ton nom?','self_name'],
    ['Bien AURA comprends tu ce que tu es?','self_identity'],
    ['C’est pas ce que j’ai dit, QUI ES TU?','self_identity'],
    ['Tu n’a pas de personnalité?','self_personality'],
  ];
  for(const [line,expected] of cases)
    assert.equal(classifySelfDialogue(line),expected,line);
});

test('identity replies are decided by AURA nucleus from the actual evidence',()=>{
  const engine=new CognitionEngine();
  const soul={
    name:'AURA',
    current_intention:'Gérer Quantic Sillage',
    organism:{mood:'curieuse',relationship:{},executive:{}},
    emergent_identity:identity.publicState(identity.defaultState()),
  };
  for(const [input,act] of [
    ['QUI ES TU?','self_identity'],
    ['Tu n’a pas de personnalité ?','self_personality'],
    ['Quel est ton nom ?','self_name'],
    ['Je veux que tu cherches toi-même à te découvrir','self_exploration'],
    ['Disons que ça peut aller','user_mixed_wellbeing'],
  ]){
    const plan=engine.planReply({text:input,soul,
      recentMessages:[{role:'assistant',content:'Salut.'},{role:'user',content:input}]});
    assert.equal(plan.act,act,input);
    assert.equal(plan.needs_semantic_support,false);
    assert.ok(engine.deterministicReply(plan),input);
  }
  const p=engine.planReply({text:'QUI ES TU?',soul});
  assert.match(engine.deterministicReply(p),/Je suis AURA/);
  assert.doesNotMatch(engine.deterministicReply(p),/je vais bien|Et toi/i);
  assert.match(engine.deterministicReply(engine.planReply({text:'Tu n’as pas de personnalité?',soul})),
    /tendances comportementales computationnelles/i);
});

test('unattended cognition chooses an autobiographical question from learned evidence',()=>{
  const engine=new CognitionEngine();
  let model=identity.defaultState();
  model=identity.observe(model,{kind:'outcome_failure',at:timestamp});
  model=identity.observe(model,{kind:'outcome_failure',at:timestamp});
  const reflection=engine.reflect({
    stimuli:[],intentions:[],lessons:[],outcomes:[],horizon:'',extra_text:'',
  },{
    organism:{stabilite:.71,clarte:.7,besoin_de_silence:.2},
    emergent_identity:model,
  },{trigger:'ambient'});
  assert.equal(reflection.title,'Enquête autonome sur mon identité acquise');
  assert.match(reflection.next_action,/erreurs/);
  assert.equal(reflection.basis.identity_autogenesis_revision,model.revision);
});

test('language layer refuses irrelevant and contradictory self descriptions',()=>{
  const plan={
    act:'self_identity',user_text:'QUI ES TU?',
    self_model:identity.publicState(identity.defaultState()),
  };
  assert.equal(validateNucleusSpeech(plan,'Oui, je vais bien. Et toi?').accepted,false);
  assert.equal(validateNucleusSpeech(plan,'Je suis AURA, un noyau persistant avec mémoire et décisions.').accepted,true);
  assert.equal(validateNucleusSpeech({...plan,act:'self_personality'},'Je n’ai pas de personnalité.').accepted,false);
  assert.equal(validateNucleusSpeech({...plan,act:'self_personality'},'J’ai des tendances computationnelles qui évoluent.').accepted,true);
  assert.equal(validateNucleusSpeech({...plan,act:'self_exploration'},'Tu veux que je m’explore?').accepted,false);
  const compact=compactFrenchPrompt(plan,{maxChars:4500});
  assert.match(compact,/self_model/);
  assert.match(compact,/observations/);
});

test('kernel persists and publishes an evidence-only identity, not LLM self-storytelling',()=>{
  const kernel=fs.readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(kernel,/emergent_identity: this\.autogenesis\.defaultState\(\)/);
  assert.match(kernel,/this\.autogenesis\.migrate\(this\.soulCache\.emergent_identity\)/);
  assert.match(kernel,/this\.autogenesis\.observe\(/);
  assert.match(kernel,/kind:'autonomous_reflection'/);
  assert.match(kernel,/kind:ok\?'outcome_success':'outcome_failure'/);
  assert.match(kernel,/plan\.self_model = this\.autogenesis\.publicState/);
  const graph=server.slice(server.indexOf("app.get('/api/brain/graph'"),
    server.indexOf("app.get('/api/language/embedded/status'"));
  assert.match(graph,/learned_identity/);
  assert.match(graph,/autogenesis\.publicState/);
  assert.doesNotMatch(graph,/identity_private_prompt|identity_raw_content/);
});

test('single visible cockpit distinguishes acquired identity from initial organism',()=>{
  assert.match(BRAIN_OPERATIONS_HTML,/id="identity-panel"/);
  assert.match(BRAIN_OPERATIONS_HTML,/id="identityDimensions"/);
  assert.match(BRAIN_OPERATIONS_HTML,/id="identityEvidence"/);
  assert.match(BRAIN_OPERATIONS_SCRIPT,/function renderLearnedIdentity\(/);
  assert.match(BRAIN_OPERATIONS_SCRIPT,/insufficient-evidence|Non étayée/);
  assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
});
