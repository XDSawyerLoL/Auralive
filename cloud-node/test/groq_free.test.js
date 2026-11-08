import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateGroqFreeModel,groqFreeBody,groqVisibleAnswer,terminalGroqError} from '../src/groq_free.js';

const cwd=fileURLToPath(new URL('..',import.meta.url));
function child(script,override={}){
 const p=spawnSync(process.execPath,['--input-type=module','-e',script],{
  cwd,encoding:'utf8',timeout:20000,
  env:{...process.env,CI:'true',NODE_ENV:'test',
   AURA_ZERO_COST_MODE:'true',AI_MODE:'off',
   AURA_GROQ_FREE_ENABLED:'true',
   AURA_GROQ_FREE_PLAN_CONFIRMED:'true',AURA_GROQ_API_KEY:'test-key-only',
   AURA_GROQ_FREE_MAX_REQUESTS_PER_DAY:'5',
   AURA_OPENROUTER_API_KEY:'',DB_HOST:'',DATABASE_URL:'',
   ...override},
 });
 assert.equal(p.status,0,p.stderr||p.stdout);
 return JSON.parse(p.stdout.trim().split(/\r?\n/).at(-1));
}

test('only documented free Groq model IDs are accepted',()=>{
 assert.equal(validateGroqFreeModel('qwen/qwen3.8-27b'),true);
 assert.equal(validateGroqFreeModel('openai/gpt-oss-120b'),true);
 assert.equal(validateGroqFreeModel('llama-3.3-70b-versatile'),false);
 assert.equal(validateGroqFreeModel('minimaxai/minimax-m2.7'),false);
 assert.throws(()=>groqFreeBody('llama-3.3-70b-versatile','Bonjour','Français'),/allowlist/);
 const qwen=groqFreeBody('qwen/qwen3.8-27b','Bonjour','Français');
 assert.equal(qwen.reasoning_effort,'none');
 assert.equal(qwen.include_reasoning,false);
 assert.equal(qwen.stream,false);
 const gpt=groqFreeBody('openai/gpt-oss-120b','Bonjour','Français');
 assert.equal(gpt.reasoning_effort,'low');
});

test('only visible answer text may be spoken',()=>{
 assert.equal(groqVisibleAnswer({choices:[{message:{content:'Bonjour !',reasoning:'hidden'}}]}),'Bonjour !');
 assert.equal(groqVisibleAnswer({choices:[{message:{content:null,reasoning:'hidden'}}]}),'');
 assert.equal(terminalGroqError('Groq Free HTTP 429'),true);
 assert.equal(terminalGroqError('Groq Free HTTP 402'),true);
 assert.equal(terminalGroqError('Groq Free empty completion'),false);
});

test('Groq Free never makes a call when the account owner has not confirmed Free billing tier',()=>{
 const p=child([
  "import {GroqFreeProvider} from './src/groq_free.js';",
  "let calls=0;",
  "const x=new GroqFreeProvider({fetchFn:async()=>{calls++;throw Error('should not run');}});",
  "let error='';try{await x.generate('bonjour','FR');}catch(e){error=e.message;}",
  "console.log(JSON.stringify({enabled:x.enabled,calls,error}));",
 ].join('\n'),{AURA_GROQ_FREE_PLAN_CONFIRMED:'false'});
 assert.equal(p.enabled,false);assert.equal(p.calls,0);
 assert.match(p.error,/confirm/i);
});

test('Groq Qwen 3.8 Free generates a real French reply and disables internal reasoning',()=>{
 const p=child([
  "import {GroqFreeProvider} from './src/groq_free.js';",
  "import {AiClient} from './src/ai.js';",
  "let calls=[];",
  "const x=new GroqFreeProvider({fetchFn:async(url,options)=>{",
  "const body=JSON.parse(options.body);calls.push({url,body});",
  "return new Response(JSON.stringify({model:body.model,choices:[{message:{content:'Bonjour, je peux parler français.'}}]}),{status:200});",
  "}});",
  "const res=await x.generate('Salut','Français',700);",
  "console.log(JSON.stringify({calls,res,status:x.snapshot(),client:new AiClient().diagnostic()}));",
 ].join('\n'));
 assert.equal(p.calls.length,1);
 assert.equal(p.calls[0].url,'https://api.groq.com/openai/v1/chat/completions');
 assert.equal(p.calls[0].body.model,'qwen/qwen3.8-27b');
 assert.equal(p.calls[0].body.reasoning_effort,'none');
 assert.equal(p.calls[0].body.include_reasoning,false);
 assert.equal(p.res.costMicrounits,0);
 assert.equal(p.client.provider,'groq-free');
 assert.equal(p.status.last_status,'verified-text');
});

