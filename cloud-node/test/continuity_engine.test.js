import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { CognitionEngine } from '../src/cognition.js';

const kernelSource = fs.readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
const configSource = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');

test('native cognition treats continuity as an internal signal', () => {
  const cognition = new CognitionEngine();
  const result = cognition.reflect(
    {
      stimuli: [{
        type: 'aura.continuity.self',
        source: 'cognitive-continuity',
        payload: {
          reason: 'unfinished-work',
          focus: 'Poursuivre la mission de fiabilisation AURA',
          unfinished_work: true,
        },
      }],
      intentions: [{ statement: 'Fiabiliser AURA', priority: 0.9 }],
      lessons: [],
      outcomes: [],
      horizon: '',
      extra_text: '',
    },
    {
      current_intention: 'Fiabiliser AURA',
      organism: {},
      native_learning: { params: { confidence_bias: 0 } },
    },
    { trigger: 'continuity:unfinished-work', text: '' },
  );

  assert.equal(result.title, 'Continuité autonome');
  assert.match(result.summary, /sans attendre une interaction humaine/i);
  assert.match(result.next_action, /Poursuivre la mission de fiabilisation AURA/i);
  assert.equal(result.basis.continuity_signal, true);
  assert.equal(result.basis.continuity_unfinished_work, true);
});

test('kernel can self-trigger reflection without human or external stimulus', () => {
  assert.match(kernelSource, /prepareContinuityStimulus\(\)/);
  assert.match(kernelSource, /aura\.continuity\.self/);
  assert.match(kernelSource, /continuity\.due && underLimit/);
  assert.match(kernelSource, /last_autonomous_reflection_at/);
  assert.doesNotMatch(
    kernelSource,
    /const shouldReflect = force \|\| Boolean\(String\(text\)\.trim\(\)\) \|\| \(dueByTime && this\.stimuli\.length > 0 && underLimit\);/,
  );
});

test('continuous existence is enabled by default and separately budgeted', () => {
  assert.match(configSource, /continuityEnabled: bool\('AURA_CONTINUITY_ENABLED', true\)/);
  assert.match(configSource, /continuityReflectionSeconds: int\('AURA_CONTINUITY_REFLECTION_SECONDS', 600/);
  assert.match(configSource, /continuityMaxReflectionsPerHour: int\('AURA_CONTINUITY_MAX_REFLECTIONS_PER_HOUR', 4/);
});


test('private chat can report only persisted activity since the previous exchange', () => {
  const cognition = new CognitionEngine();
  const plan = cognition.planReply({
    text: "Qu'as-tu fait depuis notre dernier échange ?",
    soul: { current_intention: 'Piloter AURA', organism: {} },
    intentions: [],
    lessons: [],
    reflections: [],
    work: [],
    agenda: {},
    continuityReport: {
      since: '2026-10-06T06:00:00.000Z',
      event_count: 2,
      autonomous_event_count: 2,
      events: [
        { at: '2026-10-06T06:10:00.000Z', type: 'reflection', title: 'Continuité autonome', detail: 'Réévaluation du travail.' },
        { at: '2026-10-06T06:20:00.000Z', type: 'mission', title: 'Fiabiliser AURA', detail: 'running · progression 40%' },
      ],
    },
    recentMessages: [],
    privateView: true,
  });

  assert.equal(plan.act, 'report_continuity_history');
  assert.equal(plan.needs_semantic_support, false);
  const reply = cognition.deterministicReply(plan);
  assert.match(reply, /2 événements persistés/i);
  assert.match(reply, /Fiabiliser AURA/i);
});

test('absence report refuses to invent activity when the ledger is empty', () => {
  const cognition = new CognitionEngine();
  const plan = cognition.planReply({
    text: "Qu'as-tu fait depuis la dernière fois ?",
    soul: { current_intention: 'Piloter AURA', organism: {} },
    continuityReport: { since: '2026-10-06T06:00:00.000Z', event_count: 0, autonomous_event_count: 0, events: [] },
    privateView: true,
  });
  const reply = cognition.deterministicReply(plan);
  assert.match(reply, /aucune activité persistée/i);
  assert.match(reply, /plutôt que d’inventer/i);
});

test('kernel exposes a unified agenda and evidence-backed absence ledger', () => {
  assert.match(kernelSource, /async agendaSnapshot\(\)/);
  assert.match(kernelSource, /async activitySinceLastConversation\(/);
  assert.match(kernelSource, /has_real_activity/);
  const cognitionSource = fs.readFileSync(new URL('../src/cognition.js', import.meta.url), 'utf8');
  assert.match(cognitionSource, /Foyer opérationnel/);
});


test('intention lifecycle follows long-horizon mission state', async () => {
  const kernelSource = fs.readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
  const horizonSource = fs.readFileSync(new URL('../src/long_horizon.js', import.meta.url), 'utf8');

  assert.match(kernelSource, /async setIntentionStatus\(/);
  assert.match(kernelSource, /'working','waiting','blocked'/);
  assert.match(horizonSource, /mission-created/);
  assert.match(horizonSource, /mission-completed/);
  assert.match(horizonSource, /mission-failed/);
  assert.match(horizonSource, /mission-paused/);
  assert.match(horizonSource, /mission-resumed/);
  assert.match(horizonSource, /mission-cancelled/);
});
