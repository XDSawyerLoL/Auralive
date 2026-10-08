import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_HTML } from '../src/dashboard.js';
import { DASHBOARD_SCRIPT } from '../src/dashboard-runtime.js';

test('AURA chat-first interface exposes the essential surfaces without technical overload', () => {
  for (const label of [
    'Company OS',
    'AURA vivante',
    'Parler à AURA',
    'Ce qu’elle fait maintenant',
    'État d’AURA',
    'Entreprise agentique',
    'Afficher les détails techniques',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(label), true, label);
  }
});

test('dashboard is wired to live AURA APIs', () => {
  for (const endpoint of [
    '/api/dashboard/public',
    '/api/chat',
    '/api/capabilities',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(endpoint), true, endpoint);
  }
});

test('dashboard includes dynamic attention map without a manual token gate', () => {
  assert.equal(DASHBOARD_HTML.includes('id="attentionMap"'), true);
  assert.equal(DASHBOARD_HTML.includes('AURA_CLOUD_TOKEN'), false);
  assert.equal(DASHBOARD_HTML.includes('id="authBtn"'), false);
  assert.equal(DASHBOARD_HTML.includes('id="authDrawer"'), false);
});


test('desktop dashboard keeps conversation dominant and AURA compact', () => {
  assert.equal(DASHBOARD_HTML.includes('grid-template-columns:minmax(0,1fr) 330px'), true);
  assert.equal(DASHBOARD_HTML.includes('class="main"'), true);
  assert.equal(DASHBOARD_HTML.includes('class="panel chat"'), true);
  assert.equal(DASHBOARD_HTML.includes('class="side"'), true);
  assert.equal(DASHBOARD_HTML.includes('class="composer"'), true);
  assert.equal(DASHBOARD_HTML.includes('id="message"'), true);
  assert.equal(DASHBOARD_HTML.includes('id="send"'), true);
  assert.equal(DASHBOARD_HTML.includes("setLive(true,boot.runtime_ready?'En ligne · '+mood"), true);
});


