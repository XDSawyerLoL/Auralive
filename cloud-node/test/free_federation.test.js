import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

import { isGuaranteedFreeOpenRouterModel } from '../src/free_federation.js';

function run(script, env = {}) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('..', import.meta.url).pathname,
    encoding: 'utf8',
    env: {
      ...process.env,
      DB_HOST: '',
      DB_USER: '',
      DB_PASSWORD: '',
      DB_NAME: '',
      DATABASE_URL: '',
      MYSQL_URL: '',
      ...env,
    },
  });
}

test('OpenRouter zero-cost allowlist accepts only intrinsically free model IDs', () => {
  assert.equal(isGuaranteedFreeOpenRouterModel('openrouter/free'), true);
  assert.equal(isGuaranteedFreeOpenRouterModel('nvidia/example:free'), true);
  assert.equal(isGuaranteedFreeOpenRouterModel('anthropic/claude-sonnet'), false);
  assert.equal(isGuaranteedFreeOpenRouterModel('openai/gpt-oss-120b'), false);
  assert.equal(isGuaranteedFreeOpenRouterModel(''), false);
});

test('AURA zero-cost federation can answer while AI_MODE stays off', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AI_MODE='off';
    process.env.AURA_FREE_FEDERATION_ENABLED='true';
    process.env.AURA_OPENROUTER_API_KEY='test-free-key';
    process.env.AURA_OPENROUTER_FREE_MODELS='openrouter/free';
    process.env.AURA_FREE_FEDERATION_MAX_REQUESTS_PER_DAY='45';

    let request=null;
    global.fetch=async(url, options={})=>{
      request={
        url:String(url),
        auth:String(options.headers?.Authorization || ''),
        body:JSON.parse(String(options.body || '{}')),
      };
      return new Response(JSON.stringify({
        id:'gen-test',
        model:'nvidia/nemotron-free-test',
        choices:[{message:{role:'assistant',content:'réponse gratuite'}}],
        usage:{prompt_tokens:12,completion_tokens:7,cost:0},
      }), {status:200,headers:{'content-type':'application/json'}});
    };

    const { AiClient }=await import('./src/ai.js');
    const ai=new AiClient(null);
    const answer=await ai.generate('question','system',128,'reasoning');
    console.log(JSON.stringify({answer,request,diag:ai.diagnostic()}));
  `;
  const result = run(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.answer, 'réponse gratuite');
  assert.equal(payload.request.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(payload.request.body.model, 'openrouter/free');
  assert.equal(payload.diag.provider, 'zero-cost-federation');
  assert.equal(payload.diag.zero_cost_mode, true);
  assert.equal(payload.diag.free_federation.financial_guard, 'intrinsically-free-models-only');
  assert.match(payload.diag.last_backend, /^zero-cost:openrouter:/);
  assert.doesNotMatch(JSON.stringify(payload.diag), /test-free-key/);
});

test('AURA refuses a non-free OpenRouter model before any network call', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AI_MODE='off';
    process.env.AURA_FREE_FEDERATION_ENABLED='true';
    process.env.AURA_OPENROUTER_API_KEY='test-key';
    process.env.AURA_OPENROUTER_FREE_MODELS='openai/gpt-oss-120b';
    global.fetch=async()=>{ throw new Error('NETWORK_MUST_NOT_RUN'); };
    const { AiClient }=await import('./src/ai.js');
    const ai=new AiClient(null);
    const answer=await ai.generate('question','system',64,'reasoning');
    console.log(JSON.stringify({enabled:ai.enabled,answer,diag:ai.diagnostic()}));
  `;
  const result = run(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.enabled, false);
  assert.equal(payload.answer, '');
  assert.deepEqual(payload.diag.free_federation.configured_models, []);
  assert.deepEqual(payload.diag.free_federation.rejected_models, ['openai/gpt-oss-120b']);
});

test('reported non-zero inference cost quarantines the free provider and never falls through to paid AI', () => {
  const script = `
    process.env.AURA_ZERO_COST_MODE='true';
    process.env.AI_MODE='off';
    process.env.AURA_FREE_FEDERATION_ENABLED='true';
    process.env.AURA_OPENROUTER_API_KEY='test-key';
    process.env.AURA_OPENROUTER_FREE_MODELS='openrouter/free';
    global.fetch=async()=>new Response(JSON.stringify({
      model:'unexpected-model',
      choices:[{message:{content:'must be discarded'}}],
      usage:{cost:0.001},
    }), {status:200,headers:{'content-type':'application/json'}});
    const { AiClient }=await import('./src/ai.js');
    const ai=new AiClient(null);
    const answer=await ai.generate('question','system',64,'reasoning');
    console.log(JSON.stringify({answer,diag:ai.diagnostic()}));
  `;
  const result = run(script);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.answer, '');
  assert.deepEqual(payload.diag.free_federation.quarantined, ['openrouter']);
  assert.match(payload.diag.free_federation.last_error, /ZERO_COST_INVARIANT_VIOLATION/);
  assert.equal(payload.diag.last_backend, 'zero-cost-federation-unavailable');
});
