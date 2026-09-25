import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_HTML } from '../src/dashboard.js';
import { DASHBOARD_SCRIPT } from '../src/dashboard-runtime.js';

test('AURA operational consciousness interface exposes core product surfaces', () => {
  for (const label of [
    'Interface de conscience opérationnelle',
    'Dialogue',
    'Carte d’intérêt',
    'Pensée dominante',
    'Travail en cours',
    'Intentions actives',
    'Ce qu’elle fait maintenant',
    'Prochaine action probable',
    'Mémoire et leçons',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(label), true, label);
  }
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


test('desktop dashboard keeps the reference composition', () => {
  assert.equal(DASHBOARD_HTML.includes('grid-template-areas:'), true);
  assert.equal(DASHBOARD_HTML.includes('"chat map side"'), true);
  assert.equal(DASHBOARD_HTML.includes('"chat bottom bottom"'), true);
  assert.equal(DASHBOARD_HTML.includes('grid-area:chat'), true);
  assert.equal(DASHBOARD_HTML.includes('grid-area:map'), true);
  assert.equal(DASHBOARD_HTML.includes('grid-area:side'), true);
  assert.equal(DASHBOARD_HTML.includes('grid-area:bottom'), true);
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


test('living AURA visuals are driven by the organism state', () => {
  for (const token of [
    'id="organismMood"',
    'id="organismDot"',
    'scene.organism',
    'const organism=(ks&&ks.organism)||(soul&&soul.organism)||{}',
    'const tension=Number(o.tension||0)',
    'const dream=Number(o.pression_de_reve||0)',
    'const fatigue=Number(o.fatigue_cognitive||0)',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
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

test('living visualization uses calmer motion and a 30fps stability cap', () => {
  assert.equal(DASHBOARD_SCRIPT.includes("mobile?44:108"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("t-scene.lastFrame<30"), true);
  assert.equal(DASHBOARD_SCRIPT.includes("Math.sin(t*.00042+phase)*1.6"), true);
});
