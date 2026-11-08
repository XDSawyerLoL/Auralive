import test from 'node:test';
import assert from 'node:assert/strict';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {BRAIN_OPERATIONS_CSS} from '../src/brain_operations_style.js';
import {BRAIN_NODES,buildBrainFlowGraph} from '../src/brain_flow.js';

test('one site page has integrated request, graph, modules, tools, metrics and event evidence',()=>{
 for(const id of ['chatInput','chatSend','chatHistory','requestPreview',
   'currentFlowLabel','graphCanvas','graphViewport','moduleList',
   'toolList','flowList','eventList','metricList','ownerKey','ownerSignIn']){
   assert.ok(BRAIN_OPERATIONS_HTML.includes('id="'+id+'"'),id);
 }
 assert.match(BRAIN_OPERATIONS_HTML,/interface unique/i);
 assert.ok(BRAIN_OPERATIONS_HTML.includes(BRAIN_OPERATIONS_CSS));
 assert.ok(BRAIN_OPERATIONS_HTML.includes(BRAIN_OPERATIONS_SCRIPT));
 assert.ok(BRAIN_NODES.length>=30);
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
});
test('only evidence-based transitions move, and one-pass replay is explicitly selected',()=>{
 assert.match(BRAIN_OPERATIONS_SCRIPT,/edge\.signal_recent===true&&age>=0&&age<20000/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/eventElapsed<1600/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/const replaying=state\.flow/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/replayWindow=steps\.length\*520\+850/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/activeReplayEdge\.from===edge\.from/);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/Math\.random\(/);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/simulateFlow|fakeEvent|fakeUsage/);
});
test('request is sent to true AURA API and graph polls while model response is pending',()=>{
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\('\/api\/chat'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\('\/api\/brain\/graph'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/if\(state\.busy&&!document\.hidden\)void poll\(\)/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/brain_flow_id/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/leur association précise à ta requête sera vérifiée/i);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/state\.flow=null;state\.replayStarted=0/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/state\.pollInFlight/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/Réponse en cours/);
});
test('missing or unauthorized observations never become fabricated successful work',()=>{
 const graph=buildBrainFlowGraph({telemetry:{runtime_ready:false},traceRows:[]},Date.now());
 assert.equal(graph.observed_hop_count,0);
 assert.equal(graph.flows.length,0);
 assert.equal(graph.edges.filter(e=>e.signal_recent).length,0);
 assert.ok(graph.nodes.every(n=>n.activity_verified===false));
 assert.match(BRAIN_OPERATIONS_SCRIPT,/aucune utilisation récente n’est prouvée/i);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/Connexion propriétaire requise/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/Le moteur de langage n’a pas fourni de réponse vérifiable/);
});
