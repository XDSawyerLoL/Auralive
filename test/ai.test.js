import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Gemini mode uses native generateContent API and exposes diagnostics', async () => {
  const originalFetch = globalThis.fetch;
  const previous = {
    AURA_ZERO_COST_MODE: process.env.AURA_ZERO_COST_MODE,
    AI_MODE: process.env.AI_MODE,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_MODEL: process.env.AI_MODEL,
    AI_API_KEY: process.env.AI_API_KEY,
  };

  process.env.AURA_ZERO_COST_MODE = 'false';
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


test('confirmed Gemini free tier can restore natural text while zero-cost mode stays enabled', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AURA_GEMINI_FREE_TIER_CONFIRMED='true';
    process.env.AURA_GEMINI_FREE_TIER_TEXT_MAX_PER_DAY='5';
    process.env.AI_MODE='gemini';
    process.env.AI_MODEL='gemini-3.5-flash-lite';
    process.env.AI_API_KEY='free-tier-test-key';
    process.env.DB_HOST='';
    process.env.DB_USER='';
    process.env.DB_PASSWORD='';
    process.env.DB_NAME='';
    process.env.DATABASE_URL='';
    process.env.MYSQL_URL='';
    global.fetch=async()=>new Response(JSON.stringify({
      candidates:[{finishReason:'STOP',content:{parts:[{text:'Dialogue naturel'}]}}]
    }),{status:200,headers:{'content-type':'application/json'}});
    const { AiClient }=await import('./src/ai.js');
    const ai=new AiClient();
    const answer=await ai.generate('Salut','Tu es AURA',100,'conversation');
    console.log(JSON.stringify({answer,diag:ai.diagnostic()}));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: { ...process.env },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload=JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.answer,'Dialogue naturel');
  assert.equal(payload.diag.zero_cost_mode,true);
  assert.equal(payload.diag.gemini_free_tier_confirmed,true);
  assert.equal(payload.diag.remote_fallback_blocked,false);
});
