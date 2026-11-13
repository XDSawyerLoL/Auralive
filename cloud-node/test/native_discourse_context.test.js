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
