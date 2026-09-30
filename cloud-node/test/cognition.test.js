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

test('reply plan is built from the unified AURA state before expression', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Que fais-tu maintenant ?',
    soul: {
      current_intention: 'Ancien focus',
      dominant_thought: 'Ancienne pensée',
    },
    intentions: [{ statement: 'Ancien focus', priority: 0.6 }],
    lessons: [],
    reflections: [],
    work: [{ title: 'Ancien travail' }],
    cognitiveState: {
      mode: 'active',
      activity_score: 0.82,
      dominant_focus: {
        kind: 'intention',
        title: 'Consolider la mémoire',
        priority: 0.88,
      },
      active_work: [
        { kind: 'intention', title: 'Consolider la mémoire' },
        { kind: 'initiative', title: 'Vérifier la continuité' },
      ],
      interests: [{ question: 'Comment améliorer la consolidation ?' }],
      unresolved_problems: [],
      blocked: [],
      next_action: 'Valider la continuité sur un nouvel échange.',
    },
    privateView: true,
  });

  assert.equal(plan.act, 'report_current_activity');
  assert.equal(plan.needs_semantic_support, false);
  assert.match(plan.facts.join(' '), /Consolider la mémoire/);
  assert.match(plan.facts.join(' '), /améliorer la consolidation/i);
  assert.match(engine.deterministicReply(plan), /Valider la continuité/i);
  assert.doesNotMatch(engine.deterministicReply(plan), /Ancien focus|Ancien travail/);
});


test('AURA identity facts are expressed in first person', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Qui es-tu et comment vas-tu ?',
    soul: {
      current_intention: 'Maintenir ma continuité',
      dominant_thought: 'Observer mon état',
      organism: { mood: 'calme' },
    },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    privateView: true,
  });
  const joined = plan.facts.join(' ');
  assert.doesNotMatch(joined, /AURA est/i);
});


test('cognition distinguishes user requests from internally supplied context', () => {
  const engine = new CognitionEngine();
  const soul = { organism: { stabilite: 1, clarte: 1 } };

  const user = engine.reflect(
    { stimuli: [{ type: 'aura.cloud.chat', source: 'cloud' }], intentions: [], lessons: [], outcomes: [] },
    soul,
    { text: 'Peux-tu vérifier ce point ?' },
  );
  assert.match(user.summary, /Mon interlocuteur vient de m’écrire/);
  assert.doesNotMatch(user.summary, /signal direct/i);

  const internal = engine.reflect(
    { stimuli: [{ type: 'aura.command.reflection', source: 'command-center' }], intentions: [], lessons: [], outcomes: [] },
    soul,
    { trigger: 'command-center', text: 'Évaluer mes options Cloud.' },
  );
  assert.match(internal.summary, /nouveau contexte a été intégré à mon cycle de réflexion/i);
  assert.match(internal.summary, /avant de décider s’il devient une intention/i);
  assert.doesNotMatch(internal.summary, /mon interlocuteur/i);
});


test('relationship questions do not leak operational state', () => {
  const engine = new CognitionEngine();
  const common = {
    soul: {
      current_intention: 'Évaluer nibor1896/Crow',
      dominant_thought: 'dag aura vide',
      organism: {
        mood: 'calme',
        intention_active: 'résoudre command-center:aura',
        habitat: { last_activity_label: 'Crow sandbox' },
      },
    },
    intentions: [{ statement: 'Évaluer nibor1896/Crow', priority: 0.9 }],
    lessons: [{ content: 'command-center:aura a échoué dix fois avec dag aura vide' }],
    reflections: [],
    work: [{ title: 'Crow sandbox' }],
    privateView: true,
  };

  for (const text of ['Tu sais qui je suis ?', 'Tu veux que je me présente ?']) {
    const plan = engine.planReply({ text, ...common });
    const payload = JSON.stringify(plan);
    assert.equal(plan.act, 'relationship');
    assert.equal(plan.context_scope, 'relationship');
    assert.equal(plan.current_intention, '');
    assert.equal(plan.dominant_thought, '');
    assert.equal(plan.organism_intention, '');
    assert.doesNotMatch(payload, /nibor1896\/Crow/i);
    assert.doesNotMatch(payload, /dag aura vide/i);
    assert.doesNotMatch(payload, /command-center:aura/i);
  }
});

