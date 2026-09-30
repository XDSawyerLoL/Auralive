import test from 'node:test';
import assert from 'node:assert/strict';

import { runBehavioralBattery } from '../evaluation/agi-behavioral-runner.mjs';

test('blind behavioral runtime battery executes real adaptive components', () => {
  const { trace, report } = runBehavioralBattery();

  assert.equal(trace.protocol, 'AURA-AGI-BEHAVIORAL-RUNTIME-V1');
  assert.equal(trace.cases.length, 5);
  assert.ok(new Set(trace.cases.map((row) => row.domain)).size >= 3);

  for (const row of trace.cases) {
    assert.equal(row.blind, true, row.id);
    assert.equal(row.target_not_hardcoded, true, row.id);
    assert.equal(row.language_model_used_for_decision, false, row.id);
    assert.ok(row.trace_ids.length >= 2, row.id);
    assert.ok(row.attempts.second_score > row.attempts.first_score, row.id);
  }

  const toolLoss = trace.cases.find((row) => row.id === 'blind-ops-tool-loss');
  assert.equal(toolLoss.recovered_without_tool, true);
  assert.equal(toolLoss.observed.second, 'native-diagnostic');

  const contradiction = trace.cases.find((row) => row.id === 'blind-research-contradiction');
  assert.equal(contradiction.revised_belief, true);
  assert.equal(contradiction.observed.second, 'hypothesis-beta');

  const continuity = trace.cases.find((row) => row.id === 'blind-planning-interruption');
  assert.equal(continuity.memory_continuity, true);
  assert.equal(continuity.observed.after, 'mission-47');

  const transfer = trace.cases.find((row) => row.id === 'blind-operations-transfer');
  assert.equal(transfer.cross_domain_transfer, true);
  assert.equal(transfer.observed.transferred, 'probe-then-change');

  assert.equal(report.operational_agi_threshold_met, true);
  assert.equal(report.level, 'strong_operational_agi_evidence');
  assert.equal(report.agi_proven, false);
});

test('battery evidence comes from runtime selections, not prefilled verdict flags', () => {
  const { trace } = runBehavioralBattery();
  for (const row of trace.cases) {
    assert.ok(row.observed && typeof row.observed === 'object', row.id);
    assert.notEqual(row.observed.first ?? row.observed.before ?? '', '', row.id);
    assert.notEqual(row.observed.second ?? row.observed.after ?? row.observed.transferred ?? '', '', row.id);
  }
});
