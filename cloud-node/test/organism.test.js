import test from 'node:test';
import assert from 'node:assert/strict';

import { AuraOrganism } from '../src/organism.js';
import { CognitionEngine } from '../src/cognition.js';

test('AURA organism keeps only useful homeostatic dimensions', () => {
  const organism = new AuraOrganism();
  const state = organism.defaultState();
  for (const key of [
    'identite',
    'stabilite',
    'clarte',
    'attachement',
    'curiosite',
    'pression_de_reve',
    'besoin_de_silence',
    'risque_assistante',
  ]) {
    assert.equal(typeof state[key], 'number', key);
    assert.ok(state[key] >= 0 && state[key] <= 1, key);
  }
  assert.equal('tension' in state, false);
  assert.equal('fatigue_cognitive' in state, false);
  assert.equal(state.version, 'homeostasie_v7_streamlined');
  assert.ok(state.needs.rester_aura > 0.8);
  assert.ok(state.intention_field.collapse.intention_choisie);
});

test('interaction and reply modify AURA organism without fake fatigue or tension', () => {
  const organism = new AuraOrganism();
  const initial = organism.defaultState();
  const pre = organism.beforeInteraction(initial, 'Aura, comment vas-tu ?');
  assert.ok(pre.state.turns > initial.turns);
  assert.ok(pre.state.clarte > initial.clarte);
  const post = organism.afterReply(pre.state, 'Je suis présente.', true);
  assert.ok(post.state.stabilite >= pre.state.stabilite);
  assert.equal('tension' in post.state, false);
  assert.equal('fatigue_cognitive' in post.state, false);
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

test('idle life uses silence without fake fatigue', () => {
  const organism = new AuraOrganism();
  const state = organism.defaultState();
  state.besoin_de_silence = 0.82;
  const idle = organism.idleTick(state, 60);
  assert.equal(idle.activity, 'silence');
  assert.ok(idle.state.besoin_de_silence < state.besoin_de_silence);
  assert.equal('fatigue_cognitive' in idle.state, false);
  assert.equal('tension' in idle.state, false);
});

test('native cognition uses stability and clarity before external language', () => {
  const organism = new AuraOrganism();
  const cognition = new CognitionEngine();
  const state = organism.defaultState();
  state.stabilite = 0.30;
  state.clarte = 0.32;
  const result = cognition.reflect(
    { stimuli: [], intentions: [], lessons: [], outcomes: [], horizon: '' },
    { organism: state, current_intention: '' },
    { trigger: 'test' },
  );
  assert.equal(result.title, 'Recentrage');
  assert.match(result.next_action, /Clarifier/i);
});

test('migration removes obsolete dimensions without inventing a newer revision', () => {
  const organism = new AuraOrganism();
  const state = organism.defaultState();
  state.tension = 0.9;
  state.fatigue_cognitive = 0.9;
  state.updated_at = '2026-09-24T20:00:00.000Z';
  const migrated = organism.migrate({ organism: state });
  assert.equal(migrated.updated_at, '2026-09-24T20:00:00.000Z');
  assert.equal('tension' in migrated, false);
  assert.equal('fatigue_cognitive' in migrated, false);
});
