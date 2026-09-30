import test from 'node:test';
import assert from 'node:assert/strict';

import { CognitiveStateModel } from '../src/cognitive_state.js';

test('unified cognitive state selects one dominant focus across initiatives, intentions and problems', () => {
  const model = new CognitiveStateModel();
  const state = model.build({
    soul: { current_intention: 'Explorer une piste', dominant_thought: 'Continuité' },
    organism: { mood: 'claire' },
    intentions: [
      { id: 'i1', statement: 'Explorer une piste', priority: 0.66, status: 'active', updated_at: new Date().toISOString() },
    ],
    work: [],
    curiosity: [
      { content: 'Pourquoi cette piste ?', priority: 0.6, created_at: new Date().toISOString(), context: {} },
    ],
    initiatives: [
      { id: 'a1', title: 'Corriger command-center:aura', objective: 'Résoudre dag aura vide', priority: 0.92, confidence: 0.94, status: 'running', updated_at: new Date().toISOString() },
    ],
    failures: [
      { automation_id: 'command-center:aura', signature: 'dag aura vide', count: 5, created_at: new Date().toISOString() },
    ],
    traces: [{ kind: 'action', title: 'Diagnostic', created_at: new Date().toISOString() }],
    neuralSignals: [{ id: 9, kind: 'reflection', source: 'reasoning', target: 'planning', label: 'Diagnostic', created_at: new Date().toISOString() }],
    bridgeStatus: { worker_online: true },
  });

  assert.equal(state.mode, 'active');
  assert.equal(state.dominant_focus.kind, 'initiative');
  assert.match(state.dominant_focus.title, /command-center/i);
  assert.ok(state.active_work.length >= 2);
  assert.ok(state.interests.length >= 1);
  assert.ok(state.unresolved_problems.some((row) => /dag aura vide/i.test(row.title)));
  assert.equal(state.autonomy.should_act, true);
  assert.equal(state.coherence.shared_state_ready, true);
});

test('unified state reports a real blocked condition instead of pretending to be active', () => {
  const model = new CognitiveStateModel();
  const state = model.build({
    organism: { mood: 'calme' },
    initiatives: [
      {
        id: 'w1',
        title: 'Reprendre la mission locale',
        objective: 'Attendre le worker local',
        priority: 0.9,
        confidence: 0.9,
        status: 'waiting',
        execution_mode: 'waiting-local-worker',
        updated_at: new Date().toISOString(),
      },
    ],
    bridgeStatus: { worker_online: false },
  });
  assert.equal(state.mode, 'blocked');
  assert.equal(state.autonomy.should_act, false);
  assert.equal(state.blocked.length, 1);
  assert.match(state.self_summary, /bloqué/i);
});

test('interest without active work is visible as idle curiosity rather than hidden inactivity', () => {
  const model = new CognitiveStateModel();
  const state = model.build({
    organism: { mood: 'curieuse' },
    curiosity: [
      {
        content: 'Quelle nouvelle capacité pourrait réduire une dépendance ?',
        priority: 0.77,
        created_at: new Date().toISOString(),
        context: { domain: 'aura-rd' },
      },
    ],
  });
  assert.equal(state.mode, 'idle');
  assert.equal(state.interests.length, 1);
  assert.match(state.next_action, /Explorer/i);
  assert.equal(state.autonomy.should_act, false);
});
