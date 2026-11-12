import test from 'node:test';
import assert from 'node:assert/strict';
import {immediateDialogueWindow,mergeConversationViews}
 from '../src/immediate_dialogue_window.js';
import {CognitionEngine} from '../src/cognition.js';
import {languageWorkspaceProjection} from '../src/workspace_boundary.js';
import {
 compactSpeechConversation,compactFrenchPrompt,
 validateNucleusSpeech,
} from '../src/french_language.js';
import {readFileSync} from 'node:fs';

const rows=[
 {id:11,session_id:'own-session',role:'user',
   content:'Bien, sais-tu ce que tu es ?'},
 {id:12,session_id:'own-session',role:'assistant',
   content:'Je suis AURA, et mes choix peuvent être influencés par notre histoire.'},
 {id:13,session_id:'own-session',role:'user',
   content:"C'est comme ça que tu te décrirais ?"},
].reverse();

const broadcast={
 broadcast_enabled:true,received:{
  prefrontal:[{source:'perception'}],metacognition:[],
 },
 processed:{hippocampus:{references:[]}},
 decision:{attention:'user',control:'normal'},
};

test('immediate dialogue is a bounded same-session turn buffer, not raw project memory',()=>{
 const short=immediateDialogueWindow(rows,"C'est comme ça que tu te décrirais ?",{
  perceptualBroadcast:true,
 });
 assert.equal(short.length,2);
 assert.equal(short.at(-1).role,'assistant');
 assert.match(short.at(-1).content,/Je suis AURA/);
 assert.ok(short.every(t=>t.source==='same-session-immediate-turn'));
 assert.equal(immediateDialogueWindow(rows,"C'est comme ça que tu te décrirais ?",{
  perceptualBroadcast:false,
 }).length,0);
 assert.equal(immediateDialogueWindow(rows,'question not inserted',{
  perceptualBroadcast:true,
 }).length,0);
 assert.equal(mergeConversationViews([{id:12,role:'assistant',content:'identique'}],short)
  .filter(t=>t.id===12).length,1);
});

test('perception admits immediate context while hippocampal long-term memory stays blocked',()=>{
 const short=immediateDialogueWindow(rows,rows[0].content,{perceptualBroadcast:true});
 const proposal={act:'resolve_reference_followup',user_text:rows[0].content,
   conversation_context:[{id:999,role:'assistant',content:'secret non sélectionné'}],
   founder_profile:[{id:40,detail:'identité privée'}],
   facts:['projet secret'],self_model:{observations:99},
   discourse:{move:'reference_followup',reference_text:rows[1].content}};
 const result=languageWorkspaceProjection(proposal,broadcast,{
  privateView:false,immediateDialogue:short,
 });
 assert.equal(result.allowed,true);
 assert.equal(result.plan.conversation_context.length,0);
 assert.equal(result.plan.immediate_dialogue_context.length,2);
 assert.equal(result.plan.immediate_dialogue_context[1].role,'assistant');
 assert.equal(result.plan.founder_profile.length,0);
 assert.deepEqual(result.plan.facts,[]);
 const denied=languageWorkspaceProjection(proposal,
  {...broadcast,broadcast_enabled:false},
  {immediateDialogue:short});
 assert.equal(denied.allowed,false);
});

test('AURA can interpret "C’est comme ça que tu te décrirais ?" as its last answer',()=>{
 const short=immediateDialogueWindow(rows,rows[0].content,{perceptualBroadcast:true});
 const plan=new CognitionEngine().planReply({
  text:rows[0].content,soul:{organism:{},emergent_identity:{}},
  recentMessages:mergeConversationViews([],short),privateView:false,
 });
 assert.equal(plan.discourse.move,'reference_followup');
 assert.match(plan.discourse.previous_assistant,/Je suis AURA/);
 assert.match(plan.discourse.reference_text,/Je suis AURA/);
 const rendered=compactFrenchPrompt({
  ...plan,immediate_dialogue_context:short,conversation_context:[],
 },{maxChars:4500});
 assert.match(rendered,/Je suis AURA/);
 assert.match(rendered,/C.est comme ça que tu te décrirais/);
 assert.equal(compactSpeechConversation({
  immediate_dialogue_context:short,
 }).length,2);
});

test('a fluent but unrelated Groq greeting cannot pass as AURA self-reflection',()=>{
 const plan={
  act:'resolve_reference_followup',user_text:rows[0].content,
  discourse:{move:'reference_followup',reference_text:rows[1].content},
  immediate_dialogue_context:immediateDialogueWindow(rows,rows[0].content,{
   perceptualBroadcast:true,
  }),
  facts:['Se référer à la dernière réponse d’AURA'],
 };
 const wrong=validateNucleusSpeech(plan,
  'Non. « Bonjour » est une salutation, pas une description de mon identité.');
 assert.equal(wrong.accepted,false);
 assert.equal(wrong.code,'unrelated-greeting-reference');
 const good=validateNucleusSpeech(plan,
  'C’est une description partielle : j’ai cette mémoire, mais elle ne suffit pas à résumer ce que j’apprends de mes choix.');
 assert.equal(good.accepted,true);
});

test('provider provenance is visible and a server-added question never overrides persisted answer',()=>{
 const kernel=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const service=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../src/brain_operations_runtime.js',import.meta.url),'utf8');
 assert.match(kernel,/const immediateDialogue=immediateDialogueWindow/);
 assert.match(kernel,/brainHop\('workspace','dialogue','immediate-context-admitted'\)/);
 assert.match(kernel,/immediateDialogue,/);
 assert.match(kernel,/language_latency_ms/);
 assert.match(service,/const answer = unavailable \? '' : baseAnswer/);
 assert.doesNotMatch(service,/curiosityQuestion \? .*baseAnswer/);
 assert.match(ui,/out\.language_provider/);
 assert.match(ui,/out\.nucleus_plan_origin/);
});
