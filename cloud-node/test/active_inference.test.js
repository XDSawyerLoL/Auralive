import test from 'node:test';
import assert from 'node:assert/strict';

import { ActiveInferenceEngine } from '../src/active_inference.js';
import { AuraOrganism } from '../src/organism.js';

test('active inference spends more compute on ambiguous novel situations', () => {
  const engine = new ActiveInferenceEngine();
  const clear = engine.assess({
    clarte: 0.92,
    stabilite: 0.90,
    intention_field: { potentials: { agir: 1, explorer: 0.03, silence: 0.01 } },
  });
  const ambiguous = engine.assess({
    clarte: 0.45,
    stabilite: 0.52,
    intention_field: { potentials: { agir: 0.5, explorer: 0.49, silence: 0.48 } },
  }, { novelty: 0.8, risk: 0.5 });

  assert.ok(clear.difficulty < ambiguous.difficulty);
  assert.ok(clear.token_budget <= ambiguous.token_budget);
});

test('unlikely events produce greater surprise', () => {
  const engine = new ActiveInferenceEngine();
  assert.ok(engine.surprise(0.01) > engine.surprise(0.8));
});

test('plan score rewards information and penalizes risk/cost', () => {
  const engine = new ActiveInferenceEngine();
  const safe = engine.scorePlan({
    value: 0.7,
    informationGain: 0.8,
    coherence: 0.8,
    risk: 0.1,
    computeCost: 0.1,
  });
  const costly = engine.scorePlan({
    value: 0.7,
    informationGain: 0.2,
    coherence: 0.8,
    risk: 0.7,
    computeCost: 0.7,
  });
  assert.ok(safe > costly);
});


test('default AURA organism stays on native or fast compute', () => {
  const engine = new ActiveInferenceEngine();
  const organism = new AuraOrganism().defaultState();
  const assessment = engine.assess(organism);
  assert.ok(['native', 'fast'].includes(assessment.compute_tier));
  assert.ok(assessment.token_budget <= 180);
  assert.ok(assessment.difficulty < 0.45);
});