test('empty Qwen response retries ONCE with the other free model',()=>{
 const p=child([
  "import {GroqFreeProvider} from './src/groq_free.js';",
  "const calls=[];",
  "const x=new GroqFreeProvider({fetchFn:async(url,options)=>{",
  "const m=JSON.parse(options.body).model;calls.push(m);",
  "return new Response(JSON.stringify({model:m,choices:[{message:{content:calls.length===1?'':'Bonjour via GPT OSS !'}}]}),{status:200});",
  "}});",
  "const result=await x.generate('salut','FR');",
  "console.log(JSON.stringify({calls,result}));",
 ].join('\n'));
 assert.deepEqual(p.calls,['qwen/qwen3.8-27b','openai/gpt-oss-120b']);
 assert.match(p.result.answer,/GPT OSS/);
});

test('401,402,403,429 are terminal: no retry, no upgrade, no third-party billing',()=>{
 for(const status of [401,402,403,429]){
  const p=child([
   "import {GroqFreeProvider} from './src/groq_free.js';",
   "let calls=0;",
   "const x=new GroqFreeProvider({fetchFn:async()=>{calls++;return new Response('rejected',{status:Number(process.env.GROQ_TEST_STATUS)});}});",
   "let error='';try{await x.generate('salut','FR');}catch(e){error=e.message;}",
   "console.log(JSON.stringify({calls,error,status:x.snapshot()}));",
  ].join('\n'),{GROQ_TEST_STATUS:String(status)});
  assert.equal(p.calls,1,'status '+status);
  assert.match(p.error,new RegExp('HTTP '+status));
  if(status===429)assert.ok(p.status.cooldown_until);
 }
});

test('internal request cap stops repeated free calls and cannot enable paid models',()=>{
 const p=child([
  "import {GroqFreeProvider} from './src/groq_free.js';",
  "let calls=0;",
  "const x=new GroqFreeProvider({fetchFn:async(url,options)=>{calls++;",
  "return new Response(JSON.stringify({model:JSON.parse(options.body).model,choices:[{message:{content:'Bonjour.'}}]}),{status:200});",
  "}});",
  "let errors=[];for(let i=0;i<5;i++){try{await x.generate('salut','FR');}catch(e){errors.push(e.message);}}",
  "console.log(JSON.stringify({calls,errors,status:x.snapshot()}));",
 ].join('\n'),{AURA_GROQ_FREE_MAX_REQUESTS_PER_DAY:'3'});
 assert.equal(p.calls,3);
 assert.equal(p.errors.length,2);
 assert.ok(p.errors.every(x=>/daily cap/.test(x)));
 assert.equal(p.status.process_requests_today,3);
});

test('French conversation marks Groq as genuinely verified after response',()=>{
 const p=child([
  "import {FrenchLanguageFaculty} from './src/french_language.js';",
  "let calls=0;",
  "const x=new FrenchLanguageFaculty({groq:{enabled:true,snapshot:()=>({enabled:true}),async generate(){calls++;return {model:'qwen/qwen3.8-27b',answer:'Salut, je réponds normalement en français.'};}},",
  "federation:{enabled:false,snapshot:()=>({enabled:false})}},",
  "{embedded:{status:()=>({installed:false,ready:false,provisioning:{stage:'not-started'}})}});",
  "const answer=await x.generate({user_text:'salut',facts:[]});",
  "const state=await x.status();",
  "console.log(JSON.stringify({answer,calls,verified:state.verified_ready,primary:state.primary,mode:state.last_mode,model:state.last_model}));",
 ].join('\n'));
 assert.equal(p.calls,1);
 assert.match(p.answer,/réponds normalement/);
 assert.equal(p.verified,true);
 assert.equal(p.primary,'groq-free');
 assert.equal(p.model,'qwen/qwen3.8-27b');
});
