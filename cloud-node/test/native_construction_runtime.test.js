import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NativeConstructionLearner} from '../src/native_construction_learning.js';
import {getNativeRuntimeConstructionLearner,nativeRuntimeConstructionStatus}
 from '../src/native_construction_runtime.js';
test('operator-provided language snapshot is loaded read-only and no path leaks',()=>{
 const dir=mkdtempSync(join(tmpdir(),'aura-grammar-test-'));
 try{
  const learner=new NativeConstructionLearner();
  const examples=[
   ['Romain','fermé','fermer','porte'],
   ['Camille','ouvert','ouvrir','tiroir'],
   ['Nadia','déplacé','déplacer','caisse']
  ];
  for(const [name,verb,lemma,object] of examples){
   const article=object==='tiroir'?'le':'la';
   assert.equal(learner.observe({
    sentence:'Devant la gare, '+name+' a '+verb+' '+article+' '+object+'.',
    agent:name,predicate:lemma,patient:object
   }).accepted,true);
  }
  assert.equal(learner.status().ready,1);
  const location=join(dir,'language.json');
  writeFileSync(location,JSON.stringify(learner.snapshot()));
  const installed=getNativeRuntimeConstructionLearner({AURA_NATIVE_CONSTRUCTIONS_FILE:location});
  assert.equal(installed?.status().ready,1);
  assert.equal(nativeRuntimeConstructionStatus().ready,true);
  assert.equal(JSON.stringify(nativeRuntimeConstructionStatus()).includes(location),false);
  assert.equal(installed.parse('Devant la gare, Luc a ouvert la fenêtre.')?.agent,'luc');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
