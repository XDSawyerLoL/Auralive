import test from 'node:test';
import assert from 'node:assert/strict';
import {answerFrenchFromConversation} from '../src/native_semantic_grammar.js';
import {trainNativeDialogueConstructions} from '../src/native_builtin_dialogue_training.js';
const ask=(question,history)=>answerFrenchFromConversation({question,history:history.map(row=>
 typeof row==='string'?{role:'user',content:row}:row),
 constructionLearner:trainNativeDialogueConstructions().learner});
test('AURA synthesizes several user-reported events across a multi-turn dialogue',()=>{
 const result=ask("Récapitule ce que je t'ai dit ?",[
  'Ce matin, Léa a fermé le coffre.',
  {role:'assistant',content:'Et ensuite ?'},
  'Au bureau, Fatou a signé le dossier.',
  'Après la réunion, Victor a ouvert la porte.'
 ]);
 assert.equal(result?.coverage,'bounded-multiturn-attributed-summary');
 assert.match(result?.text||'',/D’après les événements que tu as rapportés/);
 assert.match(result?.text||'',/Léa aurait fermé le coffre/i);
 assert.match(result?.text||'',/Fatou aurait signé le dossier/i);
 assert.match(result?.text||'',/Victor aurait ouvert la porte/i);
});
test('summary scoped to a named actor does not leak another actor or invented assistant facts',()=>{
 const history=['Ce matin, Léa a fermé le coffre.',
  'Au bureau, Fatou a signé le dossier.',
  {role:'assistant',content:'Léa a ouvert la lune.'}];
 const reply=ask("Qu'est-ce que tu sais sur Léa ?",history);
 assert.match(reply?.text||'',/Léa aurait fermé le coffre/i);
 assert.doesNotMatch(reply?.text||'',/Fatou|lune/i);
});
test('corrected story summarizes only revised actor and not withdrawn assertion',()=>{
 const reply=ask('Résume les événements ?',[
  'Ce matin, Léa a fermé le coffre.',
  'Non, Fatou a fermé le coffre.',
  'Au bureau, Victor a signé le contrat.'
 ]);
 assert.match(reply?.text||'',/Fatou/);
 assert.doesNotMatch(reply?.text||'',/Léa/);
 assert.match(reply?.text||'',/Victor/);
});
test('negation, hypothetical, future, and unknown summaries produce no invented event',()=>{
 const reply=ask("Récapitule ce que je t'ai dit ?",[
  "Ce matin, Léa n'a pas fermé le coffre.",
  'Si Victor a ouvert la porte, Fatou sera contente.',
  'Demain, Fatou va signer le dossier.',
  {role:'assistant',content:'Léa a ouvert la porte.'}
 ]);
 assert.equal(reply,null);
 assert.equal(ask('Que sais-tu sur Nadia ?',[
  'Ce matin, Léa a fermé le coffre.'
 ]),null);
});
