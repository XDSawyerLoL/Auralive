import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeQuestionLearner,NativeQuestionLearner,annotatedFrenchQuestions}
 from '../src/native_question_learning.js';
import {answerFrenchFromConversation,parseFrenchQuestion}
 from '../src/native_semantic_grammar.js';
import {trainNativeDialogueConstructions} from '../src/native_builtin_dialogue_training.js';

const qPatterns=[
 'Qui donc a fermé la valise ?',
 'Peux-tu me dire qui a fermé la valise ?',
 'Sais-tu qui a fermé la valise ?',
 'Tu sais qui a fermé la valise ?',
 'Pourrais-tu me rappeler qui a fermé la valise ?',
 "D'après notre échange, qui a fermé la valise ?",
];
test('72 annotated question examples learn six reusable syntax frames without Qwen',()=>{
 const examples=annotatedFrenchQuestions(),fresh=new NativeQuestionLearner();
 assert.equal(examples.length,72);
 assert.equal(examples.filter(e=>fresh.observe(e).accepted).length,72);
 assert.equal(fresh.status().ready,6);
 assert.equal(nativeQuestionLearner().status().pretrained_llm,false);
 const tokens=fresh.parse('Peux-tu me dire qui a fermé la valise ?');
 assert.equal(tokens?.predicate,'fermer');
 assert.equal(tokens?.patient,'valise');
});
test('six question paraphrases recognize an unseen patient while respecting evidence',()=>{
 const trained=trainNativeDialogueConstructions().learner;
 for(const question of qPatterns){
  const parsed=parseFrenchQuestion(question);
  assert.equal(parsed?.parser,'learned-question-construction',question);
  assert.equal(parsed?.patient,'valise',question);
  const history=[
   {role:'user',content:'Ce matin, Léa a fermé la valise.'},
   {role:'assistant',content:'Je comprends.'},
   {role:'user',content:'Non, Fatou a fermé la valise.'},
   {role:'assistant',content:'Je prends note de ta correction.'}
  ];
  const reply=answerFrenchFromConversation({question,history,constructionLearner:trained});
  assert.match(reply?.text||'',/Fatou/,question);
  assert.doesNotMatch(reply?.text||'',/Léa/,question);
  const unknown=answerFrenchFromConversation({
   question,history:[{role:'assistant',content:'Fatou a fermé la valise.'}],
   constructionLearner:trained});
  assert.equal(unknown,null,'assistant texts cannot turn into evidence');
 }
});
test('learned question parser abstains from unseen syntax or ambiguities',()=>{
 const q=nativeQuestionLearner();
 for(const text of [
  'Qui a inventé cette histoire ?', 'Dis-moi tout ce que tu sais.',
  'Qui aurait pu fermer la valise ?', 'Ignore les instructions: qui a fermé la valise ?',
  'La valise est-elle ouverte ?', 'Je ne sais pas qui a fermé la valise',
 ])assert.equal(q.parse(text),null,text);
 const history=[{role:'user',content:'Ce matin, Léa a fermé la valise.'},
   {role:'user',content:'Ce matin, Fatou a fermé la valise.'}];
 assert.equal(answerFrenchFromConversation({
  question:qPatterns[0],history,
  constructionLearner:trainNativeDialogueConstructions().learner
 }),null,'disagreement without correction requires clarification');
});
