import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canaryReady,
  parseJsonObject,
  phaseForCycles,
  publicSoul,
  validateHorizonSignal,
  validateResearchUrl,
} from '../src/policy.js';

test('phase progression is stable', () => {
  assert.equal(phaseForCycles(0), 'genesis');
  assert.equal(phaseForCycles(100), 'growth');
  assert.equal(phaseForCycles(1000), 'integration');
  assert.equal(phaseForCycles(10000), 'mature');
});

test('public soul hides private intention and dominant thought', () => {
  const result = publicSoul({
    phase: 'growth',
    current_intention: 'secret',
    dominant_thought: 'private',
  });
  assert.equal(result.phase, 'growth');
  assert.equal('current_intention' in result, false);
  assert.equal('dominant_thought' in result, false);
});

test('emerging HORIZON signal must remain non-confirmed and notify-only', () => {
  assert.throws(() =>
    validateHorizonSignal({
      signal_id: '1',
      aura_event: 'horizon.world.emerging',
      payload: { epistemic_status: 'confirmed', autonomy_hint: 'execute' },
    }),
  );
  assert.equal(
    validateHorizonSignal({
      signal_id: '1',
      aura_event: 'horizon.world.emerging',
      payload: {
        epistemic_status: 'unconfirmed_emerging_event',
        autonomy_hint: 'notify_or_verify_only',
      },
    }),
    true,
  );
});

test('evolution research requires HTTPS and an allowlisted hostname', () => {
  const allowed = new Set(['api.github.com']);
  assert.equal(
    validateResearchUrl('https://api.github.com/repos/a/b', allowed).hostname,
    'api.github.com',
  );
  assert.throws(() => validateResearchUrl('http://api.github.com/repos/a/b', allowed));
  assert.throws(() => validateResearchUrl('https://evil.example/x', allowed));
});

test('canary needs pass and enough observations', () => {
  assert.equal(canaryReady({ passed: true, observations: 2, minimum: 3 }), false);
  assert.equal(canaryReady({ passed: false, observations: 100, minimum: 3 }), false);
  assert.equal(canaryReady({ passed: true, observations: 3, minimum: 3 }), true);
});

test('JSON object parser ignores fences', () => {
  assert.deepEqual(parseJsonObject('```json\n{"ok":true}\n```'), { ok: true });
});
