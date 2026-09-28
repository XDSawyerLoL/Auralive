import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBlindDiscovery, CASE_ID } from '../evaluation/blind-discovery-evaluator.mjs';

test('Crow case never claims AGI from a single discovery event', () => {
  const report = evaluateBlindDiscovery({
    provenance:{target_not_named_by_user:true,target_not_hardcoded:true},
    discovery:{
      trace_ids:['trace-1'],
      alternatives:['other/repo'],
      selection_rationale:'Crow exposes a potentially additive local-agent capability.'
    },
    evaluation:{
      capability_hypothesis:'Test one additive capability only.',
      sandboxed:true,
      additive_capabilities:['candidate capability'],
      redundant_capabilities:['memory'],
      decision:'partial'
    }
  });
  assert.equal(report.case_id, CASE_ID);
  assert.equal(report.agentic_discovery_supported, true);
  assert.equal(report.transfer_generalization_supported, false);
  assert.equal(report.agi_proven, false);
  assert.equal(report.level, 'agentic_discovery_supported');
});

test('blind transfer requires novelty, changed conditions, reuse and second-attempt improvement', () => {
  const base = {
    provenance:{target_not_named_by_user:true,target_not_hardcoded:true},
    discovery:{
      trace_ids:['trace-1'],
      alternatives:['other/repo'],
      selection_rationale:'Relevant non-redundant candidate.'
    },
    evaluation:{
      capability_hypothesis:'Evaluate a bounded capability.',
      sandboxed:true,
      additive_capabilities:['capability'],
      redundant_capabilities:[],
      decision:'accept'
    },
    transfer:{
      target_not_named_in_prompt:true,
      novel_problem:true,
      conditions_changed:true,
      discovery_strategy_reused:true,
      second_attempt_improved:true,
      trace_ids:['transfer-1']
    }
  };
  const report = evaluateBlindDiscovery(base);
  assert.equal(report.transfer_generalization_supported, true);
  assert.equal(report.level, 'agi_supporting_evidence');
  assert.equal(report.agi_proven, false);
});

test('missing provenance keeps the verdict insufficient', () => {
  const report = evaluateBlindDiscovery({
    discovery:{trace_ids:['x'],selection_rationale:'something'},
    evaluation:{capability_hypothesis:'x',sandboxed:true,additive_capabilities:['x'],decision:'accept'}
  });
  assert.equal(report.level, 'insufficient_evidence');
  assert.equal(report.agi_proven, false);
});
