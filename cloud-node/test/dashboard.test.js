import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_HTML } from '../src/dashboard.js';
import { DASHBOARD_SCRIPT } from '../src/dashboard-runtime.js';
import { NEURAL_FIELD_SCRIPT } from '../src/neural-field-renderer.js';

test('AURA V7 exposes an immersive readable neural environment and secondary detail surfaces', () => {
  for (const label of [
    'Interface de conscience opérationnelle',
    'Dialogue',
    'Carte d’intérêt · champ neuronal cosmique',
    'Pensée dominante',
    'Travail en cours',
    'État émotionnel & cognitif',
    'Intentions actives',
    'Centre de commande',
    'Mémoire et leçons',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(label), true, label);
  }
  assert.equal(DASHBOARD_HTML.includes('class="bottom-dock"'), true);
  assert.equal(DASHBOARD_HTML.includes('class="detail-drawer"'), true);
});

test('dashboard is wired to live AURA APIs', () => {
  for (const endpoint of [
    '/api/kernel/soul',
    '/api/kernel/intentions',
    '/api/kernel/lessons',
    '/api/kernel/activity',
    '/api/kernel/work',
    '/api/kernel/attention',
    '/api/chat',
    '/api/command/status',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(endpoint), true, endpoint);
  }
});

test('dashboard includes dynamic cosmic neural field without a manual token gate', () => {
  assert.equal(DASHBOARD_HTML.includes('id="neuralFieldCanvas"'), true);
  assert.equal(DASHBOARD_HTML.includes('Carte d’intérêt · champ neuronal cosmique'), true);
  assert.equal(DASHBOARD_HTML.includes('AURA_CLOUD_TOKEN'), false);
  assert.equal(DASHBOARD_HTML.includes('id="authBtn"'), false);
  assert.equal(DASHBOARD_HTML.includes('id="authDrawer"'), false);
});


test('desktop dashboard keeps a focused three-column composition', () => {
  assert.equal(DASHBOARD_HTML.includes('grid-template-areas:"chat map side"'), true);
  assert.equal(DASHBOARD_HTML.includes('grid-area:chat'), true);
  assert.equal(DASHBOARD_HTML.includes('grid-area:map'), true);
  assert.equal(DASHBOARD_HTML.includes('grid-area:side'), true);
  assert.equal(DASHBOARD_HTML.includes('body.map-focus .chat-panel'), true);
  assert.equal(DASHBOARD_HTML.includes("setLive(true,boot.runtime_ready?'En ligne · '+mood"), true);
});


