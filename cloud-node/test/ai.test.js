import test from 'node:test';
import assert from 'node:assert/strict';

test('Gemini is text-blocked and reserved for the separate Mairaiy voice path', async () => {
  const originalFetch = globalThis.fetch;
  const previous = {
    AI_MODE: process.env.AI_MODE,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    AI_API_KEY: process.env.AI_API_KEY,
  };

  process.env.AI_MODE = 'gemini';
  process.env.AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
  process.env.AI_MODEL = 'gemini-test-model';
  process.env.AI_API_KEY = 'test-secret';

  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Gemini text endpoint must not be called');
  };

  try {
    const { AiClient } = await import(`../src/ai.js?gemini-tts-only=${Date.now()}`);
    const client = new AiClient();
    const answer = await client.generate('Bonjour', 'Tu es AURA.', 120);

    assert.equal(answer, '');
    assert.equal(fetchCalls, 0);

    const diagnostic = client.diagnostic();
    assert.equal(diagnostic.enabled, false);
    assert.equal(diagnostic.mode, 'gemini');
    assert.equal(diagnostic.provider, 'google-gemini-tts-only');
    assert.equal(diagnostic.gemini_text_allowed, false);
    assert.equal(diagnostic.gemini_policy, 'tts-only');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
