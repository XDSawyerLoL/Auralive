import test from 'node:test';
import assert from 'node:assert/strict';
import { Script } from 'node:vm';
import { DASHBOARD_HTML } from '../src/dashboard.js';
import { DASHBOARD_SCRIPT } from '../src/dashboard-runtime.js';
import { COGNITIVE_ATLAS_SCRIPT } from '../src/cognitive_atlas_runtime.js';
import { COGNITIVE_ATLAS_CSS, COGNITIVE_ATLAS_HTML } from '../src/cognitive_atlas_ui.js';

test('rich atlas browser code parses and is embedded only once', () => {
  assert.doesNotThrow(() => new Script(COGNITIVE_ATLAS_SCRIPT));
  assert.doesNotThrow(() => new Script(DASHBOARD_SCRIPT));
  assert.equal(DASHBOARD_SCRIPT.includes(COGNITIVE_ATLAS_SCRIPT), true);
  assert.equal(DASHBOARD_HTML.includes(COGNITIVE_ATLAS_HTML), true);
  assert.equal(DASHBOARD_HTML.includes(COGNITIVE_ATLAS_CSS), true);
  assert.equal([...DASHBOARD_HTML.matchAll(/id="cogGraph"/g)].length, 1);
});

test('every atlas action has matching interactive UI and implementation', () => {
  for (const control of [
    'cogModeDialogue', 'cogModeAutonomy', 'cogReplay', 'cogExport',
    'cogDiagnostics', 'cogZoomIn', 'cogZoomOut', 'cogZoomReset',
  ]) {
    assert.equal([...DASHBOARD_HTML.matchAll(new RegExp('id="' + control + '"','g'))].length, 1, control);
    assert.match(DASHBOARD_SCRIPT, new RegExp('\\$\\(\\\'' + control + '\\\'\\)'));
  }
  for (const result of ['cogStatsEvents','cogDuration','cogStatsErrors','cogStatsLatest',
    'cogDetailTitle','cogDetailState','cogDetail','cogStageTiming','cogMetrics','cogMetadata',
    'cogTimelineSummary','cogTraceSource','cogEvents']) {
    assert.ok(DASHBOARD_HTML.includes('id="' + result + '"'), result);
    assert.ok(DASHBOARD_SCRIPT.includes("'"+result+"'"), result);
  }
});

test('atlas shows measured source data, not synthetic token weights', () => {
  assert.match(COGNITIVE_ATLAS_SCRIPT, /duration_ms/);
  assert.match(COGNITIVE_ATLAS_SCRIPT, /elapsed_ms/);
  assert.match(COGNITIVE_ATLAS_SCRIPT, /state_stability/);
  assert.match(COGNITIVE_ATLAS_SCRIPT, /COG_AUTO_STAGES/);
  assert.match(COGNITIVE_ATLAS_SCRIPT, /function cogEventMatchesEdge/);
  assert.match(COGNITIVE_ATLAS_SCRIPT, /cogTrace\.events/);
  assert.match(COGNITIVE_ATLAS_SCRIPT, /function exportCognitiveTrace/);
  assert.doesNotMatch(COGNITIVE_ATLAS_SCRIPT, /Math\.random\(/);
  assert.doesNotMatch(COGNITIVE_ATLAS_SCRIPT, /faker|fakeActivation|fakeNeuron/i);
});

test('atlas degrades accessibly on mobile and never loses the conversation', () => {
  assert.match(COGNITIVE_ATLAS_CSS, /max-width:760px/);
  assert.match(COGNITIVE_ATLAS_CSS, /prefers-reduced-motion/);
  assert.match(DASHBOARD_SCRIPT, /initCognitiveGraph\(\);void loopCognitiveTrace\(\);\}catch\(error\)/);
  assert.match(DASHBOARD_HTML, /id="messages"/);
  assert.match(DASHBOARD_HTML, /id="send"/);
  assert.match(COGNITIVE_ATLAS_HTML, /aria-label="Inspection détaillée/);
});

test('measured context micro-processes are visible and inspectable', () => {
  for(const stage of ['context_intentions','context_lessons','context_reflections',
    'context_work','context_agenda','context_continuity','context_messages']) {
    assert.ok(COGNITIVE_ATLAS_SCRIPT.includes("id:'"+stage+"'"),stage);
    assert.ok(COGNITIVE_ATLAS_SCRIPT.includes("['context','"+stage+"']"),stage);
  }
  assert.match(COGNITIVE_ATLAS_SCRIPT,/stage\.micro\?24:48/);
  assert.match(COGNITIVE_ATLAS_CSS,/\.cog-node\.micro/);
});
