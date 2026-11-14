import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const execute=code=>spawnSync(process.execPath,['--input-type=module','-e',code],{
 cwd:new URL('..',import.meta.url).pathname,
 env:{...process.env,AURA_LOCAL_LANGUAGE_ONLY:'true',AURA_GROQ_FREE_ENABLED:'true',
  AURA_GROQ_FREE_PLAN_CONFIRMED:'true',AURA_GROQ_API_KEY:'fake-secret',
  AURA_ZERO_COST_MODE:'true',AURA_EMBEDDED_LANGUAGE_ENABLED:'false',
  AURA_EMBEDDED_AUTOPROVISION_ENABLED:'false',
  AURA_FREE_FEDERATION_ENABLED:'true'},
 encoding:'utf8',timeout:30000
});
test('strict local mode bypasses Groq and free federation even if key exists',()=>{
 const script=[
 "import {AiClient} from './src/ai.js';",
 "let remote=0;",
 "const bridge={enabled:true,preferLocalAi:true,workerOnline:async()=>false,infer:async()=>{throw Error('offline');}};",
 "const ai=new AiClient(bridge);",
 "ai.groq={enabled:true,snapshot:()=>({enabled:true}),generate:async()=>{remote++;return {answer:'FAKE CLOUD'};}};",
 "ai.federation={enabled:true,snapshot:()=>({enabled:true}),generate:async()=>{remote++;return {answer:'FAKE FEDERATION'};}};",
 "const answer=await ai.generate('Bonjour','AURA',120,'conversation');",
 "console.log(JSON.stringify({answer,remote,provider:ai.provider,diag:ai.diagnostic(),lastBackend:ai.lastBackend}));"
 ].join('\n');
 const r=execute(script);
 assert.equal(r.status,0,r.stderr||r.stdout);
 const v=JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
 assert.equal(v.answer,'');
 assert.equal(v.remote,0);
 assert.equal(v.lastBackend,'local-language-only');
 assert.equal(v.diag.local_language_only,true);
 assert.equal(v.diag.remote_language_providers_blocked,true);
 assert.equal(v.provider,'aura-runtime-local');
});
test('strict local mode still permits an available local bridge to answer',()=>{
 const script=[
 "import {AiClient} from './src/ai.js';",
 "let remote=0,local=0;",
 "const bridge={enabled:true,preferLocalAi:true,workerOnline:async()=>true,infer:async()=>{local++;return 'Je réponds localement.';}};",
 "const ai=new AiClient(bridge);",
 "ai.groq={enabled:true,snapshot:()=>({}),generate:async()=>{remote++;return {answer:'NON'};}};",
 "ai.federation={enabled:true,snapshot:()=>({}),generate:async()=>{remote++;return {answer:'NON'};}};",
 "const text=await ai.generate('Comment vas-tu ?','AURA',150,'conversation');",
 "console.log(JSON.stringify({text,remote,local,backend:ai.lastBackend}));"
 ].join('\n');
 const r=execute(script);
 assert.equal(r.status,0,r.stderr||r.stdout);
 const v=JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
 assert.equal(v.text,'Je réponds localement.');
 assert.equal(v.remote,0);
 assert.equal(v.local,1);
 assert.equal(v.backend,'aura-runtime-local');
});
