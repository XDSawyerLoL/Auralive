import test from 'node:test';
import assert from 'node:assert/strict';

import { FrenchLanguageFaculty } from '../src/french_language.js';

test('French faculty prefers cloud zero-cost federation over local runtime', async () => {
  const calls = [];
  const ai = {
    federation: {
      enabled: true,
      snapshot: () => ({ enabled: true, zero_cost_mode: true }),
      async generate(prompt, system, maxTokens, role) {
        calls.push({ source: 'federation', role });
        return { answer: 'Réponse française libre.', provider: 'openrouter', model: 'free/model:free' };
      },
    },
    bridge: {
      enabled: true,
      async workerOnline() { return true; },
      async infer() {
        calls.push({ source: 'local' });
        return 'Réponse locale.';
      },
    },
  };

  const faculty = new FrenchLanguageFaculty(ai);
  const answer = await faculty.generate({
    user_text: 'salut',
    goal: 'répondre naturellement',
    facts: ['AURA est disponible.'],
    conversation_context: [],
  });

  assert.equal(answer, 'Réponse française libre.');
  assert.deepEqual(calls, [{ source: 'federation', role: 'french' }]);
});

test('French faculty falls back to local multilingual runtime only when federation is unavailable', async () => {
  const ai = {
    federation: {
      enabled: false,
      snapshot: () => ({ enabled: false, zero_cost_mode: true }),
    },
    bridge: {
      enabled: true,
      async workerOnline() { return true; },
      async infer(prompt, system, maxTokens, role) {
        assert.equal(role, 'conversation');
        assert.match(system, /faculté linguistique française/i);
        return 'Je parle naturellement via le runtime local.';
      },
    },
  };

  const faculty = new FrenchLanguageFaculty(ai);
  const answer = await faculty.generate({
    user_text: 'ça va ?',
    goal: 'répondre à une question de bien-être',
    facts: ['Humeur interne : satisfaite.'],
    conversation_context: [],
  });
  assert.equal(answer, 'Je parle naturellement via le runtime local.');

  const status = await faculty.status();
  assert.equal(status.ready, true);
  assert.equal(status.primary, 'runtime-local');
  assert.equal(status.normal_path_scripted, false);
});

test('French faculty reports unavailable instead of pretending scripted language is natural', async () => {
  const faculty = new FrenchLanguageFaculty({
    federation: {
      enabled: false,
      snapshot: () => ({ enabled: false, zero_cost_mode: true }),
    },
    bridge: null,
  });
  const status = await faculty.status();
  assert.equal(status.ready, false);
  assert.equal(status.primary, 'unavailable');
  assert.equal(status.emergency_fallback_only, true);
});