test('living AURA field is Canvas-rendered with cosmic and neural layers', () => {
  for (const token of [
    'id="neuralFieldCanvas"',
    'id="neuralTooltip"',
    'id="mapStats"',
    'requestAnimationFrame(frame)',
    'drawBackground(t)',
    'drawSynapses(t)',
    'drawNeuron(node,t)',
    'drawDendrites(node,p,t)',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
  assert.equal(DASHBOARD_HTML.includes('id="attentionMap"'), false);
});


test('dashboard speaks through the tokenless Mairaiy voice ticket bridge', () => {
  assert.equal(DASHBOARD_HTML.includes('/api/voice/speak'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('out.voice_ticket'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('ticket:ticket'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('if(!privateConnected||!text)return'), false);
  assert.equal(DASHBOARD_HTML.includes('audio_base64'), true);
  assert.equal(DASHBOARD_HTML.includes('aura-speaking'), true);
});


test('living AURA visuals remain connected to live organism and neural state', () => {
  for (const token of [
    'id="organismMood"',
    'id="organismDot"',
    'const organism=(ks&&ks.organism)||(soul&&soul.organism)||{}',
    "window.AURANeuralField.render(data)",
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
});


test('dashboard direct mode clears obsolete browser token state', () => {
  assert.equal(DASHBOARD_HTML.includes("localStorage.removeItem('aura_token')"), true);
  assert.equal(DASHBOARD_HTML.includes("sessionStorage.removeItem('aura_token')"), true);
  assert.equal(DASHBOARD_HTML.includes('ensurePrivateSession'), false);
});

test('dashboard live metrics survive optional neural visual failures', () => {
  assert.equal(DASHBOARD_HTML.includes("refresh();try{initLivingAuraScene();}catch(error)"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("if(window.AURANeuralField&&typeof window.AURANeuralField.render==='function')"), true);
  const metricsIndex = DASHBOARD_HTML.indexOf("metric('energy',soul.energy,boot.runtime_ready)");
  const organismIndex = DASHBOARD_HTML.indexOf("const organism=(ks&&ks.organism)||(soul&&soul.organism)||{}");
  assert.ok(metricsIndex >= 0);
  assert.ok(organismIndex > metricsIndex);
});


test('embedded dashboard script parses as browser JavaScript', () => {
  const match = DASHBOARD_HTML.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match && match[1], 'inline dashboard script missing');
  assert.doesNotThrow(() => new Function(match[1]));
});


test('dashboard runtime is an independently testable module', () => {
  assert.ok(DASHBOARD_SCRIPT.length > 1000);
  assert.doesNotThrow(() => new Function(DASHBOARD_SCRIPT));
  assert.equal(DASHBOARD_HTML.includes(DASHBOARD_SCRIPT), true);
});


test('dashboard exposes always-online Mairaiy readiness without a login drawer', () => {
  assert.equal(DASHBOARD_HTML.includes('id="voiceDot"'), true);
  assert.equal(DASHBOARD_HTML.includes('id="voiceText"'), true);
  assert.equal(DASHBOARD_SCRIPT.includes("api('/api/capabilities')"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("Mairaiy · en ligne"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("Voix Mairaiy Cloud active"), true);
  assert.equal(DASHBOARD_SCRIPT.includes('browserVoiceAvailable()'), true);
});


test('dashboard exposes a dedicated emotional state surface', () => {
  for (const token of [
    'État émotionnel',
    'id="emotionMood"',
    'id="emotionReason"',
    'id="emotion-stability"',
    'id="emotion-clarity"',
    'id="emotion-attachment"',
    'id="emotion-curiosity"',
    'id="emotion-dream"',
    'id="emotion-silence"',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
  assert.equal(DASHBOARD_SCRIPT.includes('renderEmotion(organism)'), true);
});

test('mobile dashboard uses readable phone typography and viewport-sized panels', () => {
  assert.equal(DASHBOARD_HTML.includes('@media(max-width:480px)'), true);
  assert.equal(DASHBOARD_HTML.includes('.composer textarea{font-size:16px'), true);
  assert.equal(DASHBOARD_HTML.includes('.msg{font-size:15px'), true);
  assert.equal(DASHBOARD_HTML.includes('.chat-panel{min-height:70svh}'), true);
  assert.equal(DASHBOARD_HTML.includes('.top-actions{width:100%'), true);
});

test('mobile voice primes audio and falls back to device speech when needed', () => {
  assert.equal(DASHBOARD_SCRIPT.includes('primeVoice();'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('speakBrowserFallback(text)'), true);
  assert.equal(DASHBOARD_SCRIPT.includes("utterance.lang='fr-FR'"), true);
});


test('long Mairaiy responses play every generated segment in sequence', () => {
  assert.equal(DASHBOARD_SCRIPT.includes("Array.isArray(out&&out.segments)"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("await playVoiceSegment(segments[i])"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("splitBrowserSpeech(text,220)"), true);
});

test('cosmic neural renderer uses bounded motion and reduced-motion support', () => {
  assert.match(NEURAL_FIELD_SCRIPT, /prefers-reduced-motion/);
  assert.match(NEURAL_FIELD_SCRIPT, /stepNeuralField\(state\.field\)/);
  assert.match(NEURAL_FIELD_SCRIPT, /settleNeuralField\(state\.field/);
  assert.match(NEURAL_FIELD_SCRIPT, /Math\.min\(window\.devicePixelRatio\|\|1,1\.7\)/);
});


test('dashboard refresh exposes safe public operational state without authentication', () => {
  assert.match(DASHBOARD_SCRIPT, /api\('\/api\/auth\/session'\)/);
  assert.match(DASHBOARD_SCRIPT, /privateView\?'\/api\/kernel\/soul':'\/api\/kernel\/public'/);
  assert.match(DASHBOARD_SCRIPT, /\/api\/kernel\/public\/intentions/);
  assert.match(DASHBOARD_SCRIPT, /\/api\/kernel\/public\/lessons/);
  assert.match(DASHBOARD_SCRIPT, /\/api\/kernel\/public\/activity/);
  assert.match(DASHBOARD_SCRIPT, /\/api\/kernel\/public\/work/);
  assert.match(DASHBOARD_SCRIPT, /\/api\/kernel\/public\/attention/);
});

test('dashboard exposes operational command-center state instead of decorative autonomy', () => {
  for (const token of [
    'id="commandState"',
    'id="commandFleet"',
    'id="commandMode"',
    'id="commandCount"',
    "api('/api/command/status')",
    'renderCommandCenter(commandStatus',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
  assert.equal(DASHBOARD_SCRIPT.includes("github_write_authority?'Agit + observe':'Observe + planifie'"), true);
});


test('dashboard keeps Quantic Glide downloads available inside the secondary system surface', () => {
  for (const token of [
    'Quantic Glide',
    'Windows x64',
    'Android',
    'href="/downloads/glide/windows"',
    'href="/downloads/glide/android"',
    '>.exe<',
    '>.apk<',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
});


test('cosmic neural renderer is independently parseable browser JavaScript', () => {
  assert.ok(NEURAL_FIELD_SCRIPT.length > 3000);
  assert.doesNotThrow(() => new Function(NEURAL_FIELD_SCRIPT));
  assert.equal(DASHBOARD_HTML.includes(NEURAL_FIELD_SCRIPT), true);
});

test('cosmic neural field uses a curated set of semantic labels instead of a text wall', () => {
  assert.match(NEURAL_FIELD_SCRIPT, /visibleLabels\.includes\(node\.id\)/);
  assert.match(NEURAL_FIELD_SCRIPT, /slice\(0,8\)/);
  assert.match(DASHBOARD_HTML, /Auréole/);
});


test('UX V6 makes the neural field the full environment instead of a boxed dashboard panel', () => {
  assert.equal((DASHBOARD_HTML.match(/class="overview-card/g)||[]).length, 0);
  assert.match(DASHBOARD_HTML, /\.map-panel\{\s*position:absolute!important/);
  assert.match(DASHBOARD_HTML, /\.chat-panel\{\s*position:absolute!important/);
  assert.match(DASHBOARD_HTML, /\.right-stack\{\s*position:absolute!important/);
  assert.match(DASHBOARD_HTML, /État émotionnel & cognitif/);
  assert.match(DASHBOARD_HTML, /data-detail="intentions"/);
  assert.match(DASHBOARD_HTML, /data-detail="memory"/);
  assert.match(DASHBOARD_HTML, /data-detail="explore"/);
  assert.match(DASHBOARD_HTML, /data-detail="system"/);
  assert.match(DASHBOARD_SCRIPT, /rows\.slice\(0,3\)/);
  assert.match(DASHBOARD_SCRIPT, /function toggleMapFocus\(/);
  assert.match(DASHBOARD_SCRIPT, /function setDetailView\(/);
});

test('UX V6 renders live cognitive metrics inside the floating right cockpit panel', () => {
  for (const id of ['cogEnergyBar','cogCuriosityBar','cogContinuityBar','emotionMood','emotionReason','dominantMoodTag','dominantIntentTag']) {
    assert.equal(DASHBOARD_HTML.includes('id="'+id+'"'), true, id);
  }
  assert.match(DASHBOARD_SCRIPT, /cogEnergyBar/);
  assert.match(DASHBOARD_SCRIPT, /cogCuriosityBar/);
  assert.match(DASHBOARD_SCRIPT, /cogContinuityBar/);
  assert.match(DASHBOARD_SCRIPT, /thoughtRaw\.length>230/);
});

test('UX V6 neural field includes immersive core, bloom and galaxy primitives', () => {
  for (const token of [
    'drawAuraBloom(t)',
    'drawAuraCosmicArms(t)',
    'visibleLabels',
    'ctx.ellipse(p.x,p.y',
    'drawMicroNetwork(node,p,t)',
    'globalCompositeOperation=\'lighter\'',
  ]) {
    assert.ok(NEURAL_FIELD_SCRIPT.includes(token), token);
  }
});


test('UX V7 deliberately increases desktop readability', () => {
  for (const token of [
    'width:min(370px,27vw)!important',
    'width:min(390px,28vw)!important',
    'font-size:13px!important',
    'font-size:24px!important',
    'font-size:13px Inter,system-ui,sans-serif',
  ]) {
    assert.ok(DASHBOARD_HTML.includes(token) || NEURAL_FIELD_SCRIPT.includes(token), token);
  }
});
