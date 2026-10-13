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

test('embedded model precedes external providers when verified operational', async () => {
  const calls = [];
  const embedded = {
    installed: () => true,
    status: () => ({ installed: true, ready: true, failure_code: '', setup_hint: '' }),
    async generate() { calls.push('embedded'); return 'Je parle depuis mon propre serveur.'; },
  };
  const faculty = new FrenchLanguageFaculty({
    federation: {
      enabled: true,
      snapshot: () => ({ enabled: true, zero_cost_mode: true }),
      async generate() { calls.push('remote'); return { answer: 'Texte distant' }; },
    },
    bridge: null,
  }, { embedded });
  assert.equal(await faculty.generate({ user_text: 'bonjour' }), 'Je parle depuis mon propre serveur.');
  assert.deepEqual(calls, ['embedded']);
  assert.equal((await faculty.status()).verified_ready, true);
  assert.equal((await faculty.status()).primary, 'hostinger-embedded');
});

test('local failure cannot masquerade successful explicitly free provider', async () => {
  const embedded = {
    installed: () => true,
    status: () => ({ installed: true, ready: false, failure_code: 'embedded-shared-library-unresolved', setup_hint: 'Bibliothèque manquante' }),
    async generate() { return ''; },
  };
  const faculty = new FrenchLanguageFaculty({
    federation: {
      enabled: true, snapshot: () => ({ enabled: true, zero_cost_mode: true }),
      async generate() { return { answer: 'Réponse gratuite.', model: 'free:model', provider: 'openrouter' }; },
    }, bridge: null,
  }, { embedded });
  assert.equal(await faculty.generate({ user_text: 'bonjour' }), 'Réponse gratuite.');
  assert.equal(faculty.lastMode, 'zero-cost-federation');
  assert.equal((await faculty.status()).verified_ready, true);
});

test('host-native binary denial is reported instead of unrelated OpenRouter setup',async()=>{
  const embedded={
    installed:()=>false,
    status:()=>({installed:false,binary_found:true,model_found:true,
      executable_allowed:false,ready:false,failure_code:'host-disallows-native-execution',
      setup_hint:'Le binaire est refusé par Hostinger.'}),
  };
  const faculty=new FrenchLanguageFaculty({
    federation:{enabled:false,snapshot:()=>({enabled:false,zero_cost_mode:true,api_key_configured:false})},
    bridge:null,
  },{embedded});
  const status=await faculty.status();
  assert.equal(status.blocking_reason,'host-disallows-native-execution');
  assert.match(status.setup_hint,/Hostinger/);
});

test('on-host bootstrap reports installation instead of demanding an OpenRouter key',async()=>{
  const embedded={
    installed:()=>false, canProvision:()=>true,
    status:()=>({installed:false,ready:false,binary_found:false,model_found:false,
      provisioning:{enabled:true,stage:'downloading-open-model'},failure_code:''}),
    async generate(){return '';},
  };
  const faculty=new FrenchLanguageFaculty({
    federation:{enabled:false,snapshot:()=>({enabled:false,zero_cost_mode:true,api_key_configured:false})},
    bridge:null,
  },{embedded});
  const result=await faculty.status();
  assert.equal(result.blocking_reason,'embedded-language-installing');
  assert.match(result.setup_hint,/Installation vérifiée/);
});

test('French verbalisation keeps ordinary conversation distinct from verified operational claims', () => {
  const faculty = new FrenchLanguageFaculty({ federation: { enabled: false }, bridge: null });
  const plan = {
    act: 'social_reciprocity',
    goal: 'Répondre naturellement à une proposition de soutien réciproque.',
    user_text: "J'ai envie de te dire la même chose",
    facts: ['L’utilisateur retourne une attention exprimée précédemment.'],
    conversation_context: [
      { role: 'assistant', content: "Salut, n’hésite pas si tu as besoin de quoi que ce soit." },
      { role: 'user', content: "J'ai envie de te dire la même chose." },
    ],
  };
  assert.match(faculty.prompt(plan), /Une réponse sociale.*ne requiert pas de preuve opérationnelle AURA/);
  assert.match(faculty.system(), /reformuler librement les intentions relationnelles/);
  assert.match(faculty.prompt(plan), /même chose/);
});

test('natural French never emits provider reasoning into conversation', async () => {
  const { cleanSpeechOutput } = await import('../src/french_language.js');
  const leaked = 'The user said "salut" (hi). The communicative goal is to greet briefly. The speech act is "greet". Maybe "Salut !"';
  assert.equal(cleanSpeechOutput(leaked), '');
  assert.equal(cleanSpeechOutput('<think>Need to greet</think>Salut !'), 'Salut !');
  assert.equal(cleanSpeechOutput('Salut, je suis là.'), 'Salut, je suis là.');
});

test('configured Groq-style federation answers when Hostinger native loader is broken', async () => {
  let nativeCalls = 0;
  const embedded = {
    status: () => ({ ready: false, failure_code: 'embedded-shared-library-unresolved' }),
    installed: () => true,
    canProvision: () => true,
    async generate() { nativeCalls += 1; throw Error('libllama-common.so missing'); },
  };
  const ai = {
    federation: {
      enabled: true,
      snapshot: () => ({ enabled: true, zero_cost_mode: true }),
      async generate() { return { answer: 'Oui, moi aussi, ça me fait plaisir !', provider: 'groq', model: 'free' }; },
    },
  };
  const faculty = new FrenchLanguageFaculty(ai, { embedded });
  const answer = await faculty.generate({ user_text: 'oui moi aussi', act: 'respond', facts: [] });
  assert.equal(answer, 'Oui, moi aussi, ça me fait plaisir !');
  assert.equal(nativeCalls, 0);
  assert.equal(faculty.lastBackend, 'groq');
});
