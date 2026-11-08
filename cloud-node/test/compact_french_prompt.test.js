import test from 'node:test';
import assert from 'node:assert/strict';
import { FrenchLanguageFaculty, compactFrenchPrompt, compactFrenchSystem } from '../src/french_language.js';

test('Qwen3 compact French prompt disables thinking to preserve response tokens',()=>{
  const prompt=compactFrenchPrompt({
    user_text:'Salut AURA, pourquoi mon lecteur SWAPP est noir ?',
    goal:'expliquer une hypothèse sans prétendre avoir réparé',
    facts:['La capture Edge est noire.'],
    conversation_context:[{role:'user',content:'J’utilise Edge.'},{role:'assistant',content:'Je vais distinguer les étapes.'}],
  });
  assert.ok(prompt.startsWith('/no_think'));
  assert.match(prompt,/lecteur SWAPP/);
  assert.match(prompt,/capture Edge est noire/);
  assert.match(prompt,/Utilisateur : J’utilise Edge/);
  assert.match(prompt,/AURA : Je vais distinguer les étapes/);
  assert.ok(prompt.length<=2400);
  assert.match(compactFrenchSystem(),/français courant/);
});

test('compact French request bounds long conversational context to avoid exhausting local model',()=>{
  const prompt=compactFrenchPrompt({
    user_text:'Répète'.repeat(1000),
    conversation_context:Array.from({length:50},()=>({role:'user',content:'N'.repeat(1000)})),
    facts:Array(25).fill('T'.repeat(600)),
  });
  assert.ok(prompt.length<=2400);
  assert.ok(prompt.includes('/no_think'));
});

test('verified embedded French model receives the compact prompt and a bounded generation budget',async()=>{
  const calls=[];
  const embedded={
    status:()=>({installed:true,ready:true,provisioning:{stage:'installed-verified'}}),
    installed:()=>true,
    async generate(prompt,system,maxTokens){
      calls.push({prompt,system,maxTokens});
      return 'Bonjour, je peux regarder le problème avec toi sans prétendre l’avoir réglé.';
    },
  };
  const faculty=new FrenchLanguageFaculty({federation:{enabled:false},bridge:null},{embedded});
  const answer=await faculty.generate({user_text:'Bonjour, j’ai besoin de ton aide.',goal:'répondre'}, {maxTokens:900});
  assert.match(answer,/Bonjour/);
  assert.equal(calls.length,1);
  assert.ok(calls[0].prompt.startsWith('/no_think'));
  assert.ok(calls[0].maxTokens<=450);
  assert.ok(calls[0].prompt.length<=2400);
});
