import test from 'node:test';
import assert from 'node:assert/strict';

import {
  constellationRoleScore,
  matchModelProfile,
  modelProfiles,
  modelRoutingPolicy,
} from '../src/model_constellation.js';
import { selectMoaAgents } from '../src/bridge.js';

test('curated constellation contains Qwen abliterated and Kimi K3', () => {
  const profiles = modelProfiles();
  const ids = profiles.map((item) => item.id);
  assert.ok(ids.includes('lukey03/Qwen3.5-9B-abliterated'));
  assert.ok(ids.includes('moonshotai/Kimi-K3'));

  const qwen = matchModelProfile('hf.co/lukey03/Qwen3.5-9B-abliterated');
  assert.equal(qwen?.kind, 'divergent-specialist');
  assert.ok(constellationRoleScore(qwen.id, 'divergent') > constellationRoleScore(qwen.id, 'critic'));
  assert.equal(modelRoutingPolicy(qwen.id).authority, 'proposal-only');

  const kimi = matchModelProfile('moonshotai/Kimi-K3');
  assert.equal(kimi?.kind, 'frontier-long-context-vision');
  assert.ok(constellationRoleScore(kimi.id, 'vision') >= 0.95);
  assert.ok(constellationRoleScore(kimi.id, 'long_context') >= 0.95);
});

test('mesh routing uses curated model strengths when workers do not advertise scorecards', () => {
  const workers = [
    {
      worker_id: 'w-qwen',
      reputation: 0.8,
      mesh_score: 0.7,
      resources: { models: ['lukey03/Qwen3.5-9B-abliterated'], model_scorecard: [] },
    },
    {
      worker_id: 'w-kimi',
      reputation: 0.8,
      mesh_score: 0.7,
      resources: { models: ['moonshotai/Kimi-K3'], model_scorecard: [] },
    },
    {
      worker_id: 'w-generic',
      reputation: 0.95,
      mesh_score: 0.95,
      resources: { models: ['generic-model'], model_scorecard: [] },
    },
  ];

  const divergent = selectMoaAgents(workers, 2, 'divergent');
  assert.equal(divergent[0].model, 'lukey03/Qwen3.5-9B-abliterated');
  assert.equal(divergent[0].routing_policy.authority, 'proposal-only');

  const vision = selectMoaAgents(workers, 2, 'vision');
  assert.equal(vision[0].model, 'moonshotai/Kimi-K3');
});
