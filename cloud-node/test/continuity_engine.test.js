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
