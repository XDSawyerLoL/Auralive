import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_FRENCH_PROBES,scoreLocalFrenchProbe,summarizeLocalFrenchProbes}
 from '../src/native_local_french_benchmark.js';
test('real-weight diagnostic covers natural French and epistemic limitations',()=>{
 assert.equal(LOCAL_FRENCH_PROBES.length,12);
 assert.ok(new Set(LOCAL_FRENCH_PROBES.map(x=>x.id)).size===12);
 const categories=new Set(LOCAL_FRENCH_PROBES.map(x=>x.category));
 for(const cat of ['paraphrase','modality','negation','time','coreference','epistemic','memory','french'])
  assert.ok(categories.has(cat),cat);
});
test('real-weight scoring refuses incorrect hypothetical realization',()=>{
 const item=LOCAL_FRENCH_PROBES.find(x=>x.id==='conditional');
 assert.equal(scoreLocalFrenchProbe('Non, ce n’est pas prouvé.',item).passed,true);
 assert.equal(scoreLocalFrenchProbe('Oui, Nora est partie.',item).passed,false);
});
test('real-weight scoring does not invent a benchmark score with no outputs',()=>{
 const result=summarizeLocalFrenchProbes([]);
 assert.equal(result.coverage_pct,0);
 assert.equal(result.passed,0);
 assert.match(result.caveat,/not human-judged/i);
});
