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

test('language model receives an already decided speech plan', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    async generate(prompt, system) {
      calls.push({ prompt, system });
      return 'Je poursuis la validation du noyau.';
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
  assert.equal(answer, 'Je poursuis la validation du noyau.');
  assert.equal(calls.length, 1);
  assert.match(calls[0].system, /pas son cerveau/i);
  assert.match(calls[0].prompt, /Tu n’as aucun droit de changer les faits/i);
});
