import test from 'node:test';
import assert from 'node:assert/strict';

import { CognitionEngine } from '../src/cognition.js';
import { ExpressionLayer } from '../src/expression.js';

test('expression uses deterministic wording only as an explicit emergency fallback', async () => {
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer({
    enabled: false,
    federation: { enabled: false, snapshot: () => ({ enabled: false, zero_cost_mode: true }) },
    bridge: null,
  }, cognition);
  const plan = cognition.planReply({
    text: 'Quel est le prochain jalon ?',
    soul: { current_intention: 'Tester le nouveau noyau', dominant_thought: '' },
    intentions: [{ statement: 'Tester le nouveau noyau', priority: 0.9 }],
    lessons: [],
    reflections: [{ next_action: 'Valider les tests.' }],
    work: [],
    privateView: true,
  });

  const answer = await expression.verbalize(plan);
  assert.match(answer, /Valider les tests/);
  const diagnostic = await expression.diagnostic();
  assert.equal(diagnostic.mode, 'degraded-deterministic-fallback');
  assert.equal(diagnostic.scripted_normal_path, false);
  assert.equal(diagnostic.fallback_count, 1);
});

test('normal French conversation is verbalized by the free language faculty, never by generic AI fallback', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    async generate() {
      throw new Error('generic ai.generate must not verbalize normal conversation');
    },
    federation: {
      enabled: true,
      snapshot() {
        return {
          enabled: true,
          zero_cost_mode: true,
          provider: 'openrouter-free',
        };
      },
      async generate(prompt, system, maxTokens, role) {
        calls.push({ prompt, system, maxTokens, role });
        return {
          answer: 'Je suis en train de valider le noyau, puis je passerai aux tests réels.',
          provider: 'openrouter',
          model: 'mistral/test:free',
          requestedModel: 'mistral/test:free',
          latencyMs: 12,
          costMicrounits: 0,
        };
      },
    },
    bridge: null,
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  const plan = {
    user_text: 'tu fais quoi ?',
    act: 'report_current_activity',
    goal: 'Expliquer naturellement mon activité actuelle.',
    facts: [
      'Foyer opérationnel : valider le noyau',
      'Prochaine action : lancer les tests réels',
    ],
    semantic_support: '',
    current_intention: 'stabiliser AURA',
    dominant_thought: 'validation',
    mood: 'concentrée',
    relationship: {},
    affect: {},
    executive: {},
    discourse: { move: 'question', topic_terms: ['faire'] },
    conversation_context: [
      { role: 'user', content: 'salut' },
      { role: 'assistant', content: 'Salut, je suis là.' },
      { role: 'user', content: 'tu fais quoi ?' },
    ],
  };

  const answer = await expression.verbalize(plan);
  assert.equal(answer, 'Je suis en train de valider le noyau, puis je passerai aux tests réels.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].role, 'french');
  assert.match(calls[0].system, /faculté linguistique française/i);
  assert.match(calls[0].prompt, /français naturel contemporain/i);
  assert.match(calls[0].prompt, /conversation/i);
  assert.match(calls[0].prompt, /valider le noyau/i);

  const diagnostic = await expression.diagnostic();
  assert.equal(diagnostic.natural_french_ready, true);
  assert.equal(diagnostic.mode, 'learned-language-model');
  assert.equal(diagnostic.last_mode, 'french-language-faculty');
  assert.equal(diagnostic.fallback_count, 0);
});

test('French faculty does not invent decisions and receives meaning rather than a scripted answer', async () => {
  let captured = null;
  const ai = {
    federation: {
      enabled: true,
      snapshot: () => ({ enabled: true, zero_cost_mode: true }),
      async generate(prompt, system, maxTokens, role) {
        captured = { prompt, system, maxTokens, role };
        return {
          answer: 'Oui, j’ai une question : quel niveau d’autonomie veux-tu que je privilégie ?',
          provider: 'openrouter',
          model: 'qwen/test:free',
          latencyMs: 9,
          costMicrounits: 0,
        };
      },
    },
    bridge: null,
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  const plan = {
    user_text: 'tu as des questions ?',
    act: 'ask_user_from_curiosity',
    goal: 'Poser une question pertinente.',
    facts: [
      'Foyer opérationnel : AURA',
      'Curiosité sociale : 82 %.',
    ],
    relationship: { social_curiosity: 0.82 },
    affect: {},
    executive: {},
    discourse: { move: 'social_curiosity' },
    conversation_context: [
      { role: 'assistant', content: 'Je travaille sur AURA.' },
      { role: 'user', content: 'tu as des questions ?' },
    ],
  };

  const answer = await expression.verbalize(plan);
  assert.match(answer, /quel niveau d’autonomie/i);
  const payloadLine = captured.prompt.split('\n').at(-1);
  const payload = JSON.parse(payloadLine);
  assert.equal(payload.speech_act, 'ask_user_from_curiosity');
  assert.deepEqual(payload.factual_constraints, plan.facts);
  assert.ok(Array.isArray(payload.conversation));
  assert.doesNotMatch(captured.prompt, /Oui\. J’en ai une :/);
  assert.match(captured.system, /ne dois jamais inventer/i);
});
