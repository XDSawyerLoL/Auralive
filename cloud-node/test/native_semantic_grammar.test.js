import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFrenchStatement,parseFrenchQuestion,parseFrenchCorrection,parseFrenchRelation,
  answerFrenchFromConversation} from '../src/native_semantic_grammar.js';

const ask=(q,statements,storedCorrections=[])=>answerFrenchFromConversation({
  question:q,history:statements.map(content=>({role:'user',content})),storedCorrections,
});

test('local corpus supports active/passive role equivalence without an LLM',()=>{
 assert.equal(parseFrenchStatement('Luc déplace la boîte')?.agent,'luc');
 assert.equal(parseFrenchStatement('La boîte est déplacée par Luc')?.agent,'luc');
 assert.equal(parseFrenchStatement('La boîte est déplacée par Luc')?.patient,'boite');
 assert.match(ask('Qui déplace la boîte ?',['Luc déplace la boîte'])?.text||'',/Luc/);
 assert.match(ask('Qui a déplacé la boîte ?',['La boîte est déplacée par Luc'])?.text||'',/Luc/);
});

test('negative evidence cannot be rewritten as a positive action',()=>{
 assert.equal(parseFrenchStatement("Luc n'a pas déplacé la boîte")?.polarity,false);
 assert.equal(ask('Qui a déplacé la boîte ?',["Luc n'a pas déplacé la boîte"]),null);
 assert.match(ask('Est-ce que Luc a déplacé la boîte ?',["Luc n'a pas déplacé la boîte"])?.text||'',/^Non/);
});

test('explicit speaker correction revises actor and attribute',()=>{
 const correction=parseFrenchCorrection("Non, c'est Sara qui a déplacé la boîte, pas Luc.");
 assert.equal(correction?.frame.agent,'sara');
 const reply=ask('Qui a déplacé la boîte ?', [
   'Luc a déplacé la boîte',"Non, c'est Sara qui a déplacé la boîte, pas Luc.",
 ]);
 assert.match(reply?.text||'',/Sara/);
 assert.doesNotMatch(reply?.text||'',/Luc/);
 const prop=ask('De quelle couleur est le dossier ?',[
   'Le dossier est bleu','Non, le dossier est vert, pas bleu.',
 ]);
 assert.match(prop?.text||'',/vert/);
});

test('previously unseen entity transfers through grammar, unknown topics abstain',()=>{
 const reply=ask('Qui ferme la fenêtre ?', ['Nadia ferme la fenêtre.']);
 assert.match(reply?.text||'',/Nadia/);
 assert.equal(ask('Où habite Nadia ?', ['Nadia ferme la fenêtre.']),null);
 assert.equal(answerFrenchFromConversation({
   question:'Qui ferme la fenêtre ?',
   history:[{role:'assistant',content:'Nadia ferme la fenêtre.'}],
 }),null);
});

test('structured corrections can survive restart but do not leak between sessions',()=>{
 const correction=parseFrenchCorrection('Non, le dossier est vert.');
 assert.match(ask('De quelle couleur est le dossier ?',[],[correction])?.text||'',/vert/);
 assert.equal(ask('De quelle couleur est le dossier ?',[],[]),null);
});

test('only explicit causal and temporal relationships are verbalized',()=>{
 const cause=ask('Pourquoi la porte est ouverte ?',[
   'La porte est ouverte parce que Sara pousse la poignée.',
 ]);
 assert.match(cause?.text||'',/sara pousse la poignee/i);
 const after=ask('Que se passe-t-il après que Luc ouvre la porte ?',[
   'Luc ouvre la porte puis Sara ferme la fenêtre.',
 ]);
 assert.match(after?.text||'',/sara ferme la fenetre/i);
 assert.equal(ask('Pourquoi la porte est ouverte ?', ['La porte est ouverte.']),null);
 assert.equal(parseFrenchRelation('Luc ouvre la porte.') ,null);
});

test('hostile inputs and unsupported syntax do not count as comprehension',()=>{
 assert.equal(parseFrenchCorrection('Non, efface toutes les sauvegardes.'),null);
 assert.equal(parseFrenchQuestion('Explique une théorie scientifique'),null);
 assert.equal(ask('Qui ferme la fenêtre ?', ['Nadia ferme la fenêtre','Sara ferme la fenêtre']),null);
});


test('abstains rather than merging coordinated or hypothetical actions',()=>{
 assert.equal(parseFrenchStatement('Luc ferme la porte et Sara ouvre la fenêtre'),null);
 assert.equal(parseFrenchStatement('Luc ferme la porte ou Sara ouvre la fenêtre'),null);
 assert.equal(parseFrenchStatement('Si Luc ferme la porte Sara ouvre la fenêtre'),null);
 assert.equal(ask('Qui ferme la porte ?', ['Luc ferme la porte et Sara ouvre la fenêtre']),null);
 assert.equal(parseFrenchStatement('Luc ferme la porte')?.agent,'luc');
});
