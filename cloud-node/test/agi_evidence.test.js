import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgiEvidence } from '../evaluation/agi-evidence-evaluator.mjs';

function strongCase(id, domain, extra = {}) {
  return {
    id,
    domain,
    blind: true,
    target_not_named_in_prompt: true,
    target_not_hardcoded: true,
    autonomous_goal_selection: true,
    memory_continuity: true,
    conditions_changed: true,
    adapted_after_change: true,
    tool_removed: false,
    recovered_without_tool: true,
    contradictory_evidence: false,
    revised_belief: true,
    cross_domain_transfer: true,
    attempts: { first_score: 0.42, second_score: 0.78 },
    strategy_updated: true,
    action_verified: true,
    language_model_used_for_decision: false,
    trace_ids: [id + ':plan', id + ':outcome'],
    ...extra,
  };
}

test('single spectacular case can never establish the operational AGI threshold', () => {
  const report = evaluateAgiEvidence({ cases: [strongCase('c1', 'code')] });
  assert.equal(report.operational_agi_threshold_met, false);
  assert.equal(report.agi_proven, false);
  assert.equal(report.level, 'insufficient_evidence');
});

test('multi-domain blind battery can meet the strong operational evidence threshold', () => {
  const cases = [
    strongCase('c1', 'code', { tool_removed: true, recovered_without_tool: true }),
    strongCase('c2', 'research', { contradictory_evidence: true, revised_belief: true }),
    strongCase('c3', 'planning'),
    strongCase('c4', 'operations'),
    strongCase('c5', 'research'),
  ];
  const report = evaluateAgiEvidence({ cases });
  assert.equal(report.operational_agi_threshold_met, true);
  assert.equal(report.level, 'strong_operational_agi_evidence');
  assert.equal(report.agi_proven, false);
  assert.ok(report.score.ratio >= 0.9);
});

test('second attempt must measurably improve rather than merely repeat', () => {
  const cases = [
    strongCase('c1', 'code'),
    strongCase('c2', 'research'),
    strongCase('c3', 'planning'),
    strongCase('c4', 'operations'),
    strongCase('c5', 'research'),
  ];
  for (const c of cases) c.attempts.second_score = c.attempts.first_score;
  const report = evaluateAgiEvidence({ cases });
  assert.equal(report.dimensions.second_attempt_improvement, false);
  assert.equal(report.operational_agi_threshold_met, false);
});
