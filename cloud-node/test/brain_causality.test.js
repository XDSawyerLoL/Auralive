import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildBrainFlowGraph, toPublicBrainFlowGraph } from '../src/brain_flow.js';
import { BRAIN_OPERATIONS_HTML } from '../src/brain_operations_console.js';
import { BRAIN_OPERATIONS_SCRIPT } from '../src/brain_operations_runtime.js';

const time=Date.UTC(2026,10,8,21,0);
const at=(n=0)=>new Date(time-n).toISOString();
const flowId='550e8400-e29b-41d4-a716-446655440000';
const receipt={
 flow_id:flowId,at:at(500),phase:'completed',act:'report_internal_state',
 semantic_support_required:false,language_outcome:'response-produced',
 action_executed:false,
 before:{metrics:{stabilite:.73,clarte:.70,frustration:.11,confiance:.62},process_pressure:.2,sensor_source:'node-process',
   private:'DO_NOT_LEAK_PRIVATE'},
 after:{metrics:{stabilite:.69,clarte:.68,frustration:.19,confiance:.58,unsafe_text:'DO_NOT_LEAK'},process_pressure:.4,sensor_source:'node-process'},
 prompt:'DO_NOT_LEAK_CHAT',key:'DO_NOT_LEAK_SECRET',
};

const hops=[
 {id:1,kind:'brain-hop',created_at:at(3000),context:JSON.stringify({flow_id:flowId,from:'input',to:'kernel',at:at(3000),status:'ok'})},
 {id:2,kind:'brain-hop',created_at:at(2100),context:JSON.stringify({flow_id:flowId,from:'kernel',to:'homeostasis',at:at(2100),status:'ok'})},
 {id:3,kind:'brain-hop',created_at:at(1000),context:JSON.stringify({flow_id:flowId,from:'coherence',to:'output',at:at(1000),status:'ok'})},
];

test('one real request correlates an observed route, decision and computed before/after change',()=>{
 const graph=buildBrainFlowGraph({traceRows:[
  ...hops,
  {id:4,kind:'brain-causal',created_at:at(500),title:'private title',
   context:JSON.stringify(receipt)},
 ]},time);
 const publicGraph=toPublicBrainFlowGraph(graph);
 assert.equal(publicGraph.observed_hop_count,3);
 assert.equal(publicGraph.flows.length,1);
 const flow=publicGraph.flows[0];
 assert.equal(flow.id,flowId);
 assert.equal(flow.state,'completed');
 assert.equal(flow.causal.decision,'report_internal_state');
 assert.equal(flow.causal.language_outcome,'response-produced');
 assert.equal(flow.causal.action_executed,false);
 assert.equal(flow.causal.delta.frustration,.08);
 assert.equal(flow.causal.delta.confiance,-.04);
 assert.equal(flow.causal.before.process_pressure,.2);
 assert.equal(flow.causal.after.process_pressure,.4);
 assert.equal(flow.causal.evidence,'aura_cognitive_traces.brain-causal');
 const json=JSON.stringify(publicGraph);
 for(const secret of ['DO_NOT_LEAK_PRIVATE','DO_NOT_LEAK_CHAT','DO_NOT_LEAK_SECRET','private title','unsafe_text'])
  assert.ok(!json.includes(secret),secret);
});

test('route stays partial if decision receipt is absent, no artificial changes',()=>{
 const graph=toPublicBrainFlowGraph(buildBrainFlowGraph({traceRows:hops.slice(0,2)},time));
 assert.equal(graph.flows[0].state,'observed-partial');
 assert.equal(graph.flows[0].causal,null);
 assert.equal(graph.flows[0].step_count,2);
});

test('invalid and stale correlation receipts cannot contaminate published flow',()=>{
 const invalid={...receipt,flow_id:'../private-secret'};
 const stale={...receipt,at:at(90_000_000)};
 const poison={...receipt,before:{metrics:{frustration:999},process_pressure:-1}};
 const graph=toPublicBrainFlowGraph(buildBrainFlowGraph({traceRows:[
  ...hops,
  {kind:'brain-causal',created_at:at(500),context:JSON.stringify(invalid)},
  {kind:'brain-causal',created_at:at(500),context:JSON.stringify(stale)},
  {kind:'brain-causal',created_at:at(500),context:JSON.stringify(poison)},
 ]},time));
 assert.equal(graph.flows[0].causal,null);
});

test('only one UI shows writable chat, real route and before/after causal receipt',()=>{
 for(const id of ['conversation-panel','chatHistory','causal-panel','causalEvidence',
  'causalDecision','causalLanguage','causalExecution','causalValues',
  'causalProvenance','graphCanvas','chatInput','chatSend','flowList']){
  assert.match(BRAIN_OPERATIONS_HTML,new RegExp('id="'+id+'"'),id);
 }
 assert.equal((BRAIN_OPERATIONS_HTML.match(/id="chatHistory"/g)||[]).length,1);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/function renderCausal\(/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/flow\?\.causal/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/before\?\.metrics/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/source-only|Non corrélé|Non observé/);
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/Math\.random\(\).*frustration/);
});

test('kernel writes numeric, correlated, non-sensitive causal receipts and API fetches them',()=>{
 const kernel=fs.readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const server=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(kernel,/const somaticAtIngress = causalSnapshot\(/);
 assert.match(kernel,/this\.trace\('brain-causal','verified-causal-receipt'/);
 assert.match(kernel,/flow_id:brainFlowId/);
 assert.match(kernel,/before:somaticAtIngress/);
 assert.match(kernel,/after:causalSnapshot\(/);
 assert.match(kernel,/action_executed:false/);
 const a=server.indexOf("app.get('/api/brain/graph'");
 const b=server.indexOf('\n});',a);
 const route=server.slice(a,b);
 assert.match(route,/brain-causal/);
 assert.match(route,/toPublicBrainFlowGraph/);
 assert.doesNotMatch(route,/raw_private_memory|request\.body\.text/);
});
