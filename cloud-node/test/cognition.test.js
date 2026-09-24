import test from 'node:test';
import assert from 'node:assert/strict';

import { CognitionEngine } from '../src/cognition.js';

test('native cognition derives a reflection without a language model', () => {
  const engine = new CognitionEngine();
  const result = engine.reflect({
    stimuli: [{ type: 'automation.failure', source: 'automation', payload: {} }],
    intentions: [{ statement: 'Maintenir la stabilité', priority: 0.9 }],
    lessons: [{ content: 'Vérifier avant de répéter.' }],
    outcomes: [{ ok: 0, signature: 'timeout-worker' }],
    horizon: '',
    extra_text: '',
  }, {
    current_intention: 'Maintenir la stabilité',
    pressure: 0.4,
  }, { trigger: 'test' });

  assert.equal(result.title, 'Stabilisation prioritaire');
  assert.match(result.next_action, /Vérifier/i);
  assert.equal(result.basis.restricted_authority, false);
  assert.ok(result.confidence >= 0.7);
});

test('reply plan is built from AURA state before expression', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Que fais-tu maintenant ?',
    soul: {
      current_intention: 'Consolider la mémoire',
      dominant_thought: 'Vérifier la continuité',
    },
    intentions: [{ statement: 'Consolider la mémoire', priority: 0.8 }],
    lessons: [],
    reflections: [],
    work: [{ title: 'Continuité cognitive' }],
    privateView: true,
  });

  assert.equal(plan.act, 'report_current_activity');
  assert.equal(plan.needs_semantic_support, false);
  assert.match(plan.facts.join(' '), /Consolider la mémoire/);
  assert.match(engine.deterministicReply(plan), /Pensée dominante|Travail prioritaire|Intention actuelle/);
});
