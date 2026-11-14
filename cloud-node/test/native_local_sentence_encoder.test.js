import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeLocalSemanticEncoder,encoderConfiguration,dotSimilarity,localEncoderMemoryHeadroom}
 from '../src/native_local_sentence_encoder.js';
import {retrieveNativeSemanticEvidence} from '../src/native_semantic_retrieval.js';

const vector=(i)=>Array.from({length:384},(_,j)=>i===j?1:0);
test('local semantic encoder does not start or download by default',async()=>{
 const c=encoderConfiguration({});
 assert.equal(c.enabled,false);
 const encoder=new NativeLocalSemanticEncoder({configuration:c});
 assert.equal(await encoder.initialize(),false);
 assert.equal(encoder.diagnostic().network_access,false);
 assert.equal(await encoder.embed('Une phrase française'),null);
});
test('encoder must verify local model assets before inference',()=>{
 const c=encoderConfiguration({AURA_LOCAL_ENCODER_ENABLED:'true',
   AURA_LOCAL_ENCODER_ROOT:'/unlikely-aura-local-model-install'});
 assert.equal(c.enabled,true);
 assert.equal(c.ready,false);
 assert.equal(c.reason,'model-assets-not-installed');
});
test('injected local CPU encoder yields 384D normalized vectors',async()=>{
 let loads=0;
 const encoder=new NativeLocalSemanticEncoder({
  configuration:{ready:true,enabled:true,model:'offline-fixture',model_bytes:123456789},
  load:async()=>{loads++;return async()=>({data:Float32Array.from(vector(1))});}
 });
 const a=await encoder.embed('Le chemin traverse la forêt');
 const b=await encoder.embed('La route passe dans un bois');
 assert.equal(a.length,384);
 assert.equal(a[1],1);
 assert.equal(dotSimilarity(a,b),1);
 assert.equal(loads,1);
});
test('semantic retrieval is bounded, grounded and returns no invented answer',async()=>{
 const fake={embed:async(text)=>text==='où est le carnet'?
  vector(0):text==='Le carnet est dans la bibliothèque.'?
  [0.95,0.3122498999,...Array(382).fill(0)]:vector(1)};
 const res=await retrieveNativeSemanticEvidence({
  query:'où est le carnet',
  passages:[{role:'user',evidence_scope:'user-statement-unverified',
   text:'Le carnet est dans la bibliothèque.'},
   {role:'user',evidence_scope:'user-statement-unverified',
    text:'Le carnet est sur le bureau.'}],encoder:fake});
 assert.equal(res.status,'retrieved-unverified-passage');
 assert.equal(res.matches[0].text,'Le carnet est dans la bibliothèque.');
 assert.equal(res.matches[0].evidence_scope,'user-statement-unverified');
 assert.equal(res.matches.length,1);
 assert.equal(res.answer,undefined);
});
test('semantic retrieval abstains on ambiguous similarity and on modal text',async()=>{
 const fake={embed:async()=>vector(0)};
 const ambiguous=await retrieveNativeSemanticEvidence({
  query:'où est le dossier ?',
  passages:['Le dossier est ici.','Le dossier est ailleurs.'].map(text=>({
   role:'user',evidence_scope:'user-statement-unverified',text
  })),encoder:fake});
 assert.equal(ambiguous.status,'ambiguous');
 const conditional=await retrieveNativeSemanticEvidence({
  query:'Qui a ouvert la porte ?',
  passages:[{role:'user',evidence_scope:'user-statement-unverified',
   text:'Si Luc ouvre la porte, Nadia part.'}],encoder:fake});
 assert.equal(conditional.status,'no-confident-match');
});
test('semantic retrieval refuses external unverified claims and wrong provenance',async()=>{
 const fake={embed:async()=>vector(0)};
 const r=await retrieveNativeSemanticEvidence({
  query:'Quel indice dans le document ?',
  passages:[{role:'assistant',text:'Le document dit ceci.',
    evidence_scope:'user-statement-unverified'},
   {role:'user',text:'Le document dit cela.',evidence_scope:'model-generated'}],
  encoder:fake});
 assert.equal(r.status,'no-confident-match');
});
test('encoder never substitutes similarity for event verification',()=>{
 assert.equal(dotSimilarity(vector(0),vector(1)),0);
 assert.equal(dotSimilarity([1,0],[1]),null);
 assert.equal(dotSimilarity([0,0],[0,0]),null);
});


test('preflight rejects insufficient managed memory and unknown cgroup limits',()=>{
 const mock=(path)=>{
  if(path.endsWith('memory.max'))return String(700*1048576);
  if(path.endsWith('memory.current'))return String(400*1048576);
  throw Error('missing');
 };
 const low=localEncoderMemoryHeadroom({read:mock,minMiB:768});
 assert.equal(low.sufficient,false);
 assert.equal(low.headroom_mib,300);
 assert.equal(low.reason,'insufficient-cgroup-headroom');
 const missing=localEncoderMemoryHeadroom({read:()=>{throw Error('unavailable');}});
 assert.equal(missing.sufficient,false);
 assert.equal(missing.reason,'memory-headroom-unknown');
 const confirmed=localEncoderMemoryHeadroom({
  read:()=>{throw Error('unavailable');},allowUnverified:true});
 assert.equal(confirmed.sufficient,true);
 assert.equal(confirmed.reason,'operator-verified');
});
