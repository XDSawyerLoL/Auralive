import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readableCognitionSnapshot,READABLE_COGNITION_VERSION}
  from '../src/readable_cognition.js';

const state={
  dominant_thought:'Comparer deux hypothèses sans inventer de résultat',
  current_intention:'Vérifier un résultat de test scientifique',
  existence:{current_focus:'Terminer la validation du noyau'},
};

test('exact persisted intention and written thought are readable, with source labels',()=>{
 const out=readableCognitionSnapshot({
  soul:state,
  at:'2026-11-12T20:10:00Z',
  intentions:[
   {statement:'Observer un écart causal',status:'working',
    source:'self-inquiry',priority:.83,updated_at:'2026-11-12T20:08:30Z'},
   {statement:'Une intention close',status:'completed',source:'api',priority:1},
  ],
  appraisal:{at:'2026-11-12T20:09:00Z',focus:'confirm_evidence',
    selected_action:'verify',tone:'cautious',uncertainty:.42,
    resource_pressure:.2,competition:{initiative:.31,care:.12,
      curiosity:.56,caution:.71}},
 });
 assert.equal(out.version,READABLE_COGNITION_VERSION);
 assert.equal(out.declared_thought.text,state.dominant_thought);
 assert.equal(out.current_focus.text,state.existence.current_focus);
 assert.equal(out.current_intention.text,state.current_intention);
 assert.equal(out.intentions.length,1);
 assert.equal(out.intentions[0].status,'working');
 assert.equal(out.arbitration.selected_action,'verify');
 assert.equal(out.arbitration.competition.find(x=>x.channel==='caution').value,.71);
 assert.equal(out.arbitration.hidden_llm_reasoning_exposed,false);
 assert.equal(out.declared_thought.live_stream,false);
 assert.equal(out.data_origin.production_state_unchanged,true);
});

test('missing records never invent spontaneous thoughts',()=>{
 const a=readableCognitionSnapshot({soul:{},intentions:[],at:'2026-11-12T20:00:00Z'});
 assert.equal(a.available,false);
 assert.equal(a.declared_thought.text,null);
 assert.equal(a.current_intention.text,null);
 assert.equal(a.arbitration.selected_action,null);
 assert.equal(a.intents?.length,undefined);
});

test('redacts arbitrary context, SQL identifiers, and dubious text and action',()=>{
 const out=readableCognitionSnapshot({
  soul:{dominant_thought:'Texte réel\n',person_secret:'NOPE'},
  intentions:[{id:'secret-id',context:'{"bearer":"token"}',
    statement:'Lire une donnée',status:'working',source:'evil',
    priority:5000,updated_at:'invalid'}],
  appraisal:{options:[{secret:'raw prompts'}],selected_action:'run-shell',
    competition:{initiative:5,care:-3},focus:'verify'},
 });
 assert.equal(out.intentions[0].priority,1);
 assert.equal(out.intentions[0].source,'other-recorded');
 assert.equal(out.intentions[0].updated_at,null);
 assert.equal(out.arbitration.selected_action,null);
 assert.equal(out.arbitration.competition[0].value,1);
 assert.ok(!JSON.stringify(out).includes('secret-id'));
 assert.ok(!JSON.stringify(out).includes('bearer'));
 assert.ok(!JSON.stringify(out).includes('raw prompts'));
 assert.ok(!JSON.stringify(out).includes('person_secret'));
});

test('private endpoint is GET-only, guarded, no untrusted data in public endpoints',()=>{
 const code=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 const path="app.get('/api/brain/introspection', async (request,reply)=>{";
 const i=code.indexOf(path);
 assert.ok(i>0);
 const route=code.slice(i,code.indexOf('});',i)+3);
 assert.match(route,/requirePrivate\(request,reply\)/);
 assert.match(route,/requireRuntime\(reply\)/);
 assert.match(route,/readableCognitionSnapshot\(/);
 assert.match(route,/kernel\.intentions\(12\)/);
 assert.doesNotMatch(route,/app\.log|saveSoul|query\(|sendPrivate|fetch\(/);
 const pub=code.slice(code.indexOf("app.get('/api/brain/graph'"),code.indexOf("app.get('/api/language/embedded/status'"));
 assert.ok(!pub.includes('readableCognitionSnapshot('));
});
