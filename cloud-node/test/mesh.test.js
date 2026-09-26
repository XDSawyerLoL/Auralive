import test from 'node:test';
import assert from 'node:assert/strict';

import { meshResultFingerprint, scoreMeshWorker } from '../src/bridge.js';

test('mesh worker score rewards reputation and useful resources', () => {
  const weak = scoreMeshWorker({
    reputation: 0.35,
    avg_latency_ms: 9000,
    resources: { cpu_threads: 2, ram_bytes: 2 * 1024 ** 3, gpu: '' },
  });
  const strong = scoreMeshWorker({
    reputation: 0.9,
    avg_latency_ms: 900,
    resources: { cpu_threads: 16, ram_bytes: 32 * 1024 ** 3, gpu: 'cuda' },
  });
  assert.ok(strong > weak);
});

test('mesh fingerprints compare deterministic compute values, not worker metadata', () => {
  const first = meshResultFingerprint('compute', {
    value: 32,
    engine: 'worker-a',
  });
  const second = meshResultFingerprint('compute', {
    value: 32,
    engine: 'worker-b',
  });
  assert.equal(first, second);
});

test('mesh inference fingerprints are based on the answer', () => {
  const first = meshResultFingerprint('inference', {
    answer: 'même réponse',
    diagnostic: { model: 'a' },
  });
  const second = meshResultFingerprint('inference', {
    answer: 'même réponse',
    diagnostic: { model: 'b' },
  });
  assert.equal(first, second);
});
