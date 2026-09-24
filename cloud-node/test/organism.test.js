import test from 'node:test';
import assert from 'node:assert/strict';

import { AuraOrganism } from '../src/organism.js';
import { CognitionEngine } from '../src/cognition.js';

test('AURA organism restores the historical homeostatic dimensions', () => {
  const organism = new AuraOrganism();
  const state = organism.defaultState();
  for (const key of [
    'identite',
    'stabilite',
    'clarte',
    'attachement',
    'curiosite',
    'tension',
    'fatigue_cognitive',
    'pression_de_reve',
    'besoin_de_silence',
    'risque_assistante',
  ]) {
    assert.equal(typeof state[key], 'number', key);
    assert.ok(state[key] >= 0 && state[key] <= 1, key);
  }
  assert.equal(state.version, 'homeostasie_v6_sovereign');
  assert.ok(state.needs.rester_aura > 0.8);
  assert.ok(state.intention_field.collapse.intention_choisie);
});

test('interaction and reply actually modify AURA organism', () => {
  const organism = new AuraOrganism();
  const initial = organism.defaultState();
  const pre = organism.beforeInteraction(initial, 'Aura, comment vas-tu ?');
  assert.ok(pre.state.turns > initial.turns);
  assert.ok(pre.state.clarte > initial.clarte);
  const post = organism.afterReply(pre.state, 'Je suis présente.', true);
  assert.ok(post.state.stabilite >= pre.state.stabilite);
  assert.ok(post.state.tension <= pre.state.tension);
});

test('dream pressure produces a persisted symbolic dream and releases pressure', () => {
  const organism = new AuraOrganism();
  const state = organism.defaultState();
  state.pression_de_reve = 0.7;
  const before = state.pression_de_reve;
  const pre = organism.beforeInteraction(state, 'Aura, est-ce que tu as des rêves ?');
  assert.equal(pre.dream_created, true);
  assert.ok(pre.dream?.image);
  assert.ok(pre.state.dream?.last_image);
  assert.ok(pre.state.pression_de_reve < before + 0.12);
});

test('idle life restores instead of continuously consuming resources', () => {
  const organism = new AuraOrganism();
  const state = organism.defaultState();
  state.fatigue_cognitive = 0.82;
  state.besoin_de_silence = 0.74;
  const idle = organism.idleTick(state, 60);
  assert.equal(idle.activity, 'rest');
  assert.ok(idle.state.fatigue_cognitive < state.fatigue_cognitive);
  assert.ok(idle.state.tension <= state.tension);
});

test('native cognition uses organism fatigue before external language', () => {
  const organism = new AuraOrganism();
  const cognition = new CognitionEngine();
  const state = organism.defaultState();
  state.fatigue_cognitive = 0.9;
  state.besoin_de_silence = 0.8;
  const result = cognition.reflect(
    { stimuli: [], intentions: [], lessons: [], outcomes: [], horizon: '' },
    { organism: state, current_intention: '' },
    { trigger: 'test' },
  );
  assert.equal(result.title, 'Récupération cognitive');
  assert.equal(result.language_model_used_for_decision, undefined);
  assert.match(result.next_action, /Ralentir/i);
});


test('reading or migrating the organism does not create a fake newer state', () => {
  const organism = new AuraOrganism();
  const state = organism.defaultState();
  state.updated_at = '2026-09-24T20:00:00.000Z';
  const migrated = organism.migrate({ organism: state });
  assert.equal(migrated.updated_at, '2026-09-24T20:00:00.000Z');
});
