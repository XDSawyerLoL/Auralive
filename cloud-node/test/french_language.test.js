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


test('unconfigured language reports a useful setup hint without exposing a secret', async () => {
  const faculty = new FrenchLanguageFaculty({
    federation: { enabled: false, snapshot: () => ({ enabled: false, zero_cost_mode: true, api_key_configured: false }) },
    bridge: null,
  });
  const status = await faculty.status();
  assert.equal(status.blocking_reason, 'openrouter-free-key-missing');
  assert.match(status.setup_hint, /AURA_OPENROUTER_API_KEY/);
  assert.equal(status.verified_ready, false);
});


test('free provider failures identify actual cause without exposing the provider payload', async () => {
  const { classifyFreeLanguageFailure } = await import('../src/french_language.js');
  const cases = [
    ['OpenRouter free HTTP 401: invalid api key', 'openrouter-auth-rejected', /clé/],
    ['OpenRouter free HTTP 402: negative balance', 'openrouter-account-restricted', /compte/],
    ['OpenRouter free HTTP 403: forbidden', 'openrouter-access-denied', /refuse/],
    ['OpenRouter free HTTP 429: Rate limit exceeded', 'free-model-rate-limited', /Quota/],
    ['Request aborted by AbortError: timed out', 'provider-network-timeout', /HTTPS/],
    ['OpenRouter free response empty', 'free-model-empty-response', /sans texte/],
    ['ZERO_COST_INVARIANT_VIOLATION', 'free-model-safety-blocked', /zéro coût/],
  ];
  for (const [source, expectedCode, hint] of cases) {
    const classified = classifyFreeLanguageFailure(source);
    assert.equal(classified.code, expectedCode, source);
    assert.match(classified.hint, hint, source);
    assert.doesNotMatch(classified.hint, /sk-testsecret/i);
  }
});

test('failed configured federation advertises true root cause and never pretends readiness', async () => {
  const ai = {
    federation: {
      enabled: true,
      snapshot: () => ({
        enabled: true, zero_cost_mode: true, api_key_configured: true,
        last_error: 'OpenRouter free HTTP 429: Rate limit exceeded'
      }),
      async generate() { throw new Error('OpenRouter free HTTP 429: Rate limit exceeded'); },
    },
    bridge: null,
  };
  const faculty = new FrenchLanguageFaculty(ai);
  assert.equal(await faculty.generate({ user_text: 'salut' }), '');
  const status = await faculty.status();
  assert.equal(status.blocking_reason, 'free-model-rate-limited');
  assert.equal(status.ready, true);
  assert.equal(status.verified_ready, false);
  assert.match(status.setup_hint, /Quota/);
});
