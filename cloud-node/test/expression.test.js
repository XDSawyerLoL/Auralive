import test from 'node:test';
import assert from 'node:assert/strict';

import { CognitionEngine } from '../src/cognition.js';
import { ExpressionLayer } from '../src/expression.js';

test('unavailable French faculty is explicit instead of pretending to have learned language', async () => {
  const expression = new ExpressionLayer({ enabled: false, federation: { enabled: false } }, new CognitionEngine());
  const answer = await expression.verbalize({ act: 'greet', user_text: 'salut', facts: [] });
  assert.match(answer, /faculté de français naturel est indisponible/);
  assert.equal(expression.diagnostic().scripted_normal_path, false);
  assert.equal(expression.diagnostic().fallback_mode, 'explicit-unavailable');
});

test('free French faculty verbalizes the decided semantic plan and scoped experiences', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    federation: {
      enabled: true,
      snapshot: () => ({ enabled: true, zero_cost_mode: true }),
      async generate(prompt, system, tokens, role) {
        calls.push({ prompt, system, tokens, role });
        return { answer: 'Je poursuis la validation du noyau.', model: 'free:model', provider: 'openrouter-free' };
      },
    },
  };
  const expression = new ExpressionLayer(ai, new CognitionEngine());
  const plan = {
    act: 'report_next_step',
    goal: 'Présenter la prochaine étape.',
    facts: ['Intention prioritaire : valider le noyau.'],
    current_intention: 'valider le noyau',
    dominant_thought: 'stabilité',
    experiential_memory: [{ kind: 'user-correction', note: 'Le dossier est vert.', evidence_status: 'user-statement-unverified' }],
  };
  const answer = await expression.verbalize(plan);
  assert.equal(answer, 'Je poursuis la validation du noyau.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].role, 'french');
  assert.match(calls[0].system, /faculté linguistique française/i);
  assert.match(calls[0].prompt, /validation du noyau/);
  assert.match(calls[0].prompt, /user-statement-unverified/);
  assert.equal(expression.diagnostic().scripted_normal_path, false);
});

test('semantic support remains separate from the language faculty and cannot set AURA intention', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    async generate(prompt, system) {
      calls.push({ prompt, system });
      return 'Appui externe avec incertitudes.';
    },
  };
  const expression = new ExpressionLayer(ai, new CognitionEngine());
  const support = await expression.semanticSupport({
    needs_semantic_support: true,
    semantic_query: 'une question de fait',
    external_evidence_required: true,
  }, 'contexte épistémique');
  assert.match(support, /Appui externe/);
  assert.match(calls[0].system, /outil sémantique externe/i);
  assert.match(calls[0].prompt, /Ne crée aucune intention/i);
});
