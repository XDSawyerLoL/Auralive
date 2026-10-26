import test from 'node:test';
import assert from 'node:assert/strict';
import { GroqFreeSpeech } from '../src/groq_free_speech.js';
import { FrenchLanguageFaculty } from '../src/french_language.js';
import { ExpressionLayer } from '../src/expression.js';

const freeEnv = () => ({
  AURA_GROQ_API_KEY: 'TEST_NON_SECRET',
  AURA_GROQ_SPEECH_FREE_ENABLED: 'true',
  AURA_GROQ_FREE_PLAN_CONFIRMED: 'true',
  AURA_GROQ_SPEECH_MODEL: 'qwen/qwen3.8-27b',
  AURA_GROQ_SPEECH_MAX_PER_DAY: '2',
});
const response = (content, status = 200) => ({
  ok: status === 200, status, async json() {
    return { choices: [{ message: { content } }] };
  },
});
const embeddedOff = () => ({
  status: () => ({ installed: false, ready: false, provisioning: { stage: 'not-started' } }),
  async generate() { throw Error('not configured'); },
});

test('Groq needs both a key and explicit Free-plan confirmation', async () => {
  let requests = 0;
  const request = async () => { requests++; return response('Bonjour.'); };
  const env = freeEnv();
  for (const overrides of [
    { AURA_GROQ_FREE_PLAN_CONFIRMED: 'false' },
    { AURA_GROQ_SPEECH_FREE_ENABLED: 'false' },
    { AURA_GROQ_API_KEY: '' },
    { AURA_GROQ_SPEECH_MODEL: 'llama-3.3-70b-versatile' },
  ]) {
    const groq = new GroqFreeSpeech({ env: { ...env, ...overrides }, request });
    assert.equal(groq.enabled, false);
    assert.equal(await groq.generate('message', 'system'), '');
  }
  assert.equal(requests, 0);
});

test('Free Groq is expression-only with no tools or paid service tier', async () => {
  let actual;
  const groq = new GroqFreeSpeech({
    env: freeEnv(),
    request: async (url, options) => {
      actual = { url, options };
      return response('D’accord, tu peux me dire ce que tu souhaites vérifier.');
    },
  });
  const answer = await groq.generate('Cool', 'Réponds en français', 1000);
  assert.match(answer, /D’accord/);
  assert.equal(actual.url, 'https://api.groq.com/openai/v1/chat/completions');
  const body = JSON.parse(actual.options.body);
  assert.equal(body.tool_choice, 'none');
  assert.ok(body.max_completion_tokens <= 600);
  assert.equal(body.model, 'qwen/qwen3.8-27b');
  assert.equal(body.service_tier, undefined);
  assert.equal(groq.snapshot().role, 'expression-only');
  assert.ok(!JSON.stringify(groq.snapshot()).includes('TEST_NON_SECRET'));
});

test('Free plan process cap is fail-closed after the configured daily limit', async () => {
  let count = 0;
  const groq = new GroqFreeSpeech({
    env: freeEnv(),
    request: async () => { count++; return response('Réponse générée.'); },
    date: () => '2026-10-26',
  });
  assert.ok(await groq.generate('a', 'b'));
  assert.ok(await groq.generate('a', 'b'));
  assert.equal(await groq.generate('a', 'b'), '');
  assert.equal(count, 2);
  assert.equal(groq.lastError, 'groq-free-daily-budget-reached');
});

test('429 is recorded and blocked without automatic paid route', async () => {
  let count = 0;
  const groq = new GroqFreeSpeech({
    env: freeEnv(),
    request: async () => { count++; return response('', 429); },
  });
  assert.equal(await groq.generate('a', 'b'), '');
  assert.equal(groq.lastError, 'groq-free-http-429');
  assert.equal(await groq.generate('a', 'b'), '');
  assert.equal(count, 1);
});

test('Provider reasoning and tool calls cannot be published as dialogue', async () => {
  const groq = new GroqFreeSpeech({
    env: freeEnv(),
    request: async () => response('<think>hidden analysis</think>Bonjour en français.'),
  });
  assert.equal(await groq.generate('cool', 'system'), 'Bonjour en français.');
});

test('French language faculty actually answers using Free Groq when embedded unavailable', async () => {
  const groq = new GroqFreeSpeech({
    env: freeEnv(),
    request: async () => response('Oui, c’est noté.'),
  });
  const ai = { federation: { enabled: false, snapshot: () => ({ enabled: false, zero_cost_mode: true }) } };
  const faculty = new FrenchLanguageFaculty(ai, { embedded: embeddedOff(), groq });
  const answer = await faculty.generate({ user_text: 'Cool', goal: 'accuser réception', act: 'répondre' });
  assert.equal(answer, 'Oui, c’est noté.');
  assert.equal(faculty.lastMode, 'groq-free-speech');
  const status = await faculty.status();
  assert.equal(status.verified_ready, true);
  assert.equal(status.last_backend, 'groq-free-verified-response');
});

test('Full expression pipeline uses actual Groq response, never the unavailable script', async () => {
  const groq = new GroqFreeSpeech({
    env: freeEnv(),
    request: async () => response('Oui, on peut avancer sur cette mission.'),
  });
  const ai = { federation: { enabled: false, snapshot: () => ({ enabled: false, zero_cost_mode: true }) } };
  const faculty = new FrenchLanguageFaculty(ai, { embedded: embeddedOff(), groq });
  const expression = new ExpressionLayer(ai, { deterministicReply: () => 'SECOURS DETERM' });
  expression.language = faculty;
  const answer = await expression.verbalize({
    user_text: 'Cool', goal: 'répondre naturellement', act: 'accusé de réception',
  });
  assert.equal(answer, 'Oui, on peut avancer sur cette mission.');
  assert.equal(expression.lastMode, 'french-language-faculty');
  assert.notEqual(answer, 'SECOURS DETERM');
});
