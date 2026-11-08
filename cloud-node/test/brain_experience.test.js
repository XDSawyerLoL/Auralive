import test from 'node:test';
import assert from 'node:assert/strict';
import {BRAIN_HTML} from '../src/brain_console.js';
import {BRAIN_EXPERIENCE_CSS} from '../src/brain_experience_style.js';
import {BRAIN_EXPERIENCE_SCRIPT} from '../src/brain_experience_runtime.js';
import {BRAIN_SCRIPT} from '../src/brain_console_runtime.js';
test('brain site includes true animated layers, live signal panel and responsive cockpit',()=>{
 for(const id of ['brainView','neuralCanvas','signalCanvas','brainTrend','hudStability',
 'hudEngagement','hudMemory','hudFreshness','brainMotionStatus','brainFullscreen',
 'brainChatInput','brainChatSend','brainChatToggle','brainChatLog']){
  assert.ok(BRAIN_HTML.includes('id="'+id+'"'),id+' missing');
 }
 assert.match(BRAIN_HTML,/class="neural-orbit"/);
 assert.match(BRAIN_HTML,/class="brain-scanner"/);
 assert.match(BRAIN_HTML,/Évolution observée du noyau/);
 assert.match(BRAIN_HTML,/Historique des relevés du serveur AURA ; aucune donnée simulée/);
 assert.match(BRAIN_HTML,/Conversation reliée au noyau/);
 assert.ok(BRAIN_HTML.includes(BRAIN_EXPERIENCE_CSS));
 assert.ok(BRAIN_HTML.includes(BRAIN_EXPERIENCE_SCRIPT));
 assert.ok(BRAIN_HTML.includes(BRAIN_SCRIPT));
});
test('visible animation is a browser-driven engine rather than an exported GIF',()=>{
 assert.doesNotThrow(()=>new Function(BRAIN_EXPERIENCE_SCRIPT));
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/requestAnimationFrame\(animate\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/globalCompositeOperation='lighter'/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/createRadialGradient/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/const fibers=Array.from/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/circle\(ox,oy,r\*2.2/);
 assert.match(BRAIN_EXPERIENCE_CSS,/@keyframes core-beat/);
 assert.match(BRAIN_EXPERIENCE_CSS,/@keyframes scanner-sweep/);
 assert.match(BRAIN_EXPERIENCE_CSS,/@keyframes orbit-breath/);
 assert.match(BRAIN_EXPERIENCE_CSS,/@keyframes brain-breathe/);
 assert.match(BRAIN_EXPERIENCE_CSS,/prefers-reduced-motion/);
 assert.doesNotMatch(BRAIN_HTML,/tableau_de_bord_aura_cerveau_vivant\.png|imagegen\.png/);
});
test('real telemetry feeds HUD/history, never fabricated samples or neural counts',()=>{
 assert.match(BRAIN_SCRIPT,/CustomEvent\('aura-brain-telemetry'/);
 assert.match(BRAIN_SCRIPT,/new Event\('aura-brain-offline'\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/addEventListener\('aura-brain-telemetry'/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/updateHistory\(lastTelemetry\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/history\.length<2/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/aucune courbe inventée/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/val\('stabilite'\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/val\('engagement'\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/metric\('engagement'\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/ANIMATION ARTISTIQUE/);
});
test('functional page chat uses existing safe endpoint, and never invents an unavailable reply',()=>{
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/fetch\('\/api\/chat'/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/body:JSON\.stringify\(\{text,author:'Utilisateur'\}\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/nucleus_verbalization_validated/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/data\?\.language_unavailable/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/Réponse indisponible/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/clearTimeout\(timer\)/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/addEventListener\('keydown'/);
 assert.match(BRAIN_EXPERIENCE_SCRIPT,/aria-expanded/);
 assert.match(BRAIN_EXPERIENCE_CSS,/\.chat-dock\{position:fixed/);
});
