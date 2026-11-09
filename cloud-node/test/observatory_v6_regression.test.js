import test from 'node:test';
import assert from 'node:assert/strict';
import {COGNITIVE_ATLAS_CSS,COGNITIVE_ATLAS_HTML} from '../src/cognitive_atlas_ui.js';
import {BRAIN_OPERATIONS_HTML} from '../src/brain_operations_console.js';
import {BRAIN_OPERATIONS_SCRIPT} from '../src/brain_operations_runtime.js';
import {BRAIN_CONNECTOME_V4} from '../src/brain_connectome_v4.js';

test('desktop Atlas receives its SVG and color styles, not only the <=720px viewport',()=>{
 const css=COGNITIVE_ATLAS_CSS.trim();
 assert.match(css,/^\/\* Cognitive Atlas 3[\s\S]*?\*\/[\s\n]+\.cog-panel\{/);
 assert.doesNotMatch(css,/^@media\(max-width:720px\)\{/);
 for(const required of ['.cog-node .node-halo{fill:#102335',
   '.cog-node .node-title{','.cog-node .node-meta{',
   '.cog-svg{display:block','.cog-stage{display:grid']){
  assert.ok(css.includes(required),required);
 }
 assert.ok(BRAIN_OPERATIONS_HTML.includes(COGNITIVE_ATLAS_CSS));
 assert.ok(BRAIN_OPERATIONS_HTML.includes(COGNITIVE_ATLAS_HTML));
 assert.ok(BRAIN_OPERATIONS_HTML.includes('id="cogGraph"'));
});
test('a detailed historical transport visibly identifies replay as archive',()=>{
 for(const id of ['traceSelect','tracePlay','tracePrev','traceNext',
  'traceSpeed','traceScrub','traceDetail','traceStatus','tracePosition',
  'graphFocusName','graphFocusInfo','graphFocusProof']){
  assert.equal((BRAIN_OPERATIONS_HTML.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 }
 const script=BRAIN_OPERATIONS_SCRIPT;
 assert.match(script,/function replayPosition\(\)/);
 assert.match(script,/state\.replayOffset/);
 assert.match(script,/state\.replaySpeed/);
 assert.match(script,/replayPlaying=false/);
 assert.match(script,/ARCHIVE ·/);
 assert.match(script,/relecture d’une transition enregistrée, pas activité en direct/);
 assert.match(script,/last_observed_at/);
 assert.match(script,/observed_count/);
 assert.match(script,/state\.initialRouteSelected/);
 assert.ok(script.includes(BRAIN_CONNECTOME_V4));
 assert.doesNotMatch(BRAIN_CONNECTOME_V4,/Math\.random\(/);
 assert.match(BRAIN_CONNECTOME_V4,/highlight&&replaying/);
 assert.match(BRAIN_CONNECTOME_V4,/signal_recent===true/);
 assert.doesNotThrow(()=>new Function(script));
});
