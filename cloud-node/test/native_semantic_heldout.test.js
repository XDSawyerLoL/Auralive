import test from 'node:test';
import assert from 'node:assert/strict';
import {answerFrenchFromConversation,parseFrenchCorrection} from '../src/native_semantic_grammar.js';

const fold=value=>String(value||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLowerCase();
const people=['Nadia','Inès','Zoé','Cyril','Malik'];
const actions=['ferme','ouvre','déplace'];
const objects=['le dossier','la porte','la boîte','la fenêtre'];
const heldOut=[];
for(const person of people)for(const action of actions)for(const object of objects)
  heldOut.push({person,action,object});

test('60 unseen entity/action/object combinations generalize by composition',()=>{
 let passed=0;
 for(const sample of heldOut){
   const output=answerFrenchFromConversation({
     question:'Qui '+sample.action+' '+sample.object+' ?',
     history:[{role:'user',content:sample.person+' '+sample.action+' '+sample.object+'.'}],
   });
   assert.ok(output,'No answer for '+JSON.stringify(sample));
   assert.ok(fold(output.text).includes(fold(sample.person)),
      'Wrong agent for '+JSON.stringify(sample));
   passed++;
 }
 assert.equal(passed,60);
});

test('counterfactual correction ablation changes the local answer',()=>{
 const history=[{role:'user',content:'Luc ferme la porte.'}];
 const question='Qui ferme la porte ?';
 const baseline=answerFrenchFromConversation({question,history});
 const learned=parseFrenchCorrection('Non, Sara ferme la porte.');
 const after=answerFrenchFromConversation({
   question,history,storedCorrections:[learned],
 });
 assert.match(baseline?.text||'',/Luc/);
 assert.match(after?.text||'',/Sara/);
 assert.notEqual(baseline.text,after.text);
 assert.equal(answerFrenchFromConversation({question,history}).text,baseline.text);
});
