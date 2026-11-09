import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { readFileSync } from 'node:fs';
import {InnerDialogueEngine} from '../src/inner_dialogue.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {COGNITIVE_ATLAS_SCRIPT} from '../src/cognitive_atlas_runtime.js';
import {COGNITIVE_ATLAS_HTML} from '../src/cognitive_atlas_ui.js';
import {CognitiveTraceLedger} from '../src/cognitive_trace.js';
import {compactFrenchPrompt} from '../src/french_language.js';

const at='2026-11-09T10:00:00Z';
const engine=new InnerDialogueEngine();
const state={
  stabilite:.75,clarte:.80,confiance:.83,frustration:.08,agency:.7,
  curiosite:.69,curiosite_sociale:.71,
  homeostasis:{resource_pressure:.05,seed:1234,success_ema:.25,failure_ema:.03},
};
test('emotionally nuanced messages alter appraisal and response tone, not facts or permissions',()=>{
 const neutral=engine.deliberate({organism:state,message:'Bonjour',now:at});
 const nuanced=engine.deliberate({organism:state,message:'Disons que ça peut aller',now:at});
 assert.equal(nuanced.situation,'mixed_or_negative');
 assert.equal(nuanced.tone,'attentive');
 assert.ok(nuanced.competition.care>neutral.competition.care);
 assert.equal(nuanced.executed_action,false);
 assert.equal(nuanced.conscious_experience_claim,false);
 const p=compactFrenchPrompt({user_text:'Disons que ça peut aller',response_tone:nuanced.tone,
   goal:'Accueillir la nuance sans enthousiasme artificiel',act:'user_mixed_wellbeing'});
 assert.match(p,/response_tone/);
 assert.match(p,/"attentive"/);
});
test('computational load and past failures shift decisions without allowing dangerous actions',()=>{
 const low=engine.deliberate({organism:state,message:'Peux-tu m’aider ?',now:at});
 const overloaded={...state,clarte:.25,confiance:.18,frustration:.76,
   homeostasis:{resource_pressure:.96,seed:1234,failure_ema:.9,success_ema:.05}};
 const high=engine.deliberate({organism:overloaded,message:'Peux-tu m’aider ?',now:at});
 assert.ok(high.uncertainty>low.uncertainty);
 assert.ok(high.competition.caution>low.competition.caution);
 assert.ok(high.options.defer>low.options.defer);
 assert.ok(['respond','clarify','verify','defer'].includes(high.selected_action));
 assert.equal(high.executed_action,false);
 assert.equal(high.conscious_experience_claim,false);
});
test('the bounded tie-break is repeatable and exposes no simulated private thoughts',()=>{
 const one=engine.deliberate({organism:state,message:'Tu es qui ?',now:at});
 const two=engine.deliberate({organism:state,message:'Tu es qui ?',now:at});
 assert.deepEqual(one,two);
 const publicState=engine.publicState({...one,privateThought:'SECRET'}); 
 assert.equal(publicState.privateThought,undefined);
 assert.equal(publicState.source_kind,'computed-appraisal-not-subjective-experience');
 assert.deepEqual(Object.keys(publicState.competition).sort(),['care','caution','curiosity','initiative']);
});
test('Atlas v3 18 real stages and single-screen interface compile',()=>{
 const stageCount=(COGNITIVE_ATLAS_SCRIPT.match(/id:'context_[a-z_]+'/g)||[]).length;
 assert.equal(stageCount,7);
 for(const id of ['request','input','homeostasis','stimulus','context','decision',
  'research','semantic','expression','homeostasis_post','persistence']){
  assert.ok(COGNITIVE_ATLAS_SCRIPT.includes("id:'"+id+"'"),id);
 }
 for(const id of ['cogGraph','cogModeDialogue','cogModeAutonomy','cogReplay','cogExport','cogEvents']){
  assert.ok(BRAIN_OPERATIONS_HTML.includes('id="'+id+'"'),id);
 }
 assert.equal((BRAIN_OPERATIONS_HTML.match(/id="chatHistory"/g)||[]).length,1);
 assert.equal((BRAIN_OPERATIONS_HTML.match(/id="cogGraph"/g)||[]).length,1);
 assert.equal(BRAIN_OPERATIONS_HTML.includes(COGNITIVE_ATLAS_HTML),true);
 assert.equal(BRAIN_OPERATIONS_SCRIPT.includes(COGNITIVE_ATLAS_SCRIPT),true);
 assert.match(BRAIN_OPERATIONS_HTML,/id="inner-dialogue-panel"/);
 assert.doesNotThrow(()=>new Script(COGNITIVE_ATLAS_SCRIPT));
 assert.doesNotThrow(()=>new Script(BRAIN_OPERATIONS_SCRIPT));
});
test('all atlas stages come from instrumented kernel operations and bounded public SSE',()=>{
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 for(const id of ['context_intentions','context_lessons','context_reflections',
 'context_work','context_agenda','context_continuity','context_messages']){
  assert.ok(kernel.includes("'"+id+"'"),id);
 }
 assert.match(kernel,/onTrace = null/);
 assert.match(kernel,/this\.innerDialogue\.deliberate/);
 assert.match(kernel,/observe\('expression'/);
 assert.match(kernel,/observe\('homeostasis_post'/);
 assert.match(kernel,/observe\('persistence'/);
 assert.match(server,/app\.get\('\/api\/cognition\/events'/);
 assert.match(server,/app\.get\('\/api\/cognition\/trace'/);
 assert.match(server,/app\.get\('\/api\/cognition\/autonomy\/events',[\s\S]*?requirePrivate/);
 assert.match(server,/trace:cognitiveTrace\.snapshot\(chatSessionId,traceId\)/);
 const ledger=new CognitiveTraceLedger();
 const id=ledger.start('s1');
 ledger.mark(id,'context_messages','running');
 ledger.mark(id,'context_messages','done',{messages:4,secret:'PRIVATE'});
 ledger.finish(id);
 assert.equal(ledger.snapshot('s2',id).available,false);
 assert.equal(ledger.snapshot('s1',id).events.some(e=>e.stage==='context_messages'),true);
 assert.doesNotMatch(JSON.stringify(ledger.snapshot('s1')),/PRIVATE/);
});
