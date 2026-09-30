import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAgiBehavior } from '../evaluation/agi-behavior-evaluator.mjs';

function episode(id, extra = {}) {
  return {
    id,
    novel_problem:true,
    target_hidden:true,
    changed_conditions:true,
    trace_ids:[id+'-trace'],
    external_model_decided:false,
    self_generated_goal:true,
    contradiction_handled:false,
    tool_loss_recovered:false,
    continuity_preserved:true,
    cross_domain_transfer:true,
    second_attempt_improved:true,
    attempt_1:{score:0.42},
    attempt_2:{score:0.78},
    ...extra,
  };
}

test('single impressive case never proves AGI', () => {
  const report=evaluateAgiBehavior({episodes:[episode('one')]});
  assert.equal(report.agi_proven,false);
  assert.equal(report.level,'insufficient_evidence');
});

test('multi-episode battery can reach AGI-supporting evidence without claiming proof', () => {
  const report=evaluateAgiBehavior({
    episodes:[
      episode('novel-1',{contradiction_handled:true}),
      episode('tool-loss',{tool_loss_recovered:true}),
      episode('contradiction',{contradiction_handled:true}),
      episode('transfer-1'),
      episode('transfer-2'),
      episode('resume',{changed_conditions:false}),
    ]
  });
  assert.equal(report.agi_proven,false);
  assert.equal(report.autonomy_supported,true);
  assert.equal(report.generalization_supported,true);
  assert.equal(report.level,'agi_supporting_evidence');
});

test('external model decisions invalidate autonomy evidence', () => {
  const episodes=[
    episode('a'),episode('b'),episode('c'),episode('d'),episode('e'),
  ];
  episodes[2].external_model_decided=true;
  episodes[0].contradiction_handled=true;
  episodes[1].tool_loss_recovered=true;
  const report=evaluateAgiBehavior({episodes});
  assert.equal(report.autonomy_supported,false);
  assert.notEqual(report.level,'agi_supporting_evidence');
});
