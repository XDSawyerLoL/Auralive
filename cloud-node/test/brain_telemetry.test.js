import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BRAIN_HTML} from '../src/brain_console.js';
import {BRAIN_SCRIPT} from '../src/brain_console_runtime.js';
import {DASHBOARD_HTML} from '../src/dashboard.js';
import {buildBrainTelemetry,boundedMetric,evaluateTelemetryFreshness,BRAIN_METRICS} from '../src/brain_telemetry.js';

const T=Date.UTC(2026,10,8,14,0);
function publicSnapshot(){
 return {
  runtime_ready:true,
  soul:{organism:{updated_at:new Date(T-30_000).toISOString(),
    mood:'concentrée',stabilite:.73,clarte:.82,agency:.64,
    engagement:.72,confiance:.53,curiosite:.66,satisfaction:.5,
    frustration:.12,besoin_de_silence:.17,pression_de_reve:.3,
    identite:.91,last_reason:'résultat d’un tick réel',
    active_intention:'Examiner les indicateurs du système'}},
  kernel_status:{counts:{reflections:22,intentions:5,lessons:11,routines:3}},
  command:{running:true},
  activity:[{title:'Observation publique',kind:'service-observation',
    created_at:new Date(T-90_000).toISOString()}],
 };
}
test('telemetry is sourced exclusively from public v9 organism and genuine kernel counters',()=>{
 const t=buildBrainTelemetry(publicSnapshot(),{language:{
  enabled:true,last_status:'verified-text',last_model:'qwen/qwen3.8-27b',
 }},T);
 assert.equal(t.runtime_ready,true);
 assert.equal(t.source.status,'recent');
 assert.equal(t.source.age_seconds,30);
 assert.equal(t.mood,'concentrée');
 assert.equal(t.metrics.find(x=>x.id==='stabilite').value,73);
 assert.equal(t.metrics.find(x=>x.id==='agency').value,64);
 assert.equal(t.memory[0].value,22);
 assert.equal(t.language.response_verified,true);
 assert.equal(t.language.model,'qwen/qwen3.8-27b');
 assert.equal(t.actions.execution_verified,false);
 assert.equal(t.actions.orchestrator_running_reported,true);
 assert.equal(t.modules.find(x=>x.id==='actions').state,'reported-running');
 assert.equal(t.recent_activity[0].execution_verified,false);
 assert.equal(t.no_synthetic_values,true);
 assert.match(t.warning,/Aucune preuve de conscience/);
});
test('unknown measurements remain null rather than fabricated 0 or percentages',()=>{
 const t=buildBrainTelemetry({runtime_ready:true,
  soul:{organism:{updated_at:new Date(T-300_000).toISOString(),stabilite:0}}},
  {language:{enabled:true,last_status:'not-tested'}},T);
 assert.equal(t.metrics.find(x=>x.id==='stabilite').value,0);
 assert.equal(t.metrics.find(x=>x.id==='clarte').value,null);
 assert.equal(t.memory[0].value,null);
 assert.equal(t.source.status,'aging');
 assert.equal(t.language.response_verified,false);
 assert.equal(t.modules.find(x=>x.id==='homeostasis').state,'aging');
 assert.equal(boundedMetric(''),null);
 assert.equal(boundedMetric('not-a-number'),null);
 assert.equal(boundedMetric(1.2),null);
 assert.equal(boundedMetric(.999),100);
 assert.equal(evaluateTelemetryFreshness(null,T).status,'unknown');
});
test('boot failure never substitutes seed values from AuraOrganism defaults',()=>{
 const t=buildBrainTelemetry({runtime_ready:false,
  soul:{organism:{updated_at:new Date(T).toISOString(),
  stabilite:.75,clarte:.9,mood:'satisfaite'}}},{},T);
 assert.equal(t.source.status,'unavailable');
 assert.equal(t.metrics.every(v=>v.value===null),true);
 assert.equal(t.mood,'');
 assert.equal(t.language.response_verified,false);
});
test('brain UI is an actual server page with SVG neural anatomy, interactivity and chart',()=>{
 assert.match(BRAIN_HTML,/<html lang="fr">/);
 assert.match(BRAIN_HTML,/id="neuralCanvas"/);
 assert.match(BRAIN_HTML,/class="brain-path-left"/);
 assert.match(BRAIN_HTML,/class="brain-path-right"/);
 assert.match(BRAIN_HTML,/id="metrics"/);
 assert.match(BRAIN_HTML,/id="sourceTime"/);
 assert.match(BRAIN_HTML,/data-region="kernel"/);
 assert.match(BRAIN_HTML,/data-region="homeostasis"/);
 assert.match(BRAIN_HTML,/data-region="memory"/);
 assert.match(BRAIN_HTML,/data-region="cognition"/);
 assert.match(BRAIN_HTML,/data-region="language"/);
 assert.match(BRAIN_HTML,/data-region="coherence"/);
 assert.match(BRAIN_HTML,/data-region="actions"/);
 assert.match(BRAIN_HTML,/id="selectedFacts"/);
 assert.match(BRAIN_HTML,/id="refreshBrain"/);
 assert.match(BRAIN_HTML,/@media\(max-width:660px\)/);
 assert.match(BRAIN_HTML,/Ces pourcentages sont des états calculés/);
 assert.equal(BRAIN_METRICS.length,11);
 assert.doesNotThrow(()=>new Function(BRAIN_SCRIPT));
 assert.match(BRAIN_SCRIPT,/fetch\('\/api\/brain\/telemetry'/);
 assert.match(BRAIN_SCRIPT,/setInterval\(refresh,12000\)/);
 assert.match(BRAIN_SCRIPT,/t\.source\|\|\{\}/);
 assert.match(BRAIN_SCRIPT,/m\.value===null\?'—'/);
 assert.equal(BRAIN_HTML.includes(BRAIN_SCRIPT),true);
});
test('main dashboard contains a working link to full brain console without removing chat',()=>{
 assert.match(DASHBOARD_HTML,/href="\/cerveau" class="brain-open-link"/);
 assert.match(DASHBOARD_HTML,/href="\/cerveau" class="brain-card-open"/);
 assert.match(DASHBOARD_HTML,/class="panel chat"/);
 assert.match(DASHBOARD_HTML,/id="message"/);
});
test('the public read-only brain route exports no raw memory or bearer secrets',()=>{
 const src=fs.readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
 assert.match(src,/app\.get\('\/cerveau'/);
 assert.match(src,/app\.get\('\/api\/brain\/telemetry'/);
 const a=src.indexOf("app.get('/api/brain/telemetry'");
 const b=src.indexOf("app.get('/api/language/embedded/status'",a);
 const route=src.slice(a,b);
 assert.match(route,/publicOperationalSnapshot\(\)/);
 assert.match(route,/buildBrainTelemetry/);
 assert.doesNotMatch(route,/raw_private_memory|db\.query|privateKey|cloudToken/);
 assert.match(route,/Cache-Control','no-store'/);
});


test('fullscreen brain action is functional without disrupting the chat on the home page',()=>{
 assert.match(BRAIN_HTML,/id="brainFullscreen"/);
 assert.match(BRAIN_SCRIPT,/brainFullscreen'\)\.addEventListener\('click'/);
 assert.match(BRAIN_SCRIPT,/region\.requestFullscreen/);
 assert.match(BRAIN_SCRIPT,/document\.exitFullscreen/);
 assert.match(BRAIN_HTML,/\.stage:fullscreen/);
 assert.match(DASHBOARD_HTML,/id="messages"/);
});
