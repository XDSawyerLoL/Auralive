import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ActiveInferenceEngine } from '../src/active_inference.js';
import { NativePolicyLearner } from '../src/native_learning.js';

test('native learner becomes more cautious after repeated failures', () => {
  const learner = new NativePolicyLearner();
  let state = learner.defaultState();
  const initial = learner.inferenceParams(state);

  for (let i = 0; i < 8; i += 1) {
    state = learner.update(state, { ok: false, surprise: 0.7, risk: 0.8 });
  }

  const learned = learner.inferenceParams(state);
  assert.ok(learned.risk_weight > initial.risk_weight);
  assert.ok(learned.deep_threshold < initial.deep_threshold);
  assert.ok(learned.verified_threshold < initial.verified_threshold);
  assert.ok(learned.confidence_bias < initial.confidence_bias);
  assert.equal(state.failures, 8);
  assert.equal(state.observations, 8);
});

test('native learner remains bounded after many observations', () => {
  const learner = new NativePolicyLearner();
  let state = learner.defaultState();
  for (let i = 0; i < 500; i += 1) {
    state = learner.update(state, {
      ok: i % 5 !== 0,
      surprise: i % 7 === 0 ? 1 : 0.1,
      risk: i % 5 === 0 ? 1 : 0.05,
    });
  }
  const p = state.params;
  assert.ok(p.risk_weight >= 0.15 && p.risk_weight <= 0.55);
  assert.ok(p.deep_threshold >= 0.30 && p.deep_threshold <= 0.62);
  assert.ok(p.verified_threshold >= 0.58 && p.verified_threshold <= 0.86);
  assert.ok(p.confidence_bias >= -0.12 && p.confidence_bias <= 0.08);
});

test('active inference consumes learned policy parameters', () => {
  const engine = new ActiveInferenceEngine();
  const organism = {
    clarte: 0.62,
    stabilite: 0.62,
    intention_field: { potentials: { agir: 0.5, explorer: 0.48, silence: 0.46 } },
  };
  const baseline = engine.assess(organism, { novelty: 0.45, risk: 0.55 });
  const cautious = engine.assess(organism, {
    novelty: 0.45,
    risk: 0.55,
    policy: {
      risk_weight: 0.55,
      uncertainty_weight: 0.35,
      deep_threshold: 0.30,
      verified_threshold: 0.58,
    },
  });
  assert.ok(cautious.difficulty > baseline.difficulty);
  assert.ok(cautious.token_budget >= baseline.token_budget);
  assert.equal(cautious.learned_policy.weights.risk, 0.55);
});

test('kernel persists and reports native learning state', () => {
  const kernelSource = fs.readFileSync(new URL('../src/kernel.js', import.meta.url), 'utf8');
  assert.match(kernelSource, /new NativePolicyLearner\(\)/);
  assert.match(kernelSource, /native_learning: this\.nativeLearning\.defaultState\(\)/);
  assert.match(kernelSource, /this\.nativeLearning\.update/);
  assert.match(kernelSource, /native_learning: this\.nativeLearning\.diagnostic/);
  assert.match(kernelSource, /aura-unified-kernel-node-v3/);
});
