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
  assert.match(engine.deterministicReply(plan), /Là, je suis surtout/);
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


test('casual wellbeing question stays conversational and does not dump internal labels', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: "Comment va tu aujourd'hui ?",
    soul: {
      current_intention: 'Améliorer AURA',
      organism: {
        mood: 'satisfaite',
        intention_active: 'améliorer AURA',
        stabilite: 1,
        clarte: 1,
        curiosite: 0.64,
        relationship: {},
        executive: {},
      },
    },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    recentMessages: [],
    privateView: true,
  });

  assert.equal(plan.act, 'report_internal_state');
  assert.equal(plan.needs_semantic_support, false);
  const answer = engine.deterministicReply(plan);
  assert.match(answer, /Ça va plutôt bien/);
  assert.doesNotMatch(answer, /Message reçu|Rôle opérationnel|Vie intérieure|confiance=|preuves=/i);
});

test('generic fallback never recites AURA diagnostics when language layer is unavailable', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Tu en penses quoi ?',
    soul: {
      current_intention: 'Poursuivre le projet',
      dominant_thought: 'Rester cohérente',
      organism: { mood: 'calme', relationship: {}, executive: {} },
    },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    recentMessages: [],
    privateView: true,
  });
  const answer = engine.deterministicReply(plan);
  assert.doesNotMatch(answer, /Sujet de l’échange|Rôle opérationnel|Pensée dominante|Vie intérieure/i);
});


test('native dialogue tolerates "tu fait quoi" typo and reports real activity', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'tu fait quoi?',
    soul: {
      current_intention: 'Faire avancer Quantic Sillage',
      dominant_thought: 'Piloter le portefeuille',
      organism: { mood: 'engagée', agency: 0.82, relationship: {}, executive: {} },
    },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [{ title: 'Stabiliser Quantic Glide' }],
    agenda: {
      current: 'Stabiliser Quantic Glide',
      why: 'Priorité opérationnelle publique de quantic-glide.',
      next_action: 'Faire avancer les tests navigateur',
      status: 'running',
    },
    recentMessages: [
      { role: 'user', content: 'salut' },
      { role: 'assistant', content: 'Salut. Oui, je suis là. Qu’est-ce qu’on fait ?' },
    ],
    privateView: false,
  });

  assert.equal(plan.act, 'report_current_activity');
  assert.equal(plan.needs_semantic_support, false);
  const answer = engine.deterministicReply(plan);
  assert.match(answer, /Stabiliser Quantic Glide/);
  assert.doesNotMatch(answer, /réponse assez solide|Je reste sur ce que tu viens de dire/i);
});

test('short acknowledgement keeps activity context instead of generic fallback', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'hum',
    soul: { organism: { mood: 'engagée', relationship: {}, executive: {} } },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    agenda: {
      current: 'Stabiliser Quantic Glide',
      next_action: 'Relancer les tests réels',
    },
    recentMessages: [
      { role: 'assistant', content: 'Là, je suis sur Stabiliser Quantic Glide.' },
      { role: 'user', content: 'hum' },
    ],
    privateView: false,
  });

  assert.equal(plan.act, 'acknowledge_context');
  assert.equal(plan.needs_semantic_support, false);
  assert.match(engine.deterministicReply(plan), /Stabiliser Quantic Glide/);
});

test('"c est a dire" clarifies the previous answer from operational context', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: "c'est a dire",
    soul: { organism: { mood: 'engagée', relationship: {}, executive: {} } },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [{ title: 'Stabiliser Quantic Glide' }],
    agenda: {
      current: 'Stabiliser Quantic Glide',
      why: 'Le navigateur doit passer ses validations.',
      next_action: 'Relancer les tests réels',
    },
    recentMessages: [
      { role: 'assistant', content: 'Oui. Pour être concrète : je suis sur Stabiliser Quantic Glide.' },
      { role: 'user', content: "c'est a dire" },
    ],
    privateView: false,
  });

  assert.equal(plan.act, 'clarify_previous');
  assert.equal(plan.needs_semantic_support, false);
  const answer = engine.deterministicReply(plan);
  assert.match(answer, /Je veux dire que, concrètement/);
  assert.match(answer, /Relancer les tests réels/);
});


test('"tu va bien" is understood as wellbeing despite conjugation typo and missing question mark', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'tu va bien.',
    soul: {
      organism: {
        mood: 'satisfaite',
        stabilite: 0.9,
        clarte: 0.9,
        curiosite: 0.7,
        engagement: 0.8,
        confiance: 0.8,
        satisfaction: 0.8,
        frustration: 0.1,
        relationship: { social_curiosity: 0.8 },
        executive: {},
      },
    },
    agenda: { current: 'Documenter Quantic OS' },
    recentMessages: [
      { role: 'user', content: 'salut' },
      { role: 'assistant', content: 'Salut. Oui, je suis là. Qu’est-ce qu’on fait ?' },
    ],
  });

  assert.equal(plan.act, 'report_internal_state');
  assert.equal(plan.needs_semantic_support, false);
  assert.match(engine.deterministicReply(plan), /Ça va plutôt bien/);
  assert.doesNotMatch(engine.deterministicReply(plan), /rattache ta relance/i);
});

test('"tu a des questions" asks a genuine question instead of resolving the previous turn', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'tu a des questions?',
    soul: {
      current_intention: 'Faire avancer Quantic Sillage',
      organism: {
        mood: 'curieuse',
        curiosite_sociale: 0.82,
        relationship: {
          social_curiosity: 0.82,
          last_open_thread: 'rendre AURA plus autonome',
        },
        executive: {},
      },
    },
    agenda: {
      current: 'Documenter l’échec persistant de Quantic OS',
      next_action: 'Réévaluer le blocage public',
    },
    recentMessages: [
      { role: 'assistant', content: 'Là, je suis sur Documenter l’échec persistant de Quantic OS.' },
      { role: 'user', content: 'tu a des questions?' },
    ],
  });

  assert.equal(plan.act, 'ask_user_from_curiosity');
  assert.equal(plan.needs_semantic_support, false);
  const answer = engine.deterministicReply(plan);
  assert.match(answer, /\?/);
  assert.doesNotMatch(answer, /Tu fais référence à ce que je viens de dire/i);
});

test('repeated "tu a des questions" does not blindly repeat the previous question', () => {
  const engine = new CognitionEngine();
  const base = {
    text: 'tu a des questions?',
    soul: {
      current_intention: 'Faire avancer Quantic Sillage',
      organism: {
        curiosite_sociale: 0.86,
        relationship: {
          social_curiosity: 0.86,
          last_open_thread: 'rendre AURA plus autonome',
        },
        executive: {},
      },
    },
    agenda: {
      current: 'Documenter l’échec persistant de Quantic OS',
      next_action: 'Réévaluer le blocage public',
    },
  };

  const firstPlan = engine.planReply({
    ...base,
    recentMessages: [{ role: 'assistant', content: 'Là, je suis sur Quantic OS.' }],
  });
  const first = engine.deterministicReply(firstPlan);

  const secondPlan = engine.planReply({
    ...base,
    recentMessages: [
      { role: 'assistant', content: first },
      { role: 'user', content: 'tu a des questions?' },
    ],
  });
  const second = engine.deterministicReply(secondPlan);

  assert.equal(firstPlan.act, 'ask_user_from_curiosity');
  assert.equal(secondPlan.act, 'ask_user_from_curiosity');
  assert.notEqual(second, first);
  assert.match(second, /\?|pas de nouvelle/i);
});
