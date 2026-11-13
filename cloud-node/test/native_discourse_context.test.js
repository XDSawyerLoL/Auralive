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
