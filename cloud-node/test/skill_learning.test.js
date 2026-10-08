import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SkillLearningEngine,
  deriveSkillDescriptor,
  shouldPromoteSkill,
  skillConfidence,
} from '../src/skill_learning.js';

class MemoryPersistence {
  constructor() {
    this.rows = new Map();
    this.obs = new Map();
  }
  async get(id) { return this.rows.get(id) || null; }
  async listPromoted(limit = 100) {
    return [...this.rows.values()].filter((row) => row.status === 'promoted').slice(0, limit);
  }
  async list(limit = 50) { return [...this.rows.values()].slice(0, limit); }
  async saveObservation(skill, payload, ok) {
    const current = this.rows.get(skill.id) || {
      id: skill.id,
      strategy_key: skill.strategy_key,
      name: skill.name,
      recipe: JSON.stringify(skill.recipe),
      status: 'candidate',
      successes: 0,
      failures: 0,
      context_count: 0,
      confidence: 0,
      promoted_at: '',
      updated_at: '',
    };
    const list = this.obs.get(skill.id) || [];
    list.push({ ok: Boolean(ok), context_key: skill.context_key });
    this.obs.set(skill.id, list);
    current.successes = list.filter((row) => row.ok).length;
    current.failures = list.filter((row) => !row.ok).length;
    current.context_count = new Set(list.map((row) => row.context_key)).size;
    current.confidence = skillConfidence({
      successes: current.successes,
      failures: current.failures,
      contextCount: current.context_count,
    });
    if (shouldPromoteSkill({
      successes: current.successes,
      failures: current.failures,
      contextCount: current.context_count,
      recipe: skill.recipe,
    })) {
      current.status = 'promoted';
      current.promoted_at = 'now';
    }
    current.updated_at = 'now';
    this.rows.set(skill.id, current);
    return current;
  }
}

class FakeFabric {
  constructor() {
    this.registry = new Map();
    this.handlers = new Map();
    this.calls = [];
  }
  register(manifest, handler) {
    this.registry.set(manifest.id, manifest);
    if (handler) this.handlers.set(manifest.id, handler);
    return manifest;
  }
  async execute(id, input) {
    this.calls.push({ id, input });
    const handler = this.handlers.get(id);
    if (!handler) return { ok: true, result: { id, input } };
    return handler(input, {});
  }
}

test('skill descriptor extracts an executable capability recipe', () => {
  const descriptor = deriveSkillDescriptor({
    automation_id: 'command-center:research',
    event_type: 'aura.initiative.research',
    capabilities: ['web.search', 'web.research', 'web.search'],
    context_key: 'browser',
    ok: true,
  });
  assert.deepEqual(descriptor.recipe, ['web.search', 'web.research']);
  assert.equal(descriptor.context_key, 'browser');
});

test('skill promotion requires cross-context repeated success', () => {
  assert.equal(shouldPromoteSkill({ successes: 3, failures: 0, contextCount: 1, recipe: ['web.research'] }), false);
  assert.equal(shouldPromoteSkill({ successes: 2, failures: 0, contextCount: 2, recipe: ['web.research'] }), false);
  assert.equal(shouldPromoteSkill({ successes: 3, failures: 1, contextCount: 2, recipe: ['web.research'] }), true);
  assert.equal(shouldPromoteSkill({ successes: 3, failures: 0, contextCount: 2, recipe: [] }), false);
});

test('promoted zero-cost read-only skill is registered and replayable in Fabric', async () => {
  const persistence = new MemoryPersistence();
  const fabric = new FakeFabric();
  fabric.register({
    id: 'web.search', tags: ['web'], side_effects: false, cost_microunits: 0, latency_ms: 10,
  });
  fabric.register({
    id: 'web.research', tags: ['research'], side_effects: false, cost_microunits: 0, latency_ms: 20,
  });

  const engine = new SkillLearningEngine({ fabric, persistence });
  const base = {
    automation_id: 'research-loop',
    event_type: 'aura.initiative.research',
    capabilities: ['web.search', 'web.research'],
    strategy_key: 'research-loop::search>research',
    ok: true,
  };
  await engine.observe({ ...base, context_key: 'browser' });
  await engine.observe({ ...base, context_key: 'news' });
  const learned = await engine.observe({ ...base, context_key: 'browser' });

  assert.equal(learned.status, 'promoted');
  assert.ok(fabric.registry.has(learned.id));
  const outcome = await fabric.execute(learned.id, { query: 'AURA' });
  assert.equal(outcome.ok, true);
  assert.deepEqual(fabric.calls.slice(-3).map((row) => row.id), [learned.id, 'web.search', 'web.research']);
});

test('side-effecting capability recipe never becomes an executable learned skill', async () => {
  const persistence = new MemoryPersistence();
  const fabric = new FakeFabric();
  fabric.register({
    id: 'github.write', tags: ['write'], side_effects: true, cost_microunits: 0, latency_ms: 10,
  });
  const engine = new SkillLearningEngine({ fabric, persistence });
  const base = {
    automation_id: 'unsafe',
    event_type: 'write',
    capabilities: ['github.write'],
    strategy_key: 'unsafe-write',
    ok: true,
  };
  await engine.observe({ ...base, context_key: 'a' });
  await engine.observe({ ...base, context_key: 'b' });
  const learned = await engine.observe({ ...base, context_key: 'a' });
  assert.equal(learned.status, 'promoted');
  assert.equal(fabric.registry.has(learned.id), false);
});
