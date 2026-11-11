import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {CORTEX09_SCRIPT,CORTEX09_CSS} from '../src/cortex09_neural_volume.js';
import {CORTEX06_SCRIPT} from '../src/cortex06_runtime.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';

const geometry={workspace:[0,-.03],memory:[-.62,.08]};
function boot(pulses=[]){
 const state={width:1280,height:840,positions:new Map(),pulses,selected:'workspace',replay:null};
 let arcs=0,strokes=0;
 const gradient={addColorStop(){}};
 const ctx={clearRect(){},createRadialGradient(){return gradient;},
  fillRect(){},beginPath(){},ellipse(){},fill(){},
  arc(){arcs++;},moveTo(){},lineTo(){},stroke(){strokes++;},
  quadraticCurveTo(){},save(){},restore(){}};
 const context={
  c6State:state,c6Major:geometry,c6Jitter:()=>0,
  c8Stage:{snapshot:null,reduced:false},
  c8Fresh:()=>false,c8FocusSignal:()=>null,
  c8FlowState:{echoes:[]},performance:{now:()=>1500},
  document:{hidden:false},c6Animate(){},Math,Date,
 };
 const vm=runInNewContext(CORTEX09_SCRIPT+';({build:c9BuildVolume,draw:c9PaintVolume,'+
  'geometry:()=>({points:c9Volume.points,fibres:c9Volume.fibres})})',context);
 const data={nodes:[{id:'workspace',group:'core',activity_verified:false},
   {id:'memory',group:'memory',activity_verified:false}],edges:[]};
 return {state,vm,data,ctx,counts:()=>({arcs,strokes})};
}
test('CORTEX 09 embeds a large deterministic 3D body, not a flattened graph',()=>{
 assert.doesNotThrow(()=>new Function(CORTEX09_SCRIPT));
 assert.doesNotMatch(CORTEX09_SCRIPT,/Math\.random\(/);
 const a=boot(),b=boot();
 a.vm.build();b.vm.build();
 assert.ok(a.vm.geometry().points.length>1000);
 assert.ok(a.vm.geometry().fibres.length>500);
 assert.deepEqual(JSON.stringify(a.vm.geometry().points.slice(0,40)),
  JSON.stringify(b.vm.geometry().points.slice(0,40)));
 assert.ok(a.vm.geometry().points.every(p=>Number.isFinite(p.z)));
});
test('no moving event is drawn without an actual receipt or explicit replay',()=>{
 const idle=boot();
 assert.equal(idle.vm.draw(idle.ctx,1280,840,idle.data),true);
 const empty=idle.counts();
 assert.equal(idle.state.positions.size,2);
 const observed=boot([{from:'memory',to:'workspace',start:1000}]);
 observed.vm.draw(observed.ctx,1280,840,observed.data);
 assert.ok(observed.counts().arcs>empty.arcs);
 assert.ok(observed.counts().strokes>empty.strokes);
 assert.match(CORTEX09_SCRIPT,/c6State\.pulses/);
 assert.match(CORTEX09_SCRIPT,/c8FlowState\.echoes/);
 assert.match(CORTEX09_SCRIPT,/signal\.replay/);
});
test('CORTEX 09 is integrated as the dominant scene with accessible controls',()=>{
 assert.match(CORTEX06_SCRIPT,/c9PaintVolume\(ctx,W,H,c6State\.lastData\)/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/function c9PaintVolume\(ctx,w,h,data\)/);
 assert.match(CORTEX09_CSS,/#cortex07Poster\{opacity:/);
 assert.match(CORTEX09_CSS,/#cortex07Canvas\{display:none!important\}/);
 assert.match(BRAIN_OPERATIONS_HTML,/CORTEX 09/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="c6Replay"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="c6Details"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="chatInput"/);
});
