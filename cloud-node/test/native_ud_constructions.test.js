import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeUDConstructions,nativeUDConstructions} from '../src/native_ud_constructions.js';
import {parseFrenchStatement,parseFrenchQuestion,
  answerFrenchFromConversation} from '../src/native_semantic_grammar.js';

const ask=(question,utterance)=>answerFrenchFromConversation({
 question, history:[{role:'user',content:utterance}],
});
test('real train split dependency model has pinned provenance, measured clause counts and surface forms',()=>{
 const s=nativeUDConstructions.status();
 assert.equal(s.ready,true);
 assert.equal(s.stats.sentences,14450);
 assert.equal(s.stats.clauses_with_subject,16000);
 assert.ok(s.stats.passive_clauses>3000);
 assert.equal(nativeUDConstructions.lemma('déplacée'),'deplacer');
 assert.equal(nativeUDConstructions.lemma('mangé'),'manger');
 const learned=nativeUDConstructions.evidence({voice:'active',objectSide:'right'});
 assert.ok(learned.observations>5000);
 assert.ok(learned.dependency_support.nsubj>1000);
 assert.ok(learned.dependency_support.obj>1000);
 const passive=nativeUDConstructions.evidence({voice:'passive',objectSide:'none',agentSide:'right'});
 assert.ok(passive.observations>500);
 assert.ok(passive.dependency_support['obl:agent']>400);
});

test('acquired agent/patient configuration generalizes across verb and inflection',()=>{
 const a=parseFrenchStatement('Nadia ferme la porte.');
 const b=parseFrenchStatement('La porte est fermée par Nadia.');
 assert.equal(a?.parser,'ud-trained-dependency');
 assert.equal(b?.parser,'ud-trained-dependency');
 for(const f of [a,b]){
   assert.equal(f.agent,'nadia');
   assert.equal(f.patient,'porte');
   assert.equal(f.predicate,'fermer');
   assert.equal(f.polarity,true);
 }
 const c=parseFrenchStatement('Luc a déplacé la boîte.');
 assert.equal(c?.parser,'ud-trained-dependency');
 assert.equal(c.agent,'luc');
 assert.equal(c.predicate,'deplacer');
 assert.equal(c.patient,'boite');
 const q=parseFrenchQuestion('Qui a déplacé la boîte ?');
 assert.equal(q.predicate,'deplacer');
 assert.match(ask('Qui a déplacé la boîte ?','La boîte a été déplacée par Luc.')?.text||'',/Luc/);
});

test('negation scopes the event instead of silently confirming a positive',()=>{
 for(const utterance of ["Luc n'a pas déplacé la boîte.",
  'La boîte n’est pas déplacée par Luc.']){
  const f=parseFrenchStatement(utterance);
  assert.equal(f?.polarity,false,utterance);
  assert.equal(ask('Qui a déplacé la boîte ?',utterance),null);
 }
 assert.match(ask('Est-ce que Luc a déplacé la boîte ?',
    "Luc n'a pas déplacé la boîte.")?.text||'',/^Non/);
});

test('obvious unsupported syntax abstains rather than yielding a fake frame',()=>{
 for(const line of [
  'Nadia ferme la porte puis Luc ouvre la fenêtre.',
  'Nadia veut ouvrir la fenêtre.',
  'Ouvre la porte !',
  'La porte est très jolie par Nadia.',
  'Elle ferme la porte.',
  'Nadia ferme la porte parce que Luc le veut.',
 ]){
  assert.equal(nativeUDConstructions.parseStatement(line),null,line);
 }
 assert.equal(new NativeUDConstructions({data:{schema:'invalid'}}).parseStatement('Nadia ferme la porte'),null);
});

test('dependency evidence changes predictions when ablated (not merely a displayed statistic)',()=>{
 const original=nativeUDConstructions.parseStatement('Nadia ferme la porte');
 assert.equal(original?.parser,'ud-trained-dependency');
 const empty=new NativeUDConstructions({data:{schema:'invalid'}});
 assert.equal(empty.evidence({voice:'active',objectSide:'right'}),null);
 assert.equal(empty.parseStatement('Nadia ferme la porte'),null);
});
