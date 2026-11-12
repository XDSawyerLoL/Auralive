import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {socialTurnDecision,nativeSocialReply} from '../src/social_turn_kernel.js';
import {CognitionEngine} from '../src/cognition.js';
import {ExpressionLayer} from '../src/expression.js';
import {validateNucleusSpeech} from '../src/french_language.js';

const engine=new CognitionEngine();
const turns=[
 {id:101,role:'user',content:'bonjour'},
 {id:102,role:'assistant',content:'Bonjour, comment vas-tu ?'},
 {id:103,role:'user',content:'bien merci'},
 {id:104,role:'assistant',content:'Je suis content que ça aille. On continue ?'},
 {id:105,role:'user',content:'comment ça'},
 {id:106,role:'assistant',content:'Je te proposais de continuer à discuter.'},
 {id:107,role:'user',content:'Tu'},
 {id:108,role:'assistant',content:'Tu… je ne suis pas sûr de saisir. Dis-m’en un peu plus.'},
 {id:109,role:'user',content:'tu semble intrigué je me trompe?'},
];

const plan=(q,history)=>engine.planReply({text:q,
 soul:{organism:{curiosite:.5},emergent_identity:{}},
 recentMessages:history,privateView:true});

test('native micro-circuit resolves the five actual conversation turns with no imagined context',()=>{
 const a=plan('bien merci',turns.slice(0,3));
 assert.equal(a.act,'social_wellbeing_ack');
 assert.equal(a.needs_semantic_support,false);
 assert.equal(engine.deterministicReply(a),'Tant mieux.');
 const b=plan('comment ça',turns.slice(1,5));
 assert.equal(b.act,'clarify_unrequested_continuation');
 assert.match(engine.deterministicReply(b),/poursuivre notre échange/);
 assert.doesNotMatch(engine.deterministicReply(b),/CI|GitHub|Quantic/i);
 const c=plan('Tu',turns.slice(3,7));
 assert.equal(c.act,'unfinished_address');
 assert.equal(engine.deterministicReply(c),'Oui, je t’écoute.');
 const d=plan('tu semble intrigué je me trompe?',turns.slice(6));
 assert.equal(d.act,'explain_apparent_curiosity');
 assert.match(engine.deterministicReply(d),/phrase sans la finir/);
 assert.doesNotMatch(engine.deterministicReply(d),/je suis intriguée|je ressens/);
 const identity=plan('Tu sais qui tu es?',turns.slice(6));
 assert.equal(identity.act,'self_identity');
});

test('no previous question means no fabricated social acknowledgement or fictitious remembered topic',()=>{
 assert.equal(socialTurnDecision('bien merci',[]),null);
 assert.equal(socialTurnDecision('comment ça',
  [{role:'assistant',content:'Bonjour.'}]),null);
 const missing=socialTurnDecision('Tu',[]);
 assert.equal(missing.act,'unfinished_address');
 assert.equal(missing.previous_assistant,'');
 assert.equal(missing.inner_feeling_claim,false);
 assert.equal(nativeSocialReply({act:'self_identity'}),'');
});

test('native social reply does not call Groq, OpenRouter or any external LLM',async()=>{
 const providers={groq:0,federation:0,embedded:0};
 const ai={enabled:true,
   groq:{enabled:true,generate:async()=>{providers.groq++;throw Error('unexpected Groq');}},
   federation:{enabled:true,generate:async()=>{providers.federation++;throw Error('unexpected OpenRouter');}},
 };
 const expression=new ExpressionLayer(ai,engine);
 for(const [text,ctx] of [
  ['bien merci',turns.slice(0,3)],
  ['comment ça',turns.slice(1,5)],
  ['Tu',turns.slice(3,7)],
  ['tu semble intrigué je me trompe?',turns.slice(6)],
 ]){
  const p=plan(text,ctx);
  const answer=await expression.verbalize(p);
  assert.ok(answer.length>2,text);
  assert.equal(expression.lastMode,'native-social-kernel');
  assert.equal(expression.language.lastBackend,'aura-native-social');
  assert.equal(expression.language.lastNucleusContract.accepted,true);
  assert.equal(validateNucleusSpeech(p,answer).accepted,true);
 }
 assert.deepEqual(providers,{groq:0,federation:0,embedded:0});
});

test('backend uses SQL same-session ingress, native speech without memory or provider and honest provenance',()=>{
 const k=readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(k,/const immediateDialogue=immediateDialogueWindow/);
 assert.match(k,/perceptualBroadcast:true/);
 assert.match(k,/current_ingress_verified:true/);
 assert.match(k,/nativeSocialIngress/);
 assert.match(k,/this\.expression\.lastMode==='native-social-kernel'/);
 assert.match(server,/response\?\.response_kind==='native-kernel'/);
 assert.doesNotMatch(server,/curiosityQuestion \? .*baseAnswer/);
});
