import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BRAIN_NODES,buildBrainFlowGraph} from '../src/brain_flow.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {BRAIN_OPERATIONS_CSS} from '../src/brain_operations_style.js';
const now=Date.UTC(2026,10,8,17,0,0);
const at=ms=>new Date(now-ms).toISOString();
function hop(id,flow_id,from,to,age=1200,status='ok',provider=''){
 return {id,kind:'brain-hop',created_at:at(age),title:'LEAK_THIS_SECRET',
 context:JSON.stringify({flow_id,from,to,stage:'measured',status,provider,at:at(age),
  secret:'DO_NOT_LEAK'})};
}
const telemetry={
 runtime_ready:true,source:{status:'recent',updated_at:at(1000)},
 modules:[{id:'kernel',state:'active'},{id:'homeostasis',state:'active'}],
 metrics:[{id:'stabilite',label:'Stabilité',value:62}],
 memory:[{label:'Réflexions',value:12}],
 language:{configured:true,response_verified:true,model:'qwen/qwen3.8-27b'},
};
test('real graph has at least twenty source-code modules and honest declared edges',()=>{
 assert.ok(BRAIN_NODES.length>=26);
 const d=buildBrainFlowGraph({telemetry},now);
 assert.equal(d.nodes.length,BRAIN_NODES.length);
 assert.equal(d.observed_hop_count,0);
 assert.equal(d.recent_signal_count,0);
 assert.equal(d.flows.length,0);
 assert.ok(d.edges.length>27);
 assert.ok(d.edges.every(e=>e.signal_recent===false));
 assert.ok(d.nodes.every(n=>!n.activity_verified));
 assert.equal(d.nodes.find(n=>n.id==='kernel').state,'available');
 assert.equal(d.nodes.find(n=>n.id==='groq').state,'configured');
});
test('real, correlation-linked DB receipts drive observed routes and signal freshness',()=>{
 const rows=[
 hop(1,'flow-test-1','input','homeostasis',5300),
 hop(2,'flow-test-1','homeostasis','memory',4900),
 hop(3,'flow-test-1','memory','cognition',4200),
 hop(4,'flow-test-1','cognition','language',3200),
 hop(5,'flow-test-1','language','groq',2300,'ok','groq-free'),
 hop(6,'flow-test-1','groq','coherence',1700,'ok','groq-free'),
 hop(7,'flow-test-1','coherence','output',800),
 ];
 const d=buildBrainFlowGraph({telemetry,traceRows:rows},now);
 assert.equal(d.observed_hop_count,7);
 assert.equal(d.recent_signal_count,7);
 assert.equal(d.flows.length,1);
 assert.equal(d.flows[0].state,'completed');
 assert.equal(d.flows[0].step_count,7);
 assert.equal(d.flows[0].running_verified,false);
 assert.equal(d.flows[0].steps[5].provider,'groq-free');
 assert.equal(d.nodes.find(n=>n.id==='groq').activity_verified,true);
 const edge=d.edges.find(e=>e.from==='language'&&e.to==='groq');
 assert.equal(edge.evidence,'aura_cognitive_traces.brain-hop');
 assert.equal(edge.signal_recent,true);
 assert.doesNotMatch(JSON.stringify(d),/LEAK_THIS_SECRET|DO_NOT_LEAK/);
});
test('stale recorded routes are NOT animated or called an active execution',()=>{
 const rows=[hop(1,'flow-past','input','homeostasis',3600000)];
 const d=buildBrainFlowGraph({telemetry,traceRows:rows},now);
 assert.equal(d.observed_hop_count,1);
 assert.equal(d.recent_signal_count,0);
 assert.equal(d.nodes.find(n=>n.id==='homeostasis').activity_verified,false);
 assert.equal(d.flows[0].state,'observed-partial');
 assert.equal(d.flows[0].running_verified,false);
 assert.equal(d.edges.find(e=>e.from==='input'&&e.to==='homeostasis').signal_recent,false);
});
test('invalid paths, invalid node IDs, impossible future timestamps and content are discarded',()=>{
 const rows=[
 hop(1,'f','malicious','output',1000),
 hop(2,'f','input','output',90000000),
 hop(3,'f','input','output',-9000000),
 {id:4,kind:'brain-hop',context:'not-json',created_at:at(1000)},
 ];
 const d=buildBrainFlowGraph({telemetry,traceRows:rows},now);
 assert.equal(d.observed_hop_count,0);
 assert.equal(d.flows.length,0);
});
test('tool logs appear as recorded evidence, not invented route edges',()=>{
 const d=buildBrainFlowGraph({telemetry,traceRows:[{
  id:9,kind:'agent',created_at:at(2000),title:'PRIVATE_TASK',content:'DO_NOT_LEAK',
  context:'{"private":"DO_NOT_LEAK"}',
 }],commandRows:[{id:7,kind:'initiative-executed',created_at:at(1600),payload:'PRIVATE'}],
 organismRows:[{id:8,kind:'interaction-pre',created_at:at(1200),payload:'PRIVATE'}]},now);
 assert.equal(d.flows.length,0);
 assert.equal(d.events.length,3);
 assert.ok(d.events.every(e=>e.execution_verified===false));
 assert.ok(d.events.some(e=>e.source==='aura_command_events'));
 assert.ok(d.events.some(e=>e.source==='aura_organism_events'));
 assert.doesNotMatch(JSON.stringify(d),/PRIVATE_TASK|DO_NOT_LEAK|PRIVATE"/);
});
test('new /cerveau actually is a functional operational observatory, not a static illustration',()=>{
 for(const id of ['graphCanvas','moduleList','nodeSource','nodeEvidence','flowList',
  'eventList','metricList','chatInput','chatSend','ownerKey','ownerSignIn','onlineState']){
  assert.match(BRAIN_OPERATIONS_HTML,new RegExp('id="'+id+'"'),id+' missing');
 }
 assert.match(BRAIN_OPERATIONS_HTML,/Connexions déclarées/);
 assert.match(BRAIN_OPERATIONS_HTML,/Transition enregistrée récemment/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\('\/api\/brain\/graph'/);
 assert.match(BRAIN_OPERATIONS_HTML,/Aucun mouvement n’est simulé/);
 assert.ok(BRAIN_OPERATIONS_HTML.includes(BRAIN_OPERATIONS_SCRIPT));
 assert.ok(BRAIN_OPERATIONS_HTML.includes(BRAIN_OPERATIONS_CSS));
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\('\/api\/brain\/graph'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/signal_recent/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/age>=0&&age<20000/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/state\.data\?\.authorized/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\('\/api\/auth\/session'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/const endpoint=mission\?'\/api\/kernel\/operator':'\/api\/chat'/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/fetch\(endpoint,/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/brain_flow_id/);
 assert.doesNotMatch(BRAIN_OPERATIONS_SCRIPT,/setInterval\(\(\)=>random|simulateFlow|fakeActivity/);
});
test('server presents one operating interface at / and /cerveau and protects real traces',()=>{
 const src=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(src,/app\.get\('\/cerveau'/);
 assert.match(src,/send\(BRAIN_OPERATIONS_HTML\)/);
 assert.match(src,/app\.get\('\/cerveau\/anatomie'/);
 assert.match(src,/reply\.redirect\('\/cerveau', 302\)/);
 assert.match(src,/app\.get\('\/'/);
 assert.equal((src.match(/send\(BRAIN_OPERATIONS_HTML\)/g)||[]).length,2);
 const s=src.indexOf("app.get('/api/brain/graph'");
 const e=src.indexOf("\n});",s)+4;
 assert.ok(s>0&&e>s);
 const route=src.slice(s,e);
 assert.match(route,/authorized=isPrivate\(request\)/);
 assert.match(route,/if\(authorized && bootstrap\.dbReady\)/);
 assert.match(route,/aura_cognitive_traces/);
 assert.match(route,/aura_command_events/);
 assert.match(route,/aura_organism_events/);
 assert.match(route,/no_private_contents_exposed:true/);
});
test('kernel records real stage transitions with unique IDs and no message content',()=>{
 const src=fs.readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 assert.match(src,/const brainFlowId = randomUUID\(\)/);
 assert.match(src,/this\.trace\('brain-hop'/);
 assert.match(src,/brainHop\('input','kernel','chat-received'/);
 assert.match(src,/brainHop\('kernel','homeostasis','beforeInteraction'/);
 assert.match(src,/brainHop\('homeostasis','memory'/);
 assert.match(src,/brainHop\('memory','cognition'/);
 assert.match(src,/brainHop\('language',providerNode/);
 assert.match(src,/brainHop\(providerNode\|\|'language','coherence'/);
 assert.match(src,/brainHop\('coherence','output'/);
 assert.match(src,/brain_flow_id:brainFlowId/);
});


test('operator traces distinguish actual tool invocation from a plan-only mission',()=>{
 const src=fs.readFileSync(new URL('../src/kernel.js',import.meta.url),'utf8');
 const start=src.indexOf('  async operate(task, requestedRisks = [])');
 const end=src.indexOf('  async chat(',start);
 assert.ok(start>0 && end>start);
 const section=src.slice(start,end);
 assert.match(section,/const operationFlowId = randomUUID\(\)/);
 assert.match(section,/this\.trace\(\s*'brain-hop'/);
 assert.match(section,/hop\('input','command','operator-received'\)/);
 assert.match(section,/hop\('command','bridge','quantic-studio-invoked','attempted'\)/);
 assert.match(section,/hop\('bridge','command','quantic-studio-result',result\?\.executed\?'ok':'unavailable'\)/);
 assert.match(section,/hop\('command','fabric','sandbox-capabilities-selected','attempted'\)/);
 assert.match(section,/hop\('fabric','dag','task-graph-built','attempted'\)/);
 assert.match(section,/hop\('dag','command','sandbox-execution-completed','ok'\)/);
 assert.match(section,/hop\('command','agent','operator-plan-requested','attempted'\)/);
 assert.match(section,/hop\('agent','command','plan-only-no-execution','unavailable'\)/);
 assert.doesNotMatch(section,/this\.trace\('brain-hop'[^;]+mission/);
});

test('a real tool route displays invocation while plan-only never claims execution',()=>{
 const samples=[
  hop(71,'tool-run','input','command',2100,'ok'),
  hop(72,'tool-run','command','fabric',1800,'attempted'),
  hop(73,'tool-run','fabric','dag',1400,'attempted'),
  hop(74,'tool-run','dag','command',800,'ok'),
  hop(75,'planning-only','input','command',900,'ok'),
  hop(76,'planning-only','command','agent',700,'attempted'),
  hop(77,'planning-only','agent','command',500,'unavailable'),
 ];
 const graph=buildBrainFlowGraph({telemetry,traceRows:samples},now);
 assert.equal(graph.flows.length,2);
 const launched=graph.flows.find(f=>f.id==='tool-run');
 const planned=graph.flows.find(f=>f.id==='planning-only');
 assert.ok(launched.steps.some(h=>h.from==='fabric' && h.to==='dag'));
 assert.equal(planned.running_verified,false);
 assert.equal(planned.state,'error');
 assert.ok(graph.observed_tools.some(tool=>tool.id==='fabric'));
 assert.ok(graph.observed_tools.some(tool=>tool.id==='agent'));
 assert.equal(graph.observed_tools.every(tool=>tool.execution_verified===false),true);
});


test('a real chat route passes through the central Kernel, never a fake decorative core',()=>{
 const rows=[
   hop(31,'nucleus-route','input','kernel',2800),
   hop(32,'nucleus-route','kernel','homeostasis',2600),
   hop(33,'nucleus-route','homeostasis','memory',2400),
   hop(34,'nucleus-route','memory','cognition',2100),
   hop(35,'nucleus-route','cognition','language',1500),
   hop(36,'nucleus-route','language','groq',1200,'ok','groq-free'),
   hop(37,'nucleus-route','groq','coherence',900,'ok','groq-free'),
   hop(38,'nucleus-route','coherence','output',700),
 ];
 const graph=buildBrainFlowGraph({telemetry,traceRows:rows},now);
 assert.equal(graph.observed_hop_count,8);
 assert.ok(graph.flows[0].steps.some(x=>x.from==='input'&&x.to==='kernel'));
 assert.ok(graph.flows[0].steps.some(x=>x.from==='kernel'&&x.to==='homeostasis'));
 assert.equal(graph.nodes.find(x=>x.id==='kernel').activity_verified,true);
 assert.ok(graph.edges.find(x=>x.from==='input'&&x.to==='kernel').signal_recent);
 assert.ok(graph.edges.find(x=>x.from==='kernel'&&x.to==='homeostasis').signal_recent);
});
