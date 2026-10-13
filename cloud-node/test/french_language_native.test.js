import test from 'node:test';
import assert from 'node:assert/strict';
import {FrenchLanguageFaculty,nativeFrenchExpressionPrompt,nativeFrenchResponseBudget} from '../src/french_language.js';

test('native French greeting preserves real user text before all cognitive metadata',()=>{
  const plan={
    user_text:'salut',
    goal:'Répondre à la salutation en gardant une voix naturelle',
    act:'greet',
    facts:['AURA ne doit pas inventer de mission accomplie'],
    experiential_memory:[{note:'X'.repeat(10000)}],
    conversation_context:[{content:'test passé'}],
  };
  const compact=nativeFrenchExpressionPrompt(plan);
  assert.ok(compact.startsWith('Message utilisateur : salut'));
  assert.match(compact,/Intention du noyau AURA/);
  assert.ok(compact.length<951);
  assert.doesNotMatch(compact,/experiential_memory|user_text|"goal"|"act"/);
  assert.equal(nativeFrenchResponseBudget(plan),28);
});
test('normal French prompt retains question and facts while respecting input budget',()=>{
  const plan={user_text:'Pourquoi le serveur ne répond-il pas lorsque le processus natif est encore actif ?',
    goal:'Distinguer les événements observables des hypothèses et fournir une prochaine vérification',
    act:'explain',
    facts:['Une inférence de 3 tokens est vérifiée','Le chat normal a dépassé 75 secondes'],
    semantic_support:'Le test de santé a répondu OK.',
    external_research_summary:'Ne pas inventer de données.',
    conversation_context:[{content:'X'.repeat(1000)},{content:'Y'.repeat(1000)}],
  };
  const compact=nativeFrenchExpressionPrompt(plan);
  assert.match(compact,/^Message utilisateur : Pourquoi le serveur/);
  assert.match(compact,/3 tokens/);
  assert.match(compact,/Intention du noyau/);
  assert.ok(compact.length<=950);
  assert.equal(nativeFrenchResponseBudget(plan),48);
});
test('real embedded French faculty sends compact plan and short generation budget',async()=>{
  const calls=[];
  const stub={installed:()=>true,canProvision:()=>false,
    generate:async (...args)=>{calls.push(args);return 'Bonjour, je suis là.';},
    status:()=>({ready:true})};
  const language=new FrenchLanguageFaculty(null,{embedded:stub});
  const plan={user_text:'salut',goal:'Accueillir naturellement',act:'greet',
    conversation_context:[{role:'user',content:'Salut, comment vas-tu ?'}],
    experiential_memory:[{note:'Q'.repeat(20000)}]};
  const text=await language.generate(plan,{maxTokens:700});
  assert.equal(text,'Bonjour, je suis là.');
  assert.equal(calls.length,1);
  assert.equal(calls[0][2],28);
  assert.match(calls[0][0],/^Message utilisateur : salut/);
  assert.ok(calls[0][0].length<951);
  assert.ok(calls[0][1].length<300);
  assert.doesNotMatch(calls[0][0],/QQQQQQQQQQ/);
});
