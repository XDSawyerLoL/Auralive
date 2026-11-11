import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {CORTEX06_HTML,CORTEX06_CSS} from '../src/cortex06_visual.js';
import {CORTEX06_SCRIPT} from '../src/cortex06_runtime.js';

test('volumetric specimen is an authored illustration in the SAME brain page',()=>{
 assert.ok(CORTEX06_HTML.includes('id="cortex07Poster"'));
 assert.ok(CORTEX06_HTML.includes('id="cortex07PosterImage"'));
 assert.ok(CORTEX06_HTML.includes('src="/assets/cortex07-brain.webp"'));
 assert.equal((BRAIN_OPERATIONS_HTML.match(/id="cortex06Canvas"/g)||[]).length,1);
 assert.equal((BRAIN_OPERATIONS_HTML.match(/id="cortex07PosterImage"/g)||[]).length,1);
 assert.match(CORTEX06_CSS,/#cortex07PosterImage/);
 assert.match(CORTEX06_CSS,/drop-shadow/);
 assert.match(CORTEX06_CSS,/@media\(max-width:800px\)/);
 assert.match(CORTEX06_HTML,/AURA \/ NEURAL ATLAS/);
});
test('actual receipt fibers remain separate from the sculpted artwork',()=>{
 assert.match(CORTEX06_SCRIPT,/ctx\.clearRect\(0,0,W,H\)/);
 assert.match(CORTEX06_SCRIPT,/const volumetric=Boolean\(window\.AuraCortex07/);
 assert.match(CORTEX06_SCRIPT,/poster\?\.complete&&poster\?\.naturalWidth>0/);
 assert.match(CORTEX06_SCRIPT,/if\(!volumetric\)ctx\.drawImage/);
 assert.match(CORTEX06_SCRIPT,/c6Topology\(ctx,c6State\.lastData\)/);
 assert.match(CORTEX06_SCRIPT,/row\.type==='hop'&&age>=0&&age<=4200/);
 assert.match(CORTEX06_SCRIPT,/c6State\.primed/);
 assert.match(CORTEX06_SCRIPT,/mode:'replay'/);
 assert.doesNotMatch(CORTEX06_SCRIPT,/Math\.random\(/);
 assert.doesNotThrow(()=>new Function(CORTEX06_SCRIPT));
});
test('binary illustration is packaged by CI and served as inert public asset',()=>{
 const server=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(server,/app\.get\('\/assets\/cortex07-brain\.webp'/);
 assert.match(server,/readFile\(new URL\('\.\/assets\/cortex07_brain\.webp'/);
 assert.match(server,/reply\.type\('image\/webp'\)/);
 for(const path of ['../scripts/generate_cortex07_brain.py']){
  const s=readFileSync(new URL(path,import.meta.url),'utf8');
  assert.match(s,/SetInterpolationToPBR/);
  assert.match(s,/SetBackgroundAlpha\(0\)/);
  assert.match(s,/img\.save\(out,'WEBP'/);
 }
 assert.equal(BRAIN_OPERATIONS_HTML.includes('id="neuro-lab-details"'),true);
});
