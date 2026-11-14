import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateStandaloneLocalReply} from '../src/local_chat_recovery.js';

test('no local model means no generated or canned conversation',async()=>{
 let calls=0;
 const runtime={status:()=>({ready:false,probe_verified:false}),generate:async()=>{calls++;return 'faux texte';}};
 const result=await generateStandaloneLocalReply({runtime,localOnly:true,text:'Bonjour'});
 assert.equal(result.ok,false);assert.equal(result.answer,'');assert.equal(calls,0);
 assert.equal(result.memory_persisted,false);
});
test('only a verified responsive local engine may answer without DB',async()=>{
 const calls=[];
 const runtime={status:()=>({ready:true,probe_verified:true}),
   generate:async (...args)=>{calls.push(args);return '  Bonjour, je t’écoute.  ';}};
 const result=await generateStandaloneLocalReply({runtime,localOnly:true,text:'Bonjour AURA'});
 assert.equal(result.answer,'Bonjour, je t’écoute.');
 assert.equal(result.response_kind,'local-ephemeral');
 assert.equal(result.memory_persisted,false);
 assert.equal(result.tools_executed,false);
 assert.equal(calls.length,1);
 assert.ok(calls[0][1].includes('français naturel'));
});
test('no nonlocal fallback, no false speech when model fails',async()=>{
 const runtime={status:()=>({ready:true,probe_verified:true}),generate:async()=>''};
 assert.equal(await generateStandaloneLocalReply({runtime,localOnly:false,text:'x'}),null);
 const result=await generateStandaloneLocalReply({runtime,localOnly:true,text:'x'});
 assert.equal(result.ok,false);assert.equal(result.answer,'');
});
test('browser sensor 401 must not revoke local devices; session chat survives reload',()=>{
 const js=fs.readFileSync(new URL('../src/brain_operations_runtime.js',import.meta.url),'utf8');
 const ui=fs.readFileSync(new URL('../src/brain_operations_console.js',import.meta.url),'utf8');
 assert.match(js,/response\.status===401\|\|response\.status===403/);
 assert.doesNotMatch(js,/if\(response\.status===401\|\|response\.status===403\)\{\s*stopSense/);
 assert.match(js,/senseState\.bridgeRetryAt=now\+30000/);
 assert.match(js,/sessionStorage\.setItem\(localChatKey/);
 assert.match(js,/sessionStorage\.getItem\(localChatKey/);
 assert.match(ui,/id="chatClear"/);
});
