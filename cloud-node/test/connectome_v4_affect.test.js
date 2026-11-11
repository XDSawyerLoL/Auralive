import test from 'node:test';
import assert from 'node:assert/strict';
import { AuraOrganism } from '../src/organism.js';
import { InnerDialogueEngine } from '../src/inner_dialogue.js';
import { BRAIN_OPERATIONS_HTML } from '../src/brain_operations_console.js';
import { BRAIN_OPERATIONS_SCRIPT } from '../src/brain_operations_runtime.js';
import { BRAIN_CONNECTOME_V4 } from '../src/brain_connectome_v4.js';
import { BRAIN_READABLE_CSS } from '../src/brain_readable_theme.js';

test('AURA French valence respects whole words and negation',()=>{
 const o=new AuraOrganism();
 for(const message of ['Je ne vais pas bien','Je suis malheureux',
   'Je ne suis pas heureux','Je suis triste','Ça ne va pas','Je vais mal']){
  assert.equal(o.valence(message),'negative',message);
 }
 for(const message of ['Je suis heureux','Merci, c’est super',
   'Je vais bien','Je suis contente','C’est génial']){
  assert.equal(o.valence(message),'positive',message);
 }
 for(const message of ['Je ne suis pas triste',"Je n'ai pas peur",
   'Il n’y a pas de problème','Je suis là']){
  assert.equal(o.valence(message),'neutre',message);
 }
 assert.equal(o.valence('Je suis malheureux'), 'negative');
});

test('AURA never rewards 100 fluent utterances as 100 verified outcomes',()=>{
 const o=new AuraOrganism(),begin=o.defaultState();
 let state=structuredClone(begin);
 for(let i=0;i<100;i++){
  const outcome=o.afterReply(state,'Phrase parfaitement fluide mais non vérifiée.',true);
  assert.deepEqual(outcome.post_delta,{});
  state=outcome.state;
 }
 assert.ok(state.confiance<=begin.confiance+0.001,'confidence must not rise on speech alone');
 assert.ok(state.satisfaction<=begin.satisfaction+0.001,'satisfaction must not rise on speech alone');
 assert.ok(state.homeostasis.success_ema<=begin.homeostasis.success_ema,
  'unverified utterances cannot count as successful action outcomes');
 const verified=o.applyOutcome(state,true);
 assert.ok(verified.state.homeostasis.success_ema>state.homeostasis.success_ema);
});

test('inner appraisal responds attentively to negated wellbeing',()=>{
 const o=new AuraOrganism(),engine=new InnerDialogueEngine();
 const pre=o.beforeInteraction(o.defaultState(),'Je ne vais pas bien');
 assert.equal(pre.valence,'negative');
 const d=engine.deliberate({organism:pre.state,message:'Je ne vais pas bien'});
 assert.equal(d.tone,'attentive');
 assert.equal(d.situation,'mixed_or_negative');
 assert.equal(d.executed_action,false);
 assert.equal(d.conscious_experience_claim,false);
});

test('Connectome 04 is a single interactive map of real registry nodes',()=>{
 const html=BRAIN_OPERATIONS_HTML,src=BRAIN_OPERATIONS_SCRIPT;
 for(const id of ['graphCanvas','graphV4Nodes','graphV4Links','graphV4Events',
   'graphV4Live','graphFullscreen','graphActivityOnly']){
  assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.ok(html.includes('Connectome vivant'));
 assert.ok(src.includes(BRAIN_CONNECTOME_V4));
 assert.match(src,/v4Counters\(\);syncTraceConsole\(\);renderOrganismStage\(\);c6Render\(\);scheduleDraw\(\)/);
 assert.match(src,/state\.activityOnly/);
 assert.match(src,/state\.flow\?\.steps/);
 assert.match(src,/observed_count/);
 assert.match(src,/last_observed_at/);
 assert.doesNotMatch(BRAIN_CONNECTOME_V4,/Math\.random\(/);
 assert.match(BRAIN_READABLE_CSS,/graph-expanded/);
 assert.doesNotThrow(()=>new Function(src));
});
