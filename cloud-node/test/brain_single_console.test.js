import test from 'node:test';
import assert from 'node:assert/strict';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {BRAIN_OPERATIONS_CSS} from '../src/brain_operations_style.js';
import {BRAIN_NODES,buildBrainFlowGraph} from '../src/brain_flow.js';

test('one site page has integrated request, graph, modules, tools, metrics and event evidence',()=>{
 for(const id of ['chatInput','chatSend','chatHistory','requestPreview',
   'currentFlowLabel','graphCanvas','graphViewport','moduleList',
   'toolList','flowList','eventList','metricList']){
   assert.ok(BRAIN_OPERATIONS_HTML.includes('id="'+id+'"'),id);
 }
 assert.match(BRAIN_OPERATIONS_HTML,/interface unique/i);
 assert.ok(BRAIN_OPERATIONS_HTML.includes(BRAIN_OPERATIONS_CSS));
 assert.ok(BRAIN_OPERATIONS_HTML.includes(BRAIN_OPERATIONS_SCRIPT));
 assert.ok(BRAIN_NODES.length>=30);
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
});
test('only evidence-based transitions move, and archived replay is explicitly labeled',()=>{
 assert.match(BRAIN_OPERATIONS_SCRIPT,/edge\.signal_recent===true&&age>=0&&age<20000/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/recent&&age<1600/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/replaying=replay\.replaying/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/const REPLAY_STEP_MS=680/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/current\.from===edge\.from&&current\.to===edge\.to/);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/Math\.random\(/);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/simulateFlow|fakeEvent|fakeUsage/);
});
test('request is sent to true AURA API and graph polls while model response is pending',()=>{
 assert.match(BRAIN_OPERATIONS_SCRIPT,/const endpoint=mission\?'\/api\/kernel\/operator':'\/api\/chat'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\(endpoint,/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\('\/api\/brain\/graph'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/if\(state\.busy&&!document\.hidden\)void poll\(\)/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/brain_flow_id/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/Réponse reçue, mais aucun trajet corrélé/i);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/state\.flow=null;state\.replayStarted=0/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/state\.pollInFlight/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/Message envoyé. Lecture des transitions réellement enregistrées/i);
});
test('missing or unauthorized observations never become fabricated successful work',()=>{
 const graph=buildBrainFlowGraph({telemetry:{runtime_ready:false},traceRows:[]},Date.now());
 assert.equal(graph.observed_hop_count,0);
 assert.equal(graph.flows.length,0);
 assert.equal(graph.edges.filter(e=>e.signal_recent).length,0);
 assert.ok(graph.nodes.every(n=>n.activity_verified===false));
 assert.match(BRAIN_OPERATIONS_SCRIPT,/aucune utilisation récente n’est prouvée/i);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/Connexion propriétaire requise|Session propriétaire requise|Journal accessible uniquement en session propriétaire/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/Aucun texte vérifiable généré|Le noyau n’a pas confirmé le traitement/);
});


test('the ONE page distinguishes conversation from explicit owner-only operator missions',()=>{
 assert.match(BRAIN_OPERATIONS_HTML,/id="chatMode"/);
 assert.match(BRAIN_OPERATIONS_HTML,/<option value="mission">Mission \/ outils<\/option>/);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/if\(mission&&!state\.data\?\.authorized\)/);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/Connecte la session propriétaire pour déclencher une mission\. Aucun outil n’a été appelé/);
 assert.doesNotMatch(BRAIN_OPERATIONS_HTML,/id="ownerKey"|id="ownerSignIn"/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/field\.value=msg/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/res\.status===401\|\|res\.status===403/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/allowed_risks:\[\]/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/\/api\/kernel\/operator/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/plan seul|PLAN SEUL/i);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/brain_flow_id/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/database_observations_available===false/);
});

test('idle graph stays static; observed events and user replay alone can move',()=>{
 assert.match(BRAIN_OPERATIONS_SCRIPT,/v4Base\(\);v5CerebralMorphology\(\);v4Regions\(\)/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/replaying\|\|\(!reduced&&/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/document\.hidden/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/recent&&age<1600/);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/Math\.random\(/);
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
});

test('all observation panels are open without a login form',()=>{
 assert.match(BRAIN_OPERATIONS_HTML,/OBSERVATIONS PUBLIQUES/);
 for(const msg of ['Connexion propriétaire nécessaire','Connexion propriétaire requise',
  'Journal accessible uniquement en session propriétaire','Les traces d’exécution nécessitent la session propriétaire']){
  assert.ok(!BRAIN_OPERATIONS_SCRIPT.includes(msg),msg);
 }
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/state\.data\?\.authorized/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/d\.observed_hop_count\|\|0/);
});
