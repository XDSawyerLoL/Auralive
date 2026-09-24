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
  assert.equal(DASHBOARD_HTML.includes('En ligne · conscience active'), true);
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
