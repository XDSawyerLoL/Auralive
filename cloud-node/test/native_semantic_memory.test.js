import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeSemanticEpisodeIndex,retrieveLocalConversationMemory}
 from '../src/native_semantic_memory.js';
const vector=(a,b=0)=>[a,b,...Array(382).fill(0)];
const encoder={embed:async text=>{
 if(text.includes('question centrale'))return vector(1,0);
 if(text.includes('premier'))return vector(.99,.1);
 if(text.includes('second'))return vector(.7,.7);
 if(text.includes('troisième'))return vector(0,1);
 if(text.includes('égal'))return vector(1,0);
 return vector(0,1);
}};
const good=(id,text)=>({id,text,role:'user',
 evidence_scope:'user-statement-unverified'});

test('semantic episode retrieval returns exact original user passage and its id',async()=>{
 const index=new NativeSemanticEpisodeIndex(encoder);
 await index.add(good('note-a','Le premier rapport parle du carnet.'));
 await index.add(good('note-b','Le troisième rapport porte sur la fenêtre.'));
 const out=await index.retrieve('question centrale sur le carnet');
 assert.equal(out.status,'retrieved-unverified-passage');
 assert.equal(out.matches[0].id,'note-a');
 assert.equal(out.matches[0].text,'Le premier rapport parle du carnet.');
 assert.equal(out.can_answer_facts,false);
 assert.equal(out.verified_world_facts,0);
});
test('correction by id retracts the old quoted text, and deletion eliminates its vector',async()=>{
 const index=new NativeSemanticEpisodeIndex(encoder);
 await index.add(good('turn-4','Le premier rapport parle du carnet.'));
 const old=await index.retrieve('question centrale');
 assert.equal(old.matches[0].id,'turn-4');
 await index.add(good('turn-4','Le troisième rapport porte sur la fenêtre.'));
 const corrected=await index.retrieve('question centrale');
 assert.equal(corrected.status,'no-confident-match');
 assert.equal(index.remove('turn-4'),true);
 assert.equal(index.status().count,0);
 assert.equal((await index.retrieve('question centrale')).status,'no-context');
});
test('similar competing passages abstain, including strong similarity on both',async()=>{
 const index=new NativeSemanticEpisodeIndex(encoder);
 await index.add(good('one','Le premier rapport porte sur le coffre.'));
 await index.add(good('two','Le égal rapport porte sur le coffre.'));
 const out=await index.retrieve('question centrale');
 assert.equal(out.status,'ambiguous');
 assert.deepEqual(out.matches,[]);
});
test('hypothetical, future, habitual, reported and non-user text are inadmissible',async()=>{
 const index=new NativeSemanticEpisodeIndex(encoder);
 const texts=[
  'Si Luc ouvre la porte, Nadia part.',
  'Demain Luc ouvre la porte.',
  'Chaque jour Luc ouvre la porte.',
  'Paul affirme que Luc ouvre la porte.',
  'Luc pourrait ouvrir la porte.'
 ];
 for(let i=0;i<texts.length;i++)
  assert.equal((await index.add(good('bad-'+i,texts[i]))).accepted,false);
 assert.equal((await index.add({...good('bad-agent','Le premier rapport est ici.'),
  role:'assistant'})).accepted,false);
 assert.equal((await index.add({...good('bad-source','Le premier rapport est ici.'),
  evidence_scope:'model-generated'})).accepted,false);
 assert.equal(index.status().count,0);
});
test('episode index stays bounded without exposing embeddings in public results',async()=>{
 const index=new NativeSemanticEpisodeIndex(encoder);
 for(let i=0;i<45;i++)await index.add(good('e-'+i,'Le premier rapport numéro '+i+' est complet.'));
 assert.equal(index.status().count,40);
 assert.equal(index.remove('e-0'),false);
 const out=await index.retrieve('question centrale');
 assert.equal(out.status,'ambiguous');
 assert.equal(JSON.stringify(out).includes('vector'),false);
 assert.equal(index.status().persistent,false);
});
test('conversation retrieval preserves turn references and excludes assistant messages',async()=>{
 const history=[
 {role:'assistant',content:'Le premier rapport vient du serveur.'},
 {role:'user',content:'Le troisième rapport est disponible.'},
 {role:'user',content:'Le premier rapport parle du carnet.'}
 ];
 const result=await retrieveLocalConversationMemory('question centrale',history,encoder);
 assert.equal(result.status,'retrieved-unverified-passage');
 assert.equal(result.matches[0].id,'turn-2');
 assert.equal(result.matches[0].text,'Le premier rapport parle du carnet.');
});
test('embedding outage returns an explicit unavailability, never a fabricated match',async()=>{
 const outage={embed:async()=>null};
 const index=new NativeSemanticEpisodeIndex(outage);
 assert.equal((await index.add(good('x','Le premier rapport est disponible.'))).accepted,false);
 assert.equal((await index.retrieve('question centrale')).status,'no-context');
 const result=await retrieveLocalConversationMemory('question centrale',
  [{role:'user',content:'Le premier rapport est disponible.'}],outage);
 assert.equal(result.status,'no-context');
});
