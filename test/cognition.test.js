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
  assert.match(plan.facts.join(' '), /Directrice de Quantic Sillage/);
  assert.match(engine.deterministicReply(plan), /travaille prioritairement|fais avancer/i);
});

test('reply plan carries relational and executive continuity', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: "J'ai l'impression que nos échanges sont trop robotiques.",
    soul: {
      role: 'directrice_operationnelle_quantic_sillage',
      organism: {
        mood: 'engagée',
        curiosite_sociale: 0.82,
        relationship: {
          familiarity: 0.72,
          trust: 0.70,
          social_curiosity: 0.82,
          interaction_count: 24,
          last_open_thread: 'Construire AURA comme Directrice de Quantic Sillage',
        },
        executive: { role: 'directrice_operationnelle', autonomy: 'proactive' },
      },
    },
    recentMessages: [
      { role: 'user', author: 'Créateur', content: 'On poursuit AURA.' },
    ],
    privateView: true,
  });
  assert.equal(plan.act, 'relationship_repair');
  assert.ok(plan.relationship.familiarity > 0.7);
  assert.equal(plan.executive.role, 'directrice_operationnelle');
  assert.equal(plan.conversation_context.length, 1);
});


test('native cognition infers an unseen affine rule without semantic support', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Règle inconnue VELA. f(3)=14, f(7)=30, f(11)=46. Sans recherche externe, déduis f(19).',
    soul: { current_intention: 'résoudre', organism: {} },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    recentMessages: [],
    privateView: true,
  });

  assert.equal(plan.act, 'solve_symbolic_rule');
  assert.equal(plan.needs_semantic_support, false);
  const answer = engine.deterministicReply(plan);
  assert.match(answer, /f\(n\) = 4\*n \+ 2/);
  assert.match(answer, /f\(19\) = 78/);
});

test('native cognition prefers the lowest polynomial degree that explains all examples', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Trouve la règle: f(0)=1, f(1)=4, f(2)=9, f(3)=16. Calcule f(5).',
    soul: { organism: {} },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    recentMessages: [],
    privateView: true,
  });

  assert.equal(plan.needs_semantic_support, false);
  const answer = engine.deterministicReply(plan);
  assert.match(answer, /n\^2 \+ 2\*n \+ 1/);
  assert.match(answer, /f\(5\) = 36/);
});

test('native symbolic cognition refuses inconsistent duplicate examples', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Règle inconnue. f(2)=5, f(2)=6, f(4)=9. Déduis f(8).',
    soul: { organism: {} },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    recentMessages: [],
    privateView: true,
  });

  assert.notEqual(plan.act, 'solve_symbolic_rule');
  assert.equal(plan.needs_semantic_support, true);
});


test('priority questions are answered natively from active intentions', () => {
  const engine = new CognitionEngine();
  const intentions = [
    { statement: 'Unifier conversation, intention et action', priority: 0.95 },
    { statement: 'Rendre le Cloud autonome', priority: 0.90 },
    { statement: 'Stabiliser la voix Mairaiy', priority: 0.86 },
  ];
  const plan = engine.planReply({
    text: 'Quelles sont tes trois priorités actuelles ?',
    soul: { organism: {} },
    intentions,
    lessons: [],
    reflections: [],
    work: [],
    recentMessages: [],
    privateView: true,
  });

  assert.equal(plan.act, 'report_priorities');
  assert.equal(plan.needs_semantic_support, false);
  const answer = engine.deterministicReply(plan);
  assert.match(answer, /1\).*Unifier conversation/i);
  assert.match(answer, /2\).*Rendre le Cloud autonome/i);
  assert.match(answer, /3\).*Stabiliser la voix Mairaiy/i);
});

test('short follow-up alors keeps the previous priorities thread', () => {
  const engine = new CognitionEngine();
  const intentions = [
    { statement: 'Priorité Alpha', priority: 0.95 },
    { statement: 'Priorité Bêta', priority: 0.90 },
    { statement: 'Priorité Gamma', priority: 0.85 },
  ];
  const plan = engine.planReply({
    text: 'alors ?',
    soul: { organism: {} },
    intentions,
    lessons: [],
    reflections: [],
    work: [],
    recentMessages: [
      { role: 'user', author: 'Créateur', content: 'Quelles sont tes trois priorités actuelles ?' },
      { role: 'assistant', author: 'AURA', content: 'Je vérifie mon état.' },
      { role: 'user', author: 'Créateur', content: 'alors ?' },
    ],
    privateView: true,
  });

  assert.equal(plan.act, 'report_priorities');
  assert.equal(plan.needs_semantic_support, false);
  assert.match(engine.deterministicReply(plan), /Priorité Alpha/);
});
