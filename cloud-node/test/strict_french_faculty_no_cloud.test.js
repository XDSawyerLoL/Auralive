import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('French faculty itself never invokes Groq or federation under strict local-only mode',()=>{
 const source=[
  "import {FrenchLanguageFaculty} from './src/french_language.js';",
  "let remote=0,local=0;",
  "const ai={groq:{enabled:true,generate:async()=>{remote++;return {answer:'REMOTE'};},snapshot:()=>({enabled:true})},",
  "federation:{enabled:true,generate:async()=>{remote++;return {answer:'REMOTE'};},snapshot:()=>({enabled:true})},bridge:null};",
  "const embedded={status:()=>({ready:true,probe_verified:true,boot_profile:'low-memory',",
  "provisioning:{stage:'installed-verified'}}),generate:async()=>{local++;return 'Bonjour, je peux répondre à ta question.';}};",
  "const faculty=new FrenchLanguageFaculty(ai,{embedded});",
  "const answer=await faculty.generate({act:'respond',user_text:'Bonjour, AURA.',goal:'répondre',facts:[]});",
  "console.log(JSON.stringify({answer,remote,local,status:await faculty.status()}));"
 ].join('\n');
 const r=spawnSync(process.execPath,['--input-type=module','-e',source],{
  cwd:new URL('..',import.meta.url).pathname,
  env:{...process.env,CI:'true',NODE_ENV:'test',AURA_LOCAL_LANGUAGE_ONLY:'true'},
  encoding:'utf8',timeout:20000
 });
 assert.equal(r.status,0,r.stderr||r.stdout);
 const data=JSON.parse(r.stdout.trim().split(/\r?\n/).at(-1));
 assert.equal(data.remote,0);
 assert.equal(data.local,1);
 assert.match(data.answer,/Bonjour/);
 assert.equal(data.status.ready,true);
});
