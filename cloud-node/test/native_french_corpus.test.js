import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeFrenchCorpus,NativeFrenchCorpus} from '../src/native_french_corpus.js';
test('licensed grammar trained on genuine French GSD words is loaded offline',()=>{
 const status=nativeFrenchCorpus.status();
 assert.equal(status.ready,true);
 assert.ok(status.stats.training_words>280000);
 assert.ok(status.stats.lexical_entries>=13000);
 assert.ok(status.stats.pos_grammar_patterns>500);
 assert.equal(status.stats.dataset,'UD_French-GSD');
 assert.equal(status.stats.license,'CC BY-SA 4.0');
});
test('inflections and agreement are read from corpus rather than guessed',()=>{
 assert.equal(nativeFrenchCorpus.inflect('être','AUX',{
   Mood:'Ind',Tense:'Pres',Person:'1',Number:'Sing',VerbForm:'Fin',
 }),'suis');
 assert.equal(nativeFrenchCorpus.realizeFrame({
   origin:'nucleus-verified-semantic-frame',evidence_verified:true,
   person:1,number:'Sing',verb:'être',
   complement_kind:'adjective',complement_lemma:'calme',
 }),'Je suis calme.');
 assert.ok(nativeFrenchCorpus.grammarFrequency(['PRON','AUX','ADJ'])>0);
});
test('unsupported intentions and unverifiable facts fail closed',()=>{
 assert.equal(nativeFrenchCorpus.realizePlan({act:'respond',facts:['La lune est en fromage']}),null);
 assert.equal(nativeFrenchCorpus.realizeFrame({
   origin:'user-supplied-text',evidence_verified:true,person:1,number:'Sing',
   verb:'être',complement_kind:'adjective',complement_lemma:'calme',
 }),null);
 assert.equal(nativeFrenchCorpus.realizeFrame({
   origin:'nucleus-verified-semantic-frame',evidence_verified:false,
   person:1,number:'Sing',verb:'être',complement_kind:'adjective',
   complement_lemma:'calme',
 }),null);
 assert.equal(nativeFrenchCorpus.realizeFrame({
   origin:'nucleus-verified-semantic-frame',evidence_verified:true,
   person:1,number:'Sing',verb:'être',complement_kind:'adjective',
   complement_lemma:'inventée',
 }),null);
});
test('no vocabulary means no invented morphology, with a transparent limited status',()=>{
 const bad=new NativeFrenchCorpus({data:{schema:'invalid'}});
 assert.equal(bad.status().ready,false);
 assert.equal(bad.realizePlan({act:'self_name'}),null);
 assert.equal(bad.inflect('être','AUX',{Person:'1'}),null);
});
