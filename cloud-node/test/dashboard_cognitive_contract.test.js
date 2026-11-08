import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { DASHBOARD_HTML } from '../src/dashboard.js';
import { DASHBOARD_SCRIPT } from '../src/dashboard-runtime.js';

test('embedded dashboard browser JavaScript parses as real JavaScript', () => {
  assert.doesNotThrow(() => new Script(DASHBOARD_SCRIPT, { filename: 'aura-dashboard-runtime.js' }));
});

test('the single integrated workspace contains all interactive trace elements', () => {
  for (const id of [
    'cogGraph', 'cogState', 'cogDetail', 'cogDuration', 'cogEvents',
    'cogModeDialogue', 'cogModeAutonomy', 'cogReplay',
    'cogDiagnostics', 'auraDiagnostics', 'messages', 'message', 'send',
  ]) {
    const match = new RegExp('\\bid="' + id + '"', 'g');
    assert.equal([...DASHBOARD_HTML.matchAll(match)].length, 1, 'missing or duplicated id: ' + id);
  }
  assert.match(DASHBOARD_HTML, /cog-viewport/);
  assert.match(DASHBOARD_HTML, /prefers-reduced-motion/);
});

test('legacy decorative animation cannot start alongside the measured graph', () => {
  assert.doesNotMatch(DASHBOARD_SCRIPT, /try\s*\{\s*initLivingAuraScene\(\)/);
  assert.match(DASHBOARD_SCRIPT, /initCognitiveGraph\(\)/);
  assert.match(DASHBOARD_SCRIPT, /replayCognitiveTrace/);
});
