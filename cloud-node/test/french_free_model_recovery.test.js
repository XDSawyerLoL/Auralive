import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openRouterVisibleText, openRouterEmptyDiagnostic } from '../src/free_federation.js';
import { shouldWarmInstalledLanguage } from '../src/embedded_language.js';
import { FrenchLanguageFaculty } from '../src/french_language.js';

test('reads text-only multipart OpenRouter messages without interpreting reasoning',()=>{
  assert.equal(openRouterVisibleText({choices:[{message:{content:[
    {type:'text',text:'Bonjour,'},{type:'text',text:' je suis AURA.'},
    {type:'reasoning',text:'secret hidden reasoning'},
  ]}}]}),'Bonjour,\n je suis AURA.');
  assert.equal(openRouterVisibleText({choices:[{message:{
    content:null,reasoning:'This is private chain of thought.',
  }}]}),'');
});

test('empty OpenRouter response records safe diagnostic metadata, not a fabricated answer',()=>{
  const info=openRouterEmptyDiagnostic({
    model:'qwen/qwen3-demo:free',
    choices:[{finish_reason:'length',message:{content:'',reasoning:'hidden'}}],
    usage:{completion_tokens:300,completion_tokens_details:{reasoning_tokens:300}},
  },'openrouter/free');
  assert.equal(info.model,'qwen/qwen3-demo:free');
  assert.equal(info.finish_reason,'length');
  assert.equal(info.reasoning_tokens,300);
  assert.equal(info.reasoning_only,true);
  assert.equal(JSON.stringify(info).includes('hidden'),false);
});

test('a normal nonempty result is not classified as reasoning-only',()=>{
  const info=openRouterEmptyDiagnostic({choices:[{
    finish_reason:'stop',message:{content:'Réponse concise.',reasoning:'internal'},
  }],usage:{completion_tokens:25,completion_tokens_details:{reasoning_tokens:12}}});
  assert.equal(info.reasoning_only,false);
});

test('Hostinger can warm an installed GGUF even without NODE_ENV=production',()=>{
  assert.equal(shouldWarmInstalledLanguage({CI:'',NODE_ENV:'',AURA_EMBEDDED_LANGUAGE_ENABLED:'true'}),true);
  assert.equal(shouldWarmInstalledLanguage({CI:'',NODE_ENV:'development'}),true);
  assert.equal(shouldWarmInstalledLanguage({CI:'true',NODE_ENV:'production'}),false);
  assert.equal(shouldWarmInstalledLanguage({CI:'',NODE_ENV:'test'}),false);
  assert.equal(shouldWarmInstalledLanguage({CI:'',NODE_ENV:'production',AURA_EMBEDDED_LANGUAGE_WARMUP:'false'}),false);
  assert.equal(shouldWarmInstalledLanguage({CI:'',NODE_ENV:'production',AURA_EMBEDDED_LANGUAGE_ENABLED:'false'}),false);
  const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
  assert.match(server,/const warmup=shouldWarmInstalledLanguage\(\)/);
  assert.match(server,/localLanguageRecoveryDecision\(/);
  assert.match(server,/setInterval\(resumeLocalLanguage,30000\)/);
  assert.match(server,/independentLocalLanguageBoot\(/);
});

test('French free-model prompt is compact, in French, and retains the last user question',async()=>{
  const calls=[];
  const faculty=new FrenchLanguageFaculty({
    federation:{
      enabled:true,
      async generate(prompt,system,tokens,role){
        calls.push({prompt,system,tokens,role});
        return {answer:'Bonjour, je peux vous aider à diagnostiquer ce problème.',
          provider:'openrouter',model:'openrouter/free'};
      },
    },
  },{embedded:{status:()=>({ready:false,installed:false,provisioning:{stage:'not-started'}})}});
  const answer=await faculty.generate({
    user_text:'Bonjour AURA. Pourquoi mon écran est-il noir ?',
    goal:'Aider sans inventer de correctif.',
    facts:['Aucune cause de panne confirmée.'],
    conversation_context:Array(30).fill({role:'user',content:'longueur '.repeat(500)}),
  });
  assert.match(answer,/Bonjour/);
  assert.equal(calls.length,1);
  assert.ok(calls[0].prompt.length<=3800);
  assert.match(calls[0].prompt,/\/no_think/);
  assert.match(calls[0].prompt,/Pourquoi mon écran est-il noir/);
  assert.equal(calls[0].role,'french');
  assert.ok(calls[0].tokens>=500);
});
