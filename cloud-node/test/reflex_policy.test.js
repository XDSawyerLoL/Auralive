import test from 'node:test';
import assert from 'node:assert/strict';
import { routeReflex } from '../src/reflex_policy.js';
import { ActiveInferenceEngine } from '../src/active_inference.js';

test('ordinary decisions remain inexpensive without a hosted model', () => {
  const choice = routeReflex({ tier: 'native', risk: 0.02, novelty: 0.02, uncertainty: 0.02 });
  assert.equal(choice.tier, 'native');
  assert.equal(choice.external_api_required, false);
  assert.equal(choice.calibrated, false);
});
test('high-risk decisions escalate even when the base tier is native', () => {
  const choice = routeReflex({ tier: 'native', risk: 0.9 });
  assert.equal(choice.tier, 'verified');
  assert.equal(choice.needs_evidence, true);
  assert.equal(choice.escalated, true);
});
test('extreme novelty escalates to deep, never downgrades a verified tier', () => {
  assert.equal(routeReflex({ tier: 'fast', novelty: 0.92 }).tier, 'deep');
  assert.equal(routeReflex({ tier: 'verified', novelty: 0.03 }).tier, 'verified');
  assert.equal(routeReflex({ tier: 'unknown' }).tier, 'verified');
});
test('active inference exposes the real reflex decision without calibrated claim', () => {
  const result = new ActiveInferenceEngine().assess({ clarte: 0.99, stabilite: 0.99 }, { risk: 0.95 });
  assert.equal(result.compute_tier, 'verified');
  assert.equal(result.model_role, 'critic');
  assert.equal(result.token_budget, 1000);
  assert.equal(result.reflex.calibrated, false);
});
