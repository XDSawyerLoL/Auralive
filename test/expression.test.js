import test from 'node:test';
import assert from 'node:assert/strict';

import { CognitionEngine } from '../src/cognition.js';
import { ExpressionLayer } from '../src/expression.js';

test('expression falls back to AURA-native wording without an LLM', async () => {
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer({ enabled: false }, cognition);
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
  assert.match(answer, /Tester le nouveau noyau/);
});

test('external model can never formulate AURA final reply', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    async generate(prompt, system) {
      calls.push({ prompt, system });
      return 'Texte externe qui ne doit jamais devenir la parole finale.';
    },
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  const plan = {
    act: 'report_next_step',
    goal: 'Présenter la prochaine étape.',
    facts: ['Intention prioritaire : valider le noyau.'],
    semantic_support: '',
    current_intention: 'valider le noyau',
    dominant_thought: 'stabilité',
  };

  const answer = await expression.verbalize(plan);
  assert.match(answer, /valider le noyau/i);
  assert.doesNotMatch(answer, /Texte externe/i);
  assert.equal(calls.length, 0);
  const diagnostic = expression.diagnostic();
  assert.equal(diagnostic.final_language_authority, 'aura-native-cognition');
  assert.equal(diagnostic.external_model_can_formulate_final_reply, false);
});
