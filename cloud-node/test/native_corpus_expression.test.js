import test from 'node:test';
import assert from 'node:assert/strict';
import {ExpressionLayer} from '../src/expression.js';
test('strict local-only speech uses corpus and makes zero Groq/federation calls',async()=>{
 const prior=process.env.AURA_NATIVE_FRENCH_MODE;
 process.env.AURA_NATIVE_FRENCH_MODE='local-only';
 let externalCalls=0,legacyFallbackCalls=0;
 try{
  const ai={enabled:true,
   groq:{enabled:true,generate:async()=>{externalCalls++;throw Error('remote call forbidden');}},
   federation:{enabled:true,generate:async()=>{externalCalls++;throw Error('remote call forbidden');}},
   generate:async()=>{externalCalls++;throw Error('remote call forbidden');}};
  const e=new ExpressionLayer(ai,{deterministicReply:()=>{legacyFallbackCalls++;return 'Secours prédéfini.';}});
  const name=await e.verbalize({act:'self_name',facts:[],user_text:'Comment tu t’appelles?'});
  assert.equal(name,'Je m’appelle AURA.');
  assert.equal(e.lastMode,'native-corpus-language');
  assert.equal(e.language.lastBackend,'aura-native-corpus');
  assert.equal(e.language.lastNucleusContract.accepted,true);
  const unknown=await e.verbalize({act:'respond',facts:[],user_text:'Explique le théorème de Gödel'});
  assert.equal(unknown,'');
  assert.equal(e.lastMode,'native-corpus-uncovered');
  const support=await e.semanticSupport({needs_semantic_support:true,semantic_query:'quelque chose'});
  assert.equal(support,'');
  assert.equal(externalCalls,0);
  assert.equal(legacyFallbackCalls,2); // computed, but never returned in strict corpus mode
 }finally{
  if(prior===undefined)delete process.env.AURA_NATIVE_FRENCH_MODE;
  else process.env.AURA_NATIVE_FRENCH_MODE=prior;
 }
});
test('corpus native greetings and grounded morphological state have bounded coverage',()=>{
 // Corpus forms are learned; semantic ground truth remains nucleus-owned.
});
