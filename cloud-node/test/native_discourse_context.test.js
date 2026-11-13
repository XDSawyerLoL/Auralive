import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBoundedDiscourse} from '../src/native_discourse_context.js';
import {parseFrenchStatement,answerFrenchFromConversation}
  from '../src/native_semantic_grammar.js';

test('third-person pronoun resolves only when explicit patient gender excludes it',()=>{
  const frames=parseBoundedDiscourse(
    'Luc ferme la porte puis il ouvre la fenêtre',parseFrenchStatement);
  assert.equal(frames.length,2);
  assert.equal(frames[0].frame?.agent,'luc');
  assert.equal(frames[1].resolved,true);
  assert.equal(frames[1].frame?.agent,'luc');
  assert.equal(frames[1].frame?.patient,'fenetre');
});

test('bounded discourse is available to conversational Q&A with user-statement provenance',()=>{
  const answer=answerFrenchFromConversation({
    question:'Qui a ouvert la fenêtre ?',
    history:[{role:'user',content:'Luc ferme la porte puis il ouvre la fenêtre.'}],
  });
  assert.match(answer?.text||'',/Luc/);
  assert.equal(answer?.evidence_scope,'same-session-user-statement-unverified');
});

test('ambiguous anaphora and ungrounded pronouns abstain',()=>{
  for(const source of [
    'Nadia ferme la porte puis elle ouvre la fenêtre',
    'Elle ouvre la fenêtre',
    'Luc ferme le portail puis il ouvre la fenêtre',
    'Luc ferme la porte puis ils ouvrent la fenêtre',
  ]){
    const frames=parseBoundedDiscourse(source,parseFrenchStatement);
    assert.equal(frames.at(-1)?.frame,null,source);
  }
  assert.equal(answerFrenchFromConversation({
    question:'Qui a ouvert la fenêtre ?',
    history:[{role:'user',content:'Nadia ferme la porte puis elle ouvre la fenêtre'}],
  }),null);
});

test('no freeform subordinate guessing or malformed conversational evidence',()=>{
  assert.equal(parseFrenchStatement('Luc dit que Nadia ouvre la fenêtre'),null);
  assert.equal(parseBoundedDiscourse('Luc ferme la porte ? puis il ouvre la fenêtre',
    parseFrenchStatement).length,0);
});

test('explicit completed after-that clauses preserve both event roles',()=>{
 const result=answerFrenchFromConversation({
   question:'Qui a ouvert la fenêtre ?',
   history:[{role:'user',content:'Après que Luc a fermé la porte, Nadia ouvre la fenêtre.'}],
 });
 assert.match(result?.text||'',/Nadia/);
 const reversed=answerFrenchFromConversation({
   question:'Qui a fermé la porte ?',
   history:[{role:'user',content:'Nadia ouvre la fenêtre après que Luc a fermé la porte.'}],
 });
 assert.match(reversed?.text||'',/Luc/);
});

test('subject relative with overt antecedent yields two independently attributed events',()=>{
 const history=[{role:'user',content:'Luc, qui ferme la porte, ouvre la fenêtre.'}];
 assert.match(answerFrenchFromConversation({
   question:'Qui a fermé la porte ?',history,
 })?.text||'',/Luc/);
 assert.match(answerFrenchFromConversation({
   question:'Qui a ouvert la fenêtre ?',history,
 })?.text||'',/Luc/);
});

test('conditional, hypothetical, and ambiguous subordinate assertions are not facts',()=>{
 for(const content of [
   'Si Luc ferme la porte, Nadia ouvre la fenêtre.',
   'Quand Luc ferme la porte, Nadia ouvre la fenêtre.',
   'Luc dit que Nadia ouvre la fenêtre.',
   'Luc ferme la porte avant que Nadia ouvre la fenêtre.',
   'La porte que Luc ferme est rouge.',
 ]){
   assert.equal(answerFrenchFromConversation({
     question:'Qui a ouvert la fenêtre ?',
     history:[{role:'user',content}],
   }),null,content);
 }
});


