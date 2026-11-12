import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {CORTEX13_LAYOUT_CSS} from '../src/cortex13_layout.js';
import {CORTEX13_SCRIPT,CORTEX13_CSS} from '../src/cortex13_connectome.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {BRAIN_READABLE_CSS} from '../src/brain_readable_theme.js';

function boot(){
 const state={selected:'memory',replay:null};
 const centers={memory:{x:-.55,y:.08,z:.12},workspace:{x:.1,y:.02,z:.2},
   homeostasis:{x:-.3,y:.3,z:-.12}};
 const fn=runInNewContext(CORTEX13_SCRIPT+
   ";({build:c13Geometry,evidence:c13Evidence,install(geometry){c13System.modules=geometry.modules;c13System.edges=geometry.links;}})",{
   Math,Date,Float32Array,Map,Set,performance:{now:()=>1000},c6State:state,
   c9TissuePoint:(id)=>centers[id]||{x:.45,y:.02,z:.1},$:()=>null,
 });
 return {fn,state};
}

test('connectome geometry is deterministic and based on actual module and edge IDs',()=>{
 assert.doesNotThrow(()=>new Function(CORTEX13_SCRIPT));
 assert.doesNotMatch(CORTEX13_SCRIPT,/Math\.random\(/);
 const nodes=Array.from({length:44},(_,i)=>({
  id:'module_'+i,group:i%2?'memory':'core'
 }));
 const edges=Array.from({length:40},(_,i)=>({
  from:'module_'+i,to:'module_'+(i+1),relationship:'declared-architecture'
 }));
 const a=boot().fn.build(nodes,edges),b=boot().fn.build(nodes,edges);
 assert.equal(a.modules.length,44);
 assert.equal(a.links.length,40);
 assert.ok(a.pointCount>4000&&a.pointCount<=6500);
 assert.ok(a.lineVertices>7000);
 assert.equal(a.pointData.length,a.pointCount*8);
 assert.equal(a.linkData.length,a.lineVertices*8);
 assert.deepEqual(JSON.stringify(Array.from(a.pointData.slice(0,64))),
  JSON.stringify(Array.from(b.pointData.slice(0,64))));
});

test('only a dated completed receipt activates a link',()=>{
 const {fn}=boot();
 const nodes=[{id:'memory',group:'memory'},{id:'workspace',group:'core'},
  {id:'homeostasis',group:'core'}];
 const edges=[{from:'memory',to:'workspace'},
  {from:'workspace',to:'homeostasis'}];
 fn.install(fn.build(nodes,edges));
 const now=Date.parse('2026-11-12T10:12:00.000Z');
 const quiet=fn.evidence({runtime_ready:true,nodes,edges,flows:[]},now);
 assert.equal(quiet.observed,0);assert.equal(quiet.active,false);
 assert.equal(quiet.el[0],0);assert.equal(quiet.el[1],0);
 assert.ok(quiet.ml[0]>.1,'selection is visual navigation, not neural evidence');
 const seen=fn.evidence({runtime_ready:true,nodes,edges,flows:[{steps:[
  {from:'memory',to:'workspace',status:'ok',at:new Date(now-500).toISOString()},
  {from:'workspace',to:'homeostasis',status:'attempted',at:new Date(now-200).toISOString()},
 ]}]},now);
 assert.equal(seen.observed,1);assert.equal(seen.active,true);
 assert.ok(seen.el[0]>.9);assert.equal(seen.el[1],0);
 const expired=fn.evidence({runtime_ready:true,nodes,edges,flows:[{steps:[
  {from:'memory',to:'workspace',status:'ok',at:new Date(now-20000).toISOString()},
 ]}]},now);
 assert.equal(expired.el[0],0);
 const offline=fn.evidence({runtime_ready:false,nodes,edges,flows:[{steps:[
  {from:'memory',to:'workspace',status:'ok',at:new Date(now-100).toISOString()},
 ]}]},now);
 assert.equal(offline.el[0],0);
});

test('chat and WebGL anatomy occupy the same readable screen',()=>{
 assert.match(BRAIN_OPERATIONS_HTML,/id="cortex13WebGL"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="c13RotateLeft"/);
 assert.match(BRAIN_OPERATIONS_HTML,/CORTEX 13/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="chatHistory"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="chatInput"/);
 assert.match(CORTEX13_LAYOUT_CSS,/grid-template-areas:"cortex dialogue"/);
 assert.match(CORTEX13_LAYOUT_CSS,/#chatHistory\.open/);
 assert.match(CORTEX13_LAYOUT_CSS,/overflow-y:auto!important/);
 assert.match(CORTEX13_LAYOUT_CSS,/\.conversation-workspace #chatDock/);
 assert.match(BRAIN_READABLE_CSS,/grid-template-areas:"cortex dialogue"/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/c13Observe\(data\)/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/function c13Geometry\(nodes,edges\)/);
});

test('render is event-driven and can degrade gracefully without WebGL2',()=>{
 assert.match(CORTEX13_SCRIPT,/getContext\('webgl2'/);
 assert.match(CORTEX13_SCRIPT,/c13System\.webgl=false/);
 assert.match(CORTEX13_SCRIPT,/requestAnimationFrame/);
 assert.match(CORTEX13_SCRIPT,/if\(ev.active&&/);
 assert.doesNotMatch(CORTEX13_SCRIPT,/setInterval\(/);
 assert.match(CORTEX13_CSS,/pointer-events:none/);
 assert.match(CORTEX13_SCRIPT,/jamais des neurones biologiques/);
 assert.match(BRAIN_READABLE_CSS,/CORTEX13_CSS/);
});
