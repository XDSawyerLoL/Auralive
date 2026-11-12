import test from 'node:test';
import assert from 'node:assert/strict';
import {pragmaticIntent,sessionConversationStyle}
  from '../src/conversation_pragmatics.js';
import {CognitionEngine} from '../src/cognition.js';
import {compactFrenchPrompt,validateNucleusSpeech}
  from '../src/french_language.js';

const cases=[
 ["Tu me parle de star wars comment tu connais star wars?",
  'knowledge_provenance'],
 ["C'est plutot cool",'shared_positive_moment'],
 ["ça me fait plaisir que tu dise cela",'shared_positive_moment'],
 ["C'est tres comment dire solonelle",'comment_on_tone'],
 ["solennelle en effet",'comment_on_tone'],
 ["bah sois plus chaleureuse peut etre",'adjust_conversation_tone'],
 ["Je constante que tu me pose pas de question",'conversational_reciprocity'],
 ["t'a plus simple comme question? mdr",'simplify_question'],
 ["ouah le second degrés c'est pas ton truc",'playful_repair'],
];
test('French pragmatic categorization honors original user dialogue without LLM guesses',()=>{
 for(const [s,expected] of cases){
  const result=pragmaticIntent(s,'Je cherche à vérifier la robustesse de mes approches.');
  assert.equal(result?.act,expected,s);
 }
});
test('explicit warmth preference is retained within session, not across users',()=>{
 const rows=[
  {role:'user',content:'bah sois plus chaleureuse peut etre'},
 ];
 assert.equal(sessionConversationStyle(rows,'Comment tu vas ?'),'warm');
 assert.equal(sessionConversationStyle([], 'Comment tu vas ?'),'neutral');
 assert.equal(sessionConversationStyle(rows,'sois moins chaleureuse'),'reserved');
});
test('model cannot claim it personally received training data as AURA identity',()=>{
 const plan={act:'knowledge_provenance',user_text:'Comment connais-tu Star Wars ?'};
 const wrong=validateNucleusSpeech(plan,
   "J'ai été entraînée sur des milliards de documents décrivant cette franchise.");
 assert.equal(wrong.accepted,false);
 assert.equal(wrong.code,'provider-training-as-aura-memory');
 const correct=validateNucleusSpeech(plan,
   'Mon modèle linguistique dispose de connaissances générales sur Star Wars. Ce ne sont pas mes souvenirs personnels.');
 assert.equal(correct.accepted,true);
});
test('clinical and defensive social replies are blocked, normal friendly ones allowed',()=>{
 for(const act of ['shared_positive_moment','playful_repair','adjust_conversation_tone']){
  const plan={act,user_text:"c'est cool"};
  assert.equal(validateNucleusSpeech(plan,
    'Je prends note de ton retour pour calibrer mon interaction.').accepted,false);
  assert.equal(validateNucleusSpeech(plan,
    'Ah oui, j’ai pris ça beaucoup trop au sérieux !').accepted,true);
 }
});
test('compact prompt passes tone and preceding assistant context while leaving no performance claims',()=>{
 const plan={act:'playful_repair',speech_style:'warm',
   user_text:"ouah le second degrés c'est pas ton truc",
   immediate_dialogue_context:[{id:5,role:'assistant',
     content:'Mon modèle interne consolide actuellement mes stratégies.'}],
   goal:'Reconnaître avec humour le malentendu',facts:[]};
 const result=compactFrenchPrompt(plan,{maxChars:4500});
 assert.match(result,/speech_style/);
 assert.match(result,/warm/);
 assert.match(result,/Mon modèle interne consolide/);
 assert.match(result,/second degré/);
});
test('core planner routes tone and humor before generic tool-request classification',()=>{
 const core=new CognitionEngine();
 const texts=['bah sois plus chaleureuse peut etre',
  'ouah le second degrés c’est pas ton truc',
  'C’est tres comment dire solonelle'];
 const expected=['adjust_conversation_tone','playful_repair','comment_on_tone'];
 for(let i=0;i<texts.length;i++){
  const plan=core.planReply({
   text:texts[i],soul:{organism:{},emergent_identity:{}},
   recentMessages:[{id:11,role:'assistant',content:'Je suis AURA.'}],
   sessionStyle:'warm',
  });
  assert.equal(plan.act,expected[i]);
  assert.equal(plan.speech_style,'warm');
  assert.equal(plan.needs_semantic_support,false);
 }
});