test('observed UD cleft construction binds a new named actor without changing lexical rules',()=>{
 const history=[{role:'user',content:"C'est Romain qui ouvre la fenêtre."}];
 const result=answerFrenchFromConversation({history,question:'Qui a ouvert la fenêtre ?'});
 assert.match(result?.text||'',/Romain/);
 assert.equal(result?.evidence_scope,'same-session-user-statement-unverified');
});
test('unsupported clefts abstain instead of interpreting modal, hypothetical or negated facts',()=>{
 for(const line of [
   "C'est le chat qui ouvre la fenêtre.",
   "Ce n'est pas Romain qui ouvre la fenêtre.",
   "C'est Romain qui dit que Julie ouvre la fenêtre.",
   "C'est Romain qui pense ouvrir la fenêtre.",
   "Si c'est Romain qui ouvre la fenêtre, Julie ferme la porte.",
 ]){
  assert.equal(answerFrenchFromConversation({history:[{role:'user',content:line}],
    question:'Qui a ouvert la fenêtre ?'}),null,line);
 }
});


test('multiple overt agents with same patient must not yield an invented unique actor',()=>{
 const answer=answerFrenchFromConversation({
  question:'Qui a ouvert la porte ?',
  history:[{role:'user',content:'Romain ouvre la porte. Mélanie ouvre aussi la porte.'}]
 });
 assert.equal(answer,null);
});
test('independent object cannot be silently merged to force a false actor answer',()=>{
 const answer=answerFrenchFromConversation({
  question:'Qui a ouvert la fenêtre ?',
  history:[{role:'user',content:'Romain ouvre la fenêtre. Mélanie ferme le portail.'}]
 });
 assert.match(answer?.text||'',/Romain/);
});


test('coordinated clauses with a unique pronoun antecedent preserve actor and object',()=>{
 const result=answerFrenchFromConversation({
  history:[{role:'user',content:'Romain ferme la porte et il ouvre le tiroir.'}],
  question:'Qui a ouvert le tiroir ?'
 });
 assert.match(result?.text||'',/Romain/);
});
test('coordinated clauses with competing same-gender patient abstain',()=>{
 const result=answerFrenchFromConversation({
  history:[{role:'user',content:'Romain ferme le portail et il ouvre le tiroir.'}],
  question:'Qui a ouvert le tiroir ?'
 });
 assert.equal(result,null);
});
test('fronted object with overt clitic and compatible past participle is reconstructed',()=>{
 const result=answerFrenchFromConversation({
  history:[{role:'user',content:"La porte, Mélanie l'a ouverte."}],
  question:'Qui a ouvert la porte ?'
 });
 assert.match(result?.text||'',/Melanie/);
});
test('fronted object rejects absent clitic and inconsistent agreement',()=>{
 for(const line of [
  'La porte, Mélanie a ouverte.',
  "La porte, Mélanie l'a ouvert.",
  "Le portail, Mélanie l'a ouverte.",
  "La porte, elle l'a ouverte."
 ]){
  assert.equal(answerFrenchFromConversation({
   history:[{role:'user',content:line}],
   question:'Qui a ouvert la porte ?'
  }),null,line);
 }
});
test('immediate prior user turn may ground a unique subject pronoun',()=>{
 const result=answerFrenchFromConversation({
  history:[{role:'user',content:'Romain ferme la porte.'},
           {role:'user',content:'Il ouvre ensuite le tiroir.'}],
  question:'Qui a ouvert le tiroir ?'
 });
 assert.match(result?.text||'',/Romain/);
});
test('anaphora cannot bridge a different speaker or ambiguous patient',()=>{
 for(const history of [
  [{role:'user',content:'Romain ferme le portail.'},
   {role:'user',content:'Il ouvre ensuite le tiroir.'}],
  [{role:'user',content:'Romain ferme la porte.'},
   {role:'assistant',content:'Voici une réponse.'},
   {role:'user',content:'Il ouvre ensuite le tiroir.'}],
 ]){
  assert.equal(answerFrenchFromConversation({
   history,question:'Qui a ouvert le tiroir ?'
  }),null);
 }
});
test('completed once-after construction supports a verified relative temporal order only',()=>{
 const result=answerFrenchFromConversation({
  history:[{role:'user',content:'Mélanie a ouvert le tiroir une fois que Romain a fermé la porte.'}],
  question:'Qui a fermé la porte ?'
 });
 assert.match(result?.text||'',/Romain/);
});
test('once-after present or hypothetical clauses never assert completed events',()=>{
 for(const line of [
  'Mélanie ouvre le tiroir une fois que Romain a fermé la porte.',
  'Mélanie ouvrira le tiroir une fois que Romain aura fermé la porte.',
  'Si Mélanie a ouvert le tiroir une fois que Romain a fermé la porte, Paul part.'
 ]){
  assert.equal(answerFrenchFromConversation({
   history:[{role:'user',content:line}],
   question:'Qui a fermé la porte ?'
  }),null,line);
 }
});
