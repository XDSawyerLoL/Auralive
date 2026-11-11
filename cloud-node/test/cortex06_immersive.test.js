import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {CORTEX06_HTML,CORTEX06_CSS} from '../src/cortex06_visual.js';
import {CORTEX06_SCRIPT} from '../src/cortex06_runtime.js';
import {buildNeuroVitalSigns} from '../src/brain_physiology.js';

test('CORTEX06 is single dominant visual scene, not 3-column dashboard',()=>{
 for(const id of ['cortex06','cortex06Canvas','c6Vitals','c6RecentEvents',
  'c6Timeline','c6Replay','c6Details','c6Lab','c6StatusDot','c6FocusMeta']){
  assert.equal((BRAIN_OPERATIONS_HTML.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 assert.equal((BRAIN_OPERATIONS_HTML.match(/id="graphCanvas"/g)||[]).length,1);
 assert.match(CORTEX06_CSS,/\.workspace>\.graph-panel\{order:0;width:100%/);
 assert.match(CORTEX06_CSS,/#graphCanvas\{display:none!important\}/);
 assert.match(CORTEX06_CSS,/@media\(max-width:800px\)/);
 assert.match(CORTEX06_CSS,/@media\(prefers-reduced-motion:reduce\)/);
 assert.ok(CORTEX06_HTML.includes("Architecture <em>vivante."));
 for(const id of ['hippocampus','insula','prefrontal','metacognition'])
  assert.match(CORTEX06_HTML,new RegExp('data-c6-node="'+id+'"'));
});
test('cortical relief is static display geometry, not synthetic neuronal firing',()=>{
 assert.match(CORTEX06_SCRIPT,/function c6HemispherePath/);
 assert.match(CORTEX06_SCRIPT,/function c6BrainMatter/);
 assert.match(CORTEX06_SCRIPT,/function c6Topology/);
 assert.match(CORTEX06_SCRIPT,/for\(const e of edges\)/);
 assert.match(CORTEX06_SCRIPT,/function c6Signals/);
 assert.match(CORTEX06_SCRIPT,/c6State\.known\.has\(row\.id\)/);
 assert.match(CORTEX06_SCRIPT,/c6State\.primed/);
 assert.match(CORTEX06_SCRIPT,/row\.type==='hop'&&age>=0&&age<=4200/);
 assert.match(CORTEX06_SCRIPT,/signal\.mode==='live'/);
 assert.match(CORTEX06_SCRIPT,/mode:'replay'/);
 assert.match(CORTEX06_SCRIPT,/RELECTURE HISTORIQUE · PAS UNE ACTIVITÉ EN DIRECT/);
 assert.doesNotMatch(CORTEX06_SCRIPT,/Math\.random\(/);
 assert.doesNotThrow(()=>new Function(CORTEX06_SCRIPT));
});
test('only measured, verified or unavailable telemetry drives compact physiology',()=>{
 assert.match(CORTEX06_SCRIPT,/const vital=c6State\.lastData\?\.telemetry\?\.neuro_vitals/);
 assert.match(CORTEX06_SCRIPT,/item\.available===true&&item\.value!==null/);
 const missing=buildNeuroVitalSigns({runtime_ready:false,somatic:{source:'unavailable'}});
 assert.ok(missing.vitals.every(v=>!v.available&&v.value===null));
 assert.match(CORTEX06_HTML,/pas mesures biologiques/);
 assert.match(CORTEX06_HTML,/AUCUNE PREUVE DE CONSCIENCE SUBJECTIVE/);
});
test('existing controls, content, API routes and scientific lab remain present',()=>{
 const src=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(src,/app\.get\('\/api\/brain\/graph'/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="chatSend"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="chatInput"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="neuro-lab-details"/);
 assert.match(BRAIN_OPERATIONS_HTML,/id="atlas-v3"/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/c6Ingest\(data\)/);
 assert.match(BRAIN_OPERATIONS_SCRIPT,/c6Render\(\)/);
 assert.doesNotThrow(()=>new Function(BRAIN_OPERATIONS_SCRIPT));
});
