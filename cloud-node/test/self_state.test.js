import test from 'node:test';
import assert from 'node:assert/strict';
import { composeUnifiedSelfState, UNIFIED_SELF_STATE_VERSION } from '../src/self_state.js';

test('unified self-state ranks active initiative, work, interests and open loops together', () => {
  const state = composeUnifiedSelfState({
    soul: { current_intention: 'Observer', curiosity: 0.72, continuity: 0.8 },
    organism: { mood: 'claire', curiosite: 0.72, stabilite: 0.84 },
    intentions: [{ id:'i1', statement:'Explorer Crow', priority:0.62, status:'active', source:'curiosity' }],
    initiatives: [{ id:'x1', title:'Diagnostiquer command-center', objective:'Résoudre dag aura vide', priority:0.91, status:'running' }],
    work: [{ kind:'activity', title:'Tester en sandbox', priority:0.66, status:'active' }],
    curiosity: [{ id:'q1', content:'Quelle capacité additive manque encore ?', context:{priority:0.55} }],
    failures: [{ automation_id:'command-center:aura', signature:'dag aura vide', created_at:'2026-09-30T10:00:00Z' }],
    traces: [{ kind:'reflection', title:'Diagnostic', created_at:'2026-09-30T10:01:00Z' }],
    reflections: [{ next_action:'Tester une stratégie différente.' }],
    bridge: { worker_online:false },
  });

  assert.equal(state.version, UNIFIED_SELF_STATE_VERSION);
  assert.ok(state.primary_goal);
  assert.match(state.primary_goal.statement, /dag aura vide|command-center/i);
  assert.ok(state.active_work.length >= 2);
  assert.ok(state.interests.some((row)=>/capacité additive/i.test(row.question)));
  assert.ok(state.open_loops.some((row)=>/command-center:aura/i.test(row.title)));
  assert.equal(state.next_action, 'Tester une stratégie différente.');
  assert.equal(state.autonomy.idle, false);
});

test('unified self-state reports idle only when there is truly no work, interest or open loop', () => {
  const state = composeUnifiedSelfState({
    soul: {},
    organism: { mood:'calme', curiosite:0.2, stabilite:0.9 },
    intentions: [],
    initiatives: [],
    work: [],
    curiosity: [],
    failures: [],
    traces: [],
    reflections: [],
    bridge: { worker_online:true },
  });
  assert.equal(state.primary_goal, null);
  assert.equal(state.autonomy.idle, true);
  assert.equal(state.autonomy.active, false);
});
