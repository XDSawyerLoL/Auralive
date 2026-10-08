import test from 'node:test';
import assert from 'node:assert/strict';

import { DialogueStateTracker } from '../src/dialogue_model.js';
import { CognitionEngine } from '../src/cognition.js';

test('dialogue state resolves anaphoric follow-up against previous assistant turn', () => {
  const tracker = new DialogueStateTracker();
  const frame = tracker.analyze('Et ça, pourquoi ?', [
    { role: 'user', content: 'Tu travailles sur quoi ?' },
    { role: 'assistant', content: 'Je stabilise Quantic Glide avant le prochain build Android.' },
  ]);
  assert.equal(frame.move, 'reference_followup');
  assert.match(frame.reference_text, /Quantic Glide/);
  assert.ok(frame.topic_terms.includes('quantic') || frame.topic_terms.includes('glide'));
});

test('dialogue state extracts correction target instead of treating it as a new topic', () => {
  const tracker = new DialogueStateTracker();
  const frame = tracker.analyze('Non, je parle de la voix Mairaiy.', [
    { role: 'assistant', content: 'Le dashboard est maintenant plus simple.' },
  ]);
  assert.equal(frame.move, 'correction');
  assert.match(frame.correction_target, /voix mairaiy/i);
});

test('cognition v2 repairs understanding without semantic model', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Non, je parle de la voix Mairaiy.',
    soul: { organism: { relationship: {}, executive: {} } },
    recentMessages: [
      { role: 'assistant', content: 'Le dashboard est maintenant plus simple.' },
      { role: 'user', content: 'Non, je parle de la voix Mairaiy.' },
    ],
  });
  assert.equal(plan.act, 'repair_understanding');
  assert.equal(plan.needs_semantic_support, false);
  assert.match(engine.deterministicReply(plan), /voix mairaiy/i);
});

test('cognition v2 keeps ambiguous short question attached to prior turn', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Et pourquoi ?',
    soul: { organism: { relationship: {}, executive: {} } },
    agenda: {
      current: 'Stabiliser Quantic Glide',
      next_action: 'Valider Android',
    },
    recentMessages: [
      { role: 'assistant', content: 'Je stabilise Quantic Glide avant le prochain build.' },
      { role: 'user', content: 'Et pourquoi ?' },
    ],
  });
  assert.equal(plan.act, 'resolve_reference_followup');
  assert.equal(plan.needs_semantic_support, false);
  assert.match(engine.deterministicReply(plan), /Stabiliser Quantic Glide|référence/i);
});


test('dialogue state classifies assistant wellbeing instead of generic statement', () => {
  const tracker = new DialogueStateTracker();
  const frame = tracker.analyze('tu va bien.', [
    { role: 'assistant', content: 'Salut. Oui, je suis là.' },
  ]);
  assert.equal(frame.move, 'wellbeing');
  assert.equal(frame.social_intent, 'wellbeing');
});

test('dialogue state classifies assistant curiosity instead of previous-turn reference', () => {
  const tracker = new DialogueStateTracker();
  const frame = tracker.analyze('tu a des questions?', [
    { role: 'assistant', content: 'Je travaille sur Quantic OS.' },
  ]);
  assert.equal(frame.move, 'social_curiosity');
  assert.equal(frame.social_intent, 'social_curiosity');
  assert.notEqual(frame.move, 'reference_followup');
});
