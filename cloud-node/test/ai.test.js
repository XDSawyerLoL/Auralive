import test from 'node:test';
import assert from 'node:assert/strict';

test('Gemini mode uses native generateContent API and exposes diagnostics', async () => {
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

  let request = null;
  globalThis.fetch = async (url, options = {}) => {
    request = {
      url: String(url),
      headers: options.headers || {},
      body: JSON.parse(String(options.body || '{}')),
    };
    return new Response(JSON.stringify({
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [{ text: 'Réponse Gemini OK' }],
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const { AiClient } = await import(`../src/ai.js?gemini-test=${Date.now()}`);
    const client = new AiClient();
    const answer = await client.generate('Bonjour', 'Tu es AURA.', 120);

    assert.equal(answer, 'Réponse Gemini OK');
    assert.match(request.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-test-model:generateContent$/);
    assert.equal(request.headers['x-goog-api-key'], 'test-secret');
    assert.equal(request.body.contents[0].parts[0].text, 'Bonjour');
    assert.equal(request.body.systemInstruction.parts[0].text, 'Tu es AURA.');

    const diagnostic = client.diagnostic();
    assert.equal(diagnostic.enabled, true);
    assert.equal(diagnostic.mode, 'gemini');
    assert.equal(diagnostic.provider, 'google-gemini');
    assert.equal(diagnostic.api_key_configured, true);
    assert.equal(diagnostic.last_error, '');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
