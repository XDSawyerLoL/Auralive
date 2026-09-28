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
