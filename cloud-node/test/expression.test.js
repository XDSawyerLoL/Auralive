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

test('core operational speech remains native even when a language model exists', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    provider: 'openai-compatible',
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
  assert.equal(answer, 'Intention prioritaire : valider le noyau.');
  assert.equal(calls.length, 0);
});


test('optional external language layer still requires first-person self-reference', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    provider: 'openai-compatible',
    async generate(prompt, system) {
      calls.push({ prompt, system });
      return 'Je peux apprendre à mieux te connaître.';
    },
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  await expression.verbalize({
    act: 'relationship',
    goal: 'Répondre sur la relation.',
    facts: ['Question relationnelle reçue.'],
    semantic_support: 'L’interlocuteur souhaite parler de la relation.',
    current_intention: '',
    dominant_thought: '',
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /première personne/i);
  assert.match(calls[0].system, /première personne/i);
  assert.match(calls[0].system, /AURA est/i);
});


test('expression prompt forbids unrelated operational leakage', async () => {
  const calls = [];
  const ai = {
    enabled: true,
    async generate(prompt, system) {
      calls.push({ prompt, system });
      return 'Oui, je peux apprendre à mieux te connaître à partir de ce que tu souhaites partager.';
    },
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  await expression.verbalize({
    act: 'relationship',
    goal: 'Répondre uniquement sur la relation.',
    facts: ['Question relationnelle reçue : Tu veux que je me présente ?'],
    semantic_support: 'L’interlocuteur propose de se présenter.',
    current_intention: '',
    dominant_thought: '',
  });
  assert.match(calls[0].prompt, /N’ajoute jamais une tâche en cours/i);
  assert.match(calls[0].prompt, /question porte sur l’interlocuteur ou la relation/i);
});


test('normal conversation rejects generic AI disclaimer and falls back to AURA state', async () => {
  const ai = {
    enabled: true,
    async generate() {
      return "En tant qu’intelligence artificielle, je n’ai pas de sentiments, mais je fonctionne correctement.";
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
  assert.doesNotMatch(answer, /en tant qu.*intelligence artificielle/i);
  assert.doesNotMatch(answer, /je n.ai pas de sentiments/i);
  assert.match(answer, /lumineuse/i);
});

test('optional language layer preserves natural paragraph rhythm on non-core acts', async () => {
  const ai = {
    enabled: true,
    provider: 'openai-compatible',
    async generate() {
      return 'Je suis attentive à ce que tu partages.\n\nJe garde le fil de notre échange.\nEt toi ?';
    },
  };
  const cognition = new CognitionEngine();
  const expression = new ExpressionLayer(ai, cognition);
  const answer = await expression.verbalize({
    act: 'relationship',
    goal: 'Répondre naturellement.',
    facts: ['Question relationnelle reçue.'],
    semantic_support: '',
    expressive_state: { mood: 'claire', clarity: 0.9 },
  });
  assert.match(answer, /\n\n/);
});
