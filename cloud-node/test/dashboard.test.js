import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_HTML } from '../src/dashboard.js';

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

test('dashboard includes dynamic attention map and private access controls', () => {
  assert.equal(DASHBOARD_HTML.includes('id="attentionMap"'), true);
  assert.equal(DASHBOARD_HTML.includes('sessionStorage'), true);
  assert.equal(DASHBOARD_HTML.includes('AURA_CLOUD_TOKEN'), true);
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


test('dashboard speaks through the private Mairaiy voice bridge', () => {
  assert.equal(DASHBOARD_HTML.includes('/api/voice/speak'), true);
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


test('private dashboard login uses persistent secure session cookie', () => {
  for (const token of [
    '/api/auth/session',
    'createPrivateSession',
    'ensurePrivateSession',
    'credentials:\'same-origin\'',
    'Privé · connecté',
    'Session privée expirée',
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
});


test('mobile auth keeps a bearer fallback when cookies are not retained', () => {
  for (const token of [
    "localStorage.getItem('aura_token')",
    "localStorage.setItem('aura_token',token)",
    "localStorage.removeItem('aura_token')",
    "mode Bearer sécurisé local",
    "confirm.method==='cookie'",
  ]) {
    assert.equal(DASHBOARD_HTML.includes(token), true, token);
  }
});
