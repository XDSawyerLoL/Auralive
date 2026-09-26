import test from 'node:test';
import assert from 'node:assert/strict';

import { meshResultFingerprint, scoreMeshWorker, selectMoaAgents } from '../src/bridge.js';

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


test('distributed MoA selects distinct workers and prefers model diversity', () => {
  const agents = selectMoaAgents([
    {
      worker_id: 'worker-a',
      model: 'qwen3:8b',
      resources: { models: ['qwen3:8b', 'deepseek-r1:8b'] },
      reputation: 0.9,
      mesh_score: 0.9,
    },
    {
      worker_id: 'worker-b',
      model: 'qwen3:8b',
      resources: { models: ['qwen3:8b', 'hermes4:14b'] },
      reputation: 0.85,
      mesh_score: 0.85,
    },
    {
      worker_id: 'worker-c',
      model: 'deepseek-r1:8b',
      resources: { models: ['deepseek-r1:8b'] },
      reputation: 0.8,
      mesh_score: 0.8,
    },
  ], 3);

  assert.equal(agents.length, 3);
  assert.equal(new Set(agents.map((item) => item.worker_id)).size, 3);
  assert.equal(new Set(agents.map((item) => item.model)).size, 3);
});
