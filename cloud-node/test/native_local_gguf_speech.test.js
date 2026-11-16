import test from 'node:test';
import assert from 'node:assert/strict';
import {ExpressionLayer} from '../src/expression.js';

// The legacy native-French-only route returned '' on an uncovered sentence
// before calling a verified, on-host GGUF model. This is an integration
// regression test: the remote providers deliberately advertise availability.
test('local-only French corpus falls through to a verified GGUF and never sends remote requests',async()=>{
 const previous=process.env.AURA_NATIVE_FRENCH_MODE;
 process.env.AURA_NATIVE_FRENCH_MODE='local-only';
 let cloud=0,offline=0;
 try{
  const ai={
   enabled:true,
   generate:async()=>{cloud++;throw Error('forbidden generic provider');},
   groq:{enabled:true,snapshot:()=>({enabled:true}),
     generate:async()=>{cloud++;throw Error('forbidden Groq');}},
   federation:{enabled:true,snapshot:()=>({enabled:true}),
     generate:async()=>{cloud++;throw Error('forbidden OpenRouter');}},
  };
  const expression=new ExpressionLayer(ai,{deterministicReply:()=>''});
  expression.language.embedded={
   status:()=>({ready:true,probe_verified:true,installed:true,
     boot_profile:'low-memory',provisioning:{stage:'installed-verified'}}),
   generate:async(prompt,system)=>{
    offline++;
    assert.match(prompt,/connexion est-elle lente/i);
    assert.match(system,/français naturel/i);
    return 'Je peux examiner plusieurs causes possibles, sans affirmer laquelle est vérifiée.';
   },
  };
  const reply=await expression.verbalize({
   act:'respond',facts:[],user_text:'Pourquoi ma connexion est-elle lente ?',
   immediate_dialogue_context:[],
  });
  assert.equal(reply,'Je peux examiner plusieurs causes possibles, sans affirmer laquelle est vérifiée.');
  assert.equal(offline,1);
  assert.equal(cloud,0);
  assert.equal(expression.lastMode,'local-generative-language');
  assert.equal(expression.language.lastBackend,'hostinger-embedded-llama');
  assert.equal(expression.language.lastNucleusContract.accepted,true);
  assert.equal(await expression.semanticSupport({
   needs_semantic_support:true,semantic_query:'fournir une réponse',
  }),'');
  const diagnostic=await expression.diagnostic();
  assert.equal(diagnostic.natural_french_ready,true);
  assert.equal(diagnostic.remote_language_calls_permitted,false);
  assert.equal(diagnostic.mode,'learned-local-language-model');
 }finally{
  if(previous===undefined)delete process.env.AURA_NATIVE_FRENCH_MODE;
  else process.env.AURA_NATIVE_FRENCH_MODE=previous;
 }
});

test('local-only mode never contacts Groq or OpenRouter when the GGUF answer is unusable',async()=>{
 const previous=process.env.AURA_NATIVE_FRENCH_MODE;
 process.env.AURA_NATIVE_FRENCH_MODE='local-only';
 let cloud=0,offline=0;
 try{
  const fail=async()=>{cloud++;throw Error('remote call forbidden');};
  const expression=new ExpressionLayer({
   enabled:true,generate:fail,
   groq:{enabled:true,generate:fail},
   federation:{enabled:true,generate:fail},
  },{deterministicReply:()=>''});
  expression.language.embedded={
   status:()=>({ready:true,probe_verified:true,installed:true,
     provisioning:{stage:'installed-verified'}}),
   generate:async()=>{offline++;return '<think>unfinished private reasoning';},
  };
  const reply=await expression.verbalize({
   act:'respond',facts:[],user_text:'Explique le paradoxe de Russell.',
  });
  assert.equal(reply,'');
  assert.equal(offline,1);
  assert.equal(cloud,0);
  assert.equal(expression.lastMode,'native-corpus-uncovered');
  assert.equal(expression.language.lastMode,'degraded');
 }finally{
  if(previous===undefined)delete process.env.AURA_NATIVE_FRENCH_MODE;
  else process.env.AURA_NATIVE_FRENCH_MODE=previous;
 }
});

test('prefer-local tries GGUF before an available Groq model',async()=>{
 const previous=process.env.AURA_NATIVE_FRENCH_MODE;
 process.env.AURA_NATIVE_FRENCH_MODE='prefer-local';
 let remote=0,local=0;
 try{
  const expression=new ExpressionLayer({
   enabled:true,
   groq:{enabled:true,snapshot:()=>({enabled:true}),
     generate:async()=>{remote++;return {answer:'Texte venu de Groq.',model:'free'};}},
   federation:{enabled:false,snapshot:()=>({enabled:false})},
  },{deterministicReply:()=>''});
  expression.language.embedded={
   status:()=>({ready:true,probe_verified:true,installed:true,
     provisioning:{stage:'installed-verified'}}),
   generate:async()=>{local++;return 'Je peux répondre directement depuis le moteur local.';},
  };
  const answer=await expression.verbalize({
   act:'respond',facts:[],user_text:'Explique cet événement.',
  });
  assert.equal(answer,'Je peux répondre directement depuis le moteur local.');
  assert.equal(local,1);
  assert.equal(remote,0);
  assert.equal(expression.language.lastBackend,'hostinger-embedded-llama');
 }finally{
  if(previous===undefined)delete process.env.AURA_NATIVE_FRENCH_MODE;
  else process.env.AURA_NATIVE_FRENCH_MODE=previous;
 }
});