test('living AURA map includes animated visual layers', () => {
  for (const token of [
    'id="nebulaFx"',
    'id="particleFx"',
    'class="aurora-vignette"',
    'id="energyPulses"',
    'initLivingAuraScene()',
    'requestAnimationFrame(frame)',
    "pulse.setAttribute('class','energy-pulse')",
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
});


test('dashboard speaks through the tokenless Mairaiy voice ticket bridge', () => {
  assert.equal(DASHBOARD_HTML.includes('/api/voice/speak'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('out.voice_ticket'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('ticket:ticket'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('if(!privateConnected||!text)return'), false);
  assert.equal(DASHBOARD_HTML.includes('audio_base64'), true);
  assert.equal(DASHBOARD_HTML.includes('aura-speaking'), true);
});


test('living AURA visuals are driven by Homeostasis v9 state', () => {
  for (const token of [
    'id="organismMood"',
    'id="organismDot"',
    'scene.organism',
    'const organism=(ks&&ks.organism)||(soul&&soul.organism)||{}',
    'const dynamics=o.dynamics||{}',
    'const agitation=Number(dynamics.agitation||0)',
    'const activation=Number(dynamics.activation||0)',
    'const recovery=Number(dynamics.recovery||0)',
    'const dream=Number(o.pression_de_reve||0)',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
  assert.equal(DASHBOARD_HTML.includes('fatigue_cognitive'), false);
  assert.equal(DASHBOARD_HTML.includes('o.tension'), false);
});


test('dashboard direct mode clears obsolete browser token state', () => {
  assert.equal(DASHBOARD_HTML.includes("localStorage.removeItem('aura_token')"), true);
  assert.equal(DASHBOARD_HTML.includes("sessionStorage.removeItem('aura_token')"), true);
  assert.equal(DASHBOARD_HTML.includes('ensurePrivateSession'), false);
});

test('dashboard live metrics survive optional mobile visual failures', () => {
  assert.equal(DASHBOARD_HTML.includes("if(!nctx||!pctx)"), true);
  assert.equal(DASHBOARD_HTML.includes("refresh();try{initLivingAuraScene();}catch(error)"), true);
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


test('dashboard exposes exact Mairaiy readiness without a generic TTS escape hatch', () => {
  assert.equal(DASHBOARD_HTML.includes('id="voiceDot"'), true);
  assert.equal(DASHBOARD_HTML.includes('id="voiceText"'), true);
  assert.equal(DASHBOARD_SCRIPT.includes("api('/api/capabilities')"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("Mairaiy · Aoede"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("Gemini TTS · Aoede · fr-fr"), true);
  assert.equal(DASHBOARD_SCRIPT.includes('browserVoiceAvailable()'), false);
});


test('dashboard keeps full Homeostasis v9 available in the collapsed detail surface', () => {
  for (const token of [
    'État d’AURA',
    'id="emotionMood"',
    'id="emotionReason"',
    'id="emotion-stability"',
    'id="emotion-clarity"',
    'id="emotion-attachment"',
    'id="emotion-curiosity"',
    'id="emotion-engagement"',
    'id="emotion-confidence"',
    'id="emotion-agency"',
    'id="emotion-satisfaction"',
    'id="emotion-frustration"',
    'id="emotion-social"',
    'id="emotion-dream"',
    'id="emotion-silence"',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
  assert.equal(DASHBOARD_SCRIPT.includes('renderEmotion(organism)'), true);
});

test('mobile dashboard keeps chat readable and primary', () => {
  assert.equal(DASHBOARD_HTML.includes('@media(max-width:640px)'), true);
  assert.equal(DASHBOARD_HTML.includes('.composer textarea{font-size:16px'), true);
  assert.equal(DASHBOARD_HTML.includes('.msg{font-size:15px'), true);
  assert.equal(DASHBOARD_HTML.includes('.chat{min-height:calc(100svh - 68px)}'), true);
  assert.equal(DASHBOARD_HTML.includes('.map-wrap{height:165px}'), true);
});

test('mobile voice primes audio but never substitutes a device TTS for Mairaiy', () => {
  assert.equal(DASHBOARD_SCRIPT.includes('primeVoice();'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('speakBrowserFallback(text)'), false);
  assert.equal(DASHBOARD_SCRIPT.includes('SpeechSynthesisUtterance'), false);
  assert.equal(DASHBOARD_SCRIPT.includes('aucun autre timbre utilisé'), true);
});

test('chat send path cannot be blocked by voice priming', () => {
  assert.match(DASHBOARD_SCRIPT, /function primeVoice\(\)/);
  assert.match(DASHBOARD_SCRIPT, /try\{primeVoice\(\);\}catch\(_\)\{\}/);
  assert.match(DASHBOARD_SCRIPT, /api\('\/api\/chat',\{method:'POST'/);
});


test('long Mairaiy responses play every generated exact-voice segment in sequence', () => {
  assert.equal(DASHBOARD_SCRIPT.includes("Array.isArray(out&&out.segments)"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("await playVoiceSegment(segments[i])"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("splitBrowserSpeech(text,220)"), false);
});

test('living visualization uses calmer motion and a 30fps stability cap', () => {
  assert.equal(DASHBOARD_SCRIPT.includes("mobile?44:108"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("t-scene.lastFrame<30"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("Math.sin(t*.00042+phase)*1.6"), true);
});


test('dashboard renders the public operational projection without locked placeholders', () => {
  assert.match(DASHBOARD_SCRIPT, /api\('\/api\/dashboard\/public'\)/);
  assert.equal(DASHBOARD_SCRIPT.includes('/api/auth/session'), false);
  assert.equal(DASHBOARD_SCRIPT.includes('Détails privés'), false);
  assert.equal(DASHBOARD_SCRIPT.includes('Mémoire privée'), false);
  assert.equal(DASHBOARD_SCRIPT.includes('Travail détaillé privé'), false);
});



test('dashboard keeps autonomous capability scouting available in technical details', () => {
  for (const token of [
    'Veille',
    'id="scoutMeta"',
    'id="scoutList"',
    'renderScout(scoutStatus)',
    'Sans prompt',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token) || DASHBOARD_SCRIPT.includes(token), true, token);
  }
});

test('dashboard exposes operational command-center state instead of decorative autonomy', () => {
  for (const token of [
    'id="commandState"',
    'id="commandFleet"',
    'id="commandMode"',
    'id="commandCount"',
    'const commandStatus=publicState.command||null',
    'renderCommandCenter(commandStatus',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
  assert.equal(DASHBOARD_SCRIPT.includes("github_write_authority?'Agit + observe':'Observe + planifie'"), true);
});


test('dashboard no longer clutters the primary screen with download cards', () => {
  assert.equal(DASHBOARD_HTML.includes('download-grid'), false);
  assert.equal(DASHBOARD_HTML.includes('class="download-panel"'), false);
});


test('dashboard exposes the verifiable minimal conversation identity', () => {
  assert.equal(DASHBOARD_HTML.includes('data-aura-ui="minimal-conversation-v2"'), true);
  assert.equal(DASHBOARD_HTML.includes('Company OS'), true);
  assert.equal(DASHBOARD_HTML.includes('Parler à AURA'), true);
  for (const label of ['Énergie','Curiosité','Pression','Continuité','Introspection','Réactivité']) {
    assert.equal(DASHBOARD_HTML.includes(label), true, label);
  }
});


test('browser audio is unlocked through Web Audio before the asynchronous TTS request', () => {
  assert.equal(DASHBOARD_SCRIPT.includes('window.AudioContext||window.webkitAudioContext'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('voiceAudioContext.resume()'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('decodeAudioData(copy)'), true);
  assert.equal(DASHBOARD_SCRIPT.includes('createBufferSource()'), true);
  assert.equal(DASHBOARD_SCRIPT.includes("error.name==='NotAllowedError'"), true);
  assert.equal(DASHBOARD_SCRIPT.includes('Le navigateur bloque le son'), true);
});

test('dashboard exposes the exact Cloud voice blocker instead of a generic offline label', () => {
  assert.equal(DASHBOARD_SCRIPT.includes("voice.cloud_reason"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("free-tier-unconfirmed"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("missing-api-key"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("garde-fou zéro-coût"), true);
});


test('conversation remains directly usable without opening technical details', () => {
  const chatIndex = DASHBOARD_HTML.indexOf('class="panel chat"');
  const detailsIndex = DASHBOARD_HTML.indexOf('<details class="panel details">');
  const composerIndex = DASHBOARD_HTML.indexOf('class="composer"', chatIndex);
  assert.ok(chatIndex >= 0);
  assert.ok(composerIndex > chatIndex);
  assert.ok(detailsIndex > composerIndex);
  assert.match(DASHBOARD_SCRIPT, /\$\('send'\)\.onclick=function\(\)\{sendMessage\(\$\('message'\)\.value\);\};/);
  assert.match(DASHBOARD_SCRIPT, /api\('\/api\/chat',\{method:'POST'/);
});

test('technical information is collapsed by default', () => {
  assert.match(DASHBOARD_HTML, /<details class="panel details">/);
  assert.doesNotMatch(DASHBOARD_HTML, /<details class="panel details" open>/);
});


test('dashboard reports native dialogue as healthy when semantic model is absent', () => {
  assert.match(DASHBOARD_SCRIPT, /Dialogue · natif/);
  assert.match(DASHBOARD_SCRIPT, /native_dialogue_ready/);
  assert.doesNotMatch(DASHBOARD_SCRIPT, /Dialogue · secours/);
});

test('unconfigured Mairaiy is a warning, not a false runtime failure', () => {
  assert.match(DASHBOARD_HTML, /live-dot\.warn/);
  assert.match(DASHBOARD_SCRIPT, /Mairaiy · à configurer/);
  assert.match(DASHBOARD_SCRIPT, /voiceReady\?'good':'warn'/);
});
