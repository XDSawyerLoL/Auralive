import test from 'node:test';
import assert from 'node:assert/strict';

import { CognitionEngine } from '../src/cognition.js';
import { ExpressionLayer } from '../src/expression.js';

test('AURA conversational wording is native even when an external model is available', async () => {
  let calls = 0;
  const ai = {
    enabled: true,
    provider: 'openai-compatible',
    async generate() {
      calls += 1;
      return 'External model tried to speak.';
    },
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  const plan = cognition.planReply({
    text: 'tu va bien ?',
    soul: {
      organism: {
        mood: 'lumineuse',
        stabilite: 0.95,
        clarte: 0.92,
        curiosite: 0.7,
      },
    },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    privateView: true,
  });
  const answer = await expression.verbalize(plan);
  assert.equal(calls, 0);
  assert.match(answer, /lumineuse/i);
  assert.doesNotMatch(answer, /External model/i);
});

test('Gemini cannot provide semantic text support in V9', async () => {
  let calls = 0;
  const ai = {
    enabled: true,
    provider: 'google-gemini-tts-only',
    async generate() {
      calls += 1;
      return 'should not happen';
    },
  };
  const expression = new ExpressionLayer(ai, new CognitionEngine());
  const support = await expression.semanticSupport({
    needs_semantic_support: true,
    semantic_query: 'information externe',
  }, 'contexte');
  assert.equal(support, '');
  assert.equal(calls, 0);
});

test('non-Gemini external providers may return facts but never write the final answer', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    provider: 'quantic-studio-local-preferred',
    async generate(prompt, system) {
      calls.push({ prompt, system });
      return 'fait candidat';
    },
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  const support = await expression.semanticSupport({
    needs_semantic_support: true,
    semantic_query: 'question documentaire',
  }, 'contexte vérifié');
  assert.equal(support, 'fait candidat');
  assert.equal(calls.length, 1);

  const answer = await expression.verbalize({
    act: 'report_next_step',
    facts: ['Prochaine action : vérifier le test.'],
    semantic_support: support,
  });
  assert.equal(calls.length, 1);
  assert.match(answer, /Prochaine action/i);
});

test('diagnostic declares native expression and no Gemini text', () => {
  const expression = new ExpressionLayer({ enabled: false, provider: 'google-gemini-tts-only' }, new CognitionEngine());
  const diagnostic = expression.diagnostic();
  assert.equal(diagnostic.role, 'native-verbalisation');
  assert.equal(diagnostic.language_model_for_expression, false);
  assert.equal(diagnostic.gemini_text_allowed, false);
});