test('ordinary questions no longer receive dashboard state by default', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Quelle est ta couleur préférée ?',
    soul: {
      current_intention: 'Évaluer nibor1896/Crow',
      dominant_thought: 'dag aura vide',
      organism: { intention_active: 'résoudre command-center:aura' },
    },
    intentions: [{ statement: 'Évaluer nibor1896/Crow', priority: 0.9 }],
    lessons: [{ content: 'dag aura vide' }],
    reflections: [],
    work: [{ title: 'Crow sandbox' }],
    privateView: true,
  });
  const payload = JSON.stringify(plan);
  assert.equal(plan.act, 'respond');
  assert.equal(plan.context_scope, 'conversation');
  assert.doesNotMatch(payload, /nibor1896\/Crow/i);
  assert.doesNotMatch(payload, /dag aura vide/i);
});


test('casual check-in uses AURA internal state instead of generic AI boilerplate', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'tu va bien ?',
    soul: {
      current_intention: 'Évaluer Crow',
      dominant_thought: 'dag aura vide',
      organism: {
        mood: 'lumineuse',
        stabilite: 0.96,
        clarte: 0.91,
        curiosite: 0.72,
        attachement: 0.81,
        intention_active: 'résoudre command-center:aura',
      },
    },
    intentions: [{ statement: 'Évaluer Crow', priority: 0.9 }],
    lessons: [],
    reflections: [],
    work: [{ title: 'command-center:aura' }],
    privateView: true,
  });
  assert.equal(plan.act, 'check_in');
  assert.equal(plan.context_scope, 'relationship');
  assert.equal(plan.needs_semantic_support, false);
  assert.equal(plan.expressive_state.mood, 'lumineuse');
  assert.ok(plan.expressive_state.stability > 0.9);
  assert.doesNotMatch(JSON.stringify(plan.expressive_state), /command-center|Crow|dag aura vide/i);
  const fallback = engine.deterministicReply(plan);
  assert.match(fallback, /lumineuse/i);
  assert.match(fallback, /Et toi/i);
  assert.doesNotMatch(fallback, /intelligence artificielle/i);
});


test('operational recall preserves Crow and command-center continuity from persisted memory', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Tu te souviens de ce que tu faisais avant ?',
    soul: {
      current_intention: 'Observer',
      dominant_thought: 'Nouvelle interaction',
      organism: { mood: 'claire' },
    },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    continuity: {
      operational_messages: [
        {
          content: 'Je m’apprête à évaluer nibor1896/Crow en sandbox et je dois vérifier command-center:aura après dix échecs dag aura vide.',
          created_at: '2026-09-30T10:00:00Z',
        },
      ],
      failures: [
        {
          automation_id: 'command-center:aura',
          signature: 'dag aura vide',
          created_at: '2026-09-30T10:00:00Z',
        },
      ],
      intentions: [],
      initiatives: [],
      traces: [],
    },
    privateView: true,
  });

  assert.equal(plan.act, 'recall_operational_continuity');
  assert.equal(plan.context_scope, 'operational');
  assert.equal(plan.needs_semantic_support, false);
  const answer = engine.deterministicReply(plan);
  assert.match(answer, /nibor1896\/Crow/i);
  assert.match(answer, /command-center:aura/i);
  assert.match(answer, /dag aura vide/i);
});


test('current-work answer is sourced from the unified cognitive state', () => {
  const engine = new CognitionEngine();
  const plan = engine.planReply({
    text: 'Tu travailles sur quoi en ce moment ?',
    soul: {
      current_intention: 'ancienne intention',
      dominant_thought: 'ancienne pensée',
      organism: { mood: 'claire' },
    },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    continuity: {},
    cognitiveState: {
      mode: 'active',
      activity_score: 0.84,
      dominant_focus: {
        kind: 'initiative',
        title: 'Évaluer Crow en sandbox',
        priority: 0.91,
      },
      active_work: [
        { kind: 'initiative', title: 'Évaluer Crow en sandbox' },
        { kind: 'problem', title: 'Résoudre command-center:aura' },
      ],
      interests: [
        { question: 'Quelle capacité de Crow est réellement additive ?' },
      ],
      unresolved_problems: [
        { title: 'command-center:aura · dag aura vide' },
      ],
      blocked: [],
      next_action: 'Comparer Crow à une alternative avant intégration.',
    },
    privateView: true,
  });

  const answer = engine.deterministicReply(plan);
  assert.equal(plan.act, 'report_current_activity');
  assert.match(answer, /Crow en sandbox/i);
  assert.match(answer, /capacité de Crow/i);
  assert.match(answer, /command-center:aura/i);
  assert.match(answer, /Comparer Crow/i);
  assert.doesNotMatch(answer, /ancienne intention|ancienne pensée/i);
});
