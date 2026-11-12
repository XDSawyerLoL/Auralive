import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultInterventionLearning,observeInterventionFeedback,evaluateInterventionLearning}
  from '../src/intervention_learning.js';
test('only correlated, explicit feedback updates learned question preference',()=>{
 let s=defaultInterventionLearning();
 assert.equal(observeInterventionFeedback(s,{candidateId:'a',expectedId:'b',rating:'helpful'}).accepted,false);
 for(let n=0;n<4;n++){
   const id='initiative-'+n;
   const observed=observeInterventionFeedback(s,{candidateId:id,expectedId:id,rating:'unhelpful'});
   assert.equal(observed.accepted,true);s=observed.state;
 }
 assert.equal(evaluateInterventionLearning(s,{evidenceScope:'machine-verified-local-change',consent:true}).act,'silence');
 assert.equal(observeInterventionFeedback(s,{candidateId:'initiative-3',expectedId:'initiative-3',rating:'helpful'}).accepted,false);
});
test('sensory guesses, missing permission and heavy load never authorize questions',()=>{
 const s=defaultInterventionLearning();
 assert.equal(evaluateInterventionLearning(s,{evidenceScope:'unverified-client-model-output',consent:true}).question_allowed,false);
 assert.equal(evaluateInterventionLearning(s,{evidenceScope:'machine-verified-local-change',consent:false}).act,'silence');
 assert.equal(evaluateInterventionLearning(s,{evidenceScope:'machine-verified-local-change',consent:true,resourcePressure:.9}).act,'silence');
});
